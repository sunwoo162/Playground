# Bloom Runtime Completion Adapter Design

Status: proposed for implementation
Date: 2026-09-04
Scope: connect Bloom Harness Evidence Completion Gate to live task-completion boundaries without replacing the existing Agent runtime report contract.

## Problem

Bloom Harness can now validate a `HarnessAgentResult` against structured `HarnessEvidence`, but the live orchestration paths still complete tasks from the legacy Agent report.

Today both `headlessBuilderExecutor.applyTaskResult()` and `store.completeAgentTask()` can turn `report.status === "completed"` into `ProjectTaskRun.status === "done"`. That `done` state immediately unlocks dependent tasks and later feeds the project merge gate.

The legacy report is not a Harness contract. It contains free-form `evidence: string[]` and Agent-declared `verification[]`. Treating those fields as proof would allow an Agent to satisfy a completion gate by claiming that tests or review passed without runtime evidence.

The runtime therefore needs a compatibility boundary that converts trusted execution observations into Harness contracts before `done` is allowed.

## Goals

1. Make `done` impossible unless the Harness Completion Gate accepts the task result.
2. Preserve the current Local Agent final-report JSON schema during the first migration step.
3. Generate required Harness evidence from runtime-observed facts rather than free-form Agent prose.
4. Apply the same policy to normal dispatch and interrupted-task recovery.
5. Prevent a rejected completion from unlocking dependencies or entering integration.
6. Keep the adapter reusable by both interactive/project-state and headless Builder orchestration.

## Non-goals

- Replacing `AgentTaskReport` or the Local Agent `finalReportContract()` in this change.
- Rewriting PM planning, scheduling, merge topology, or Git/GitHub publication.
- Treating free-form `report.evidence` strings as trusted Harness evidence.
- Enforcing every built-in Pack against every task before Pack selection is attached to live task execution.
- Adding deployment evidence in the first enforcement slice.

## Chosen approach

Use a Runtime Completion Adapter between the legacy runtime result and task-state mutation.

```text
Local Agent / Runtime bridge
        |
        v
legacy AgentTaskReport
        + runtime-owned observations
        |
        v
Runtime Completion Adapter
  |- safe command observation extraction
  |- publication evidence extraction
  |- review-target validation
  |- required-evidence policy
  `- Harness contract normalization
        |
        v
Evidence Completion Gate
    PASS | FAIL
         |
     done | blocked
```

This keeps the working Agent protocol stable while making Harness policy authoritative at the state-transition boundary.

## Alternatives considered

### Change Local Agent output to Harness contracts immediately

This would eventually be the cleanest protocol, but it changes the model response schema, parsing, recovery fixtures, and runtime bridge in one step. It creates unnecessary regression risk before the compatibility layer is proven.

### Check only at the project merge gate

This is too late. `refreshOrchestrationReadiness()` already treats `status === "done"` as dependency completion, so downstream tasks could execute from an invalid upstream completion before merge is blocked.

### Adapter at completion boundaries

This is selected. It enforces the invariant at the earliest shared state transition while preserving existing runtime execution.

## Trust model

Evidence is accepted according to who can produce the underlying fact.

- Agent prose is descriptive only. `report.evidence` and `report.verification` do not directly satisfy Harness evidence requirements.
- Tool execution facts come from the Local Agent runtime journal and tool results.
- Repository publication facts come from runtime-owned branch/commit/PR metadata after publication.
- Review evidence uses the Agent report only after the runtime proves the reviewed PR numbers belong to the task's declared dependency PR set.
- The completion boundary always re-runs `evaluateHarnessCompletion()`; it never trusts a precomputed `ready: true` flag.

A completed Agent report without a valid Harness packet fails closed.

## Runtime command observations

The current journal records `action: "run"` and a later `toolResult`, but deliberately drops command arguments. The adapter needs enough safe metadata to distinguish test/build evidence without persisting arbitrary command text.

For `run` actions, the Local Agent journal will record a normalized command class, not raw arguments or environment values:

```json
{"step":12,"action":"run","command":"pnpm","commandClass":"test","cwd":"."}
{"step":12,"toolResult":{"ok":true,"exitCode":0}}
```

Initial command classes are `test`, `build`, `lint`, `typecheck`, `install`, and `other`. Classification is deterministic from the already allow-listed executable plus safe subcommand tokens.

Evidence extraction pairs action and result by `step`.

- Every successful allowed run creates `command` evidence.
- The latest attempted `test` command creates `test` evidence only when it succeeded with exit code 0.
- The latest attempted `build` command creates `build` evidence only when it succeeded with exit code 0.
- A later failed test/build invalidates an earlier pass until a newer successful run exists.
- Raw stdout, stderr, credentials, environment variables, and arbitrary command arguments are not copied into Harness evidence.

Malformed or contradictory journal records fail closed when the affected evidence kind is required.

### Observation transport

The browser/project-state layer does not read runtime files directly. The existing Rust `agent_evidence_runtime` boundary already validates repository publication evidence and is shared by Tauri dispatch and the headless runtime. It is extended to read the runtime-owned journal and return a small `completionObservations` DTO with the task result.

The DTO contains only normalized command observations and verified publication metadata. It does not duplicate Harness contracts across Rust and TypeScript.

A completed normal-dispatch or recovered result must include `completionObservations`. Blocked results may omit them. Missing observations on a completed result fail closed at the TypeScript completion boundary.

The existing Rust writer verification remains authoritative for branch/commit/PR consistency; the adapter consumes the verified metadata rather than reimplementing Git/GitHub verification.

## Repository and review evidence

Repository-writing roles use the existing `REPOSITORY_WRITER_ROLES` definition rather than a second hard-coded writer list.

A `file-change` evidence record is generated only when a completed writer result has runtime-owned publication metadata proving a branch and commit exist. If a PR number and URL are also present, the adapter emits `github` evidence.

The Agent's free-form statement that files changed is not enough.

For `code-review` and `reviewer` roles, `review` evidence requires all of the following:

1. `reviewedPullRequests` is non-empty.
2. Every reviewed PR number is present in the current task's declared dependency PR set.
3. The task result is otherwise structurally valid and not blocked.

A review task that claims an unrelated PR is rejected rather than silently dropping the invalid target.

For `qa` and `test-automation`, `test` evidence must come from a successful runtime-observed test command. Agent-declared `verification: passed` without such a command cannot satisfy the Gate.

Deployment evidence remains deferred until the deployment Pack is wired to a trusted deployment observation source.

## Required-evidence policy

The first live enforcement slice uses a conservative role baseline:

- repository writers: `file-change`
- `code-review` and `reviewer`: `review`
- `qa` and `test-automation`: `test`
- other roles: no additional role baseline yet

When live Pack selection later supplies task-level required evidence, the effective requirement becomes the de-duplicated union of the role baseline and Pack requirements.

`BUG_FIX_PACK.requiredEvidence` is not globally applied to unrelated tasks before that Pack-to-task binding exists.

## Harness completion packet

The adapter produces a runtime-owned packet containing the candidate Harness result, normalized evidence, and required evidence kinds. The task-state mutation layer re-evaluates the packet with the existing Completion Gate.

Conceptually:

```ts
type RuntimeHarnessCompletionPacket = {
  result: HarnessAgentResult;
  evidence: HarnessEvidence[];
  requiredEvidence: HarnessEvidenceKind[];
};
```

The packet does not contain an authoritative `ready` boolean. Readiness is always recomputed from its contents at the completion boundary.

Evidence IDs are deterministic within a task. Runtime command evidence uses the task ID, evidence kind, and journal step; publication/review evidence uses the task ID, evidence kind, and verified source identity. The adapter de-duplicates the same source observation, while conflicting duplicate IDs remain an error handled by the existing Gate.

`HarnessAgentResult` normalization uses the legacy report for descriptive fields only:

- `status`: `done` only for legacy `completed`; otherwise `blocked`
- `summary`: legacy report summary
- `changedFiles`: empty until trusted changed-path capture is added
- `commandsExecuted`: safe normalized command labels observed by the runtime
- `evidenceIds`: IDs of evidence created by the adapter
- `risks`: empty in this slice
- `unresolvedIssues`: legacy blockers
- `nextActions`: empty in this slice

Empty descriptive arrays are valid; they must not be fabricated merely to make a result look richer.

## Completion state transition

The adapter is enforced before any task becomes `done`.

For both normal execution and recovered execution:

1. Runtime returns the legacy task result plus runtime-owned completion observations.
2. The adapter builds the Harness completion packet.
3. The completion boundary calls `evaluateHarnessCompletion()`.
4. On PASS, existing result fields are applied and the task becomes `done`.
5. On FAIL, existing result fields are preserved for audit, but the task becomes `blocked` and `lastError` contains a deterministic Harness rejection reason.
6. Dependency readiness is refreshed only after the accepted/rejected status is stored.

The same rule applies to the headless Builder path and the project-state/store path. Recovery must not call a legacy completion function that bypasses the adapter.

A writer may already have a branch, commit, or PR when a later evidence requirement fails. Those publication fields remain visible for diagnosis, but the task is still blocked and its dependents stay closed.

## Error handling

- A legacy `blocked` result stays blocked without attempting to manufacture evidence.
- A legacy `completed` result with no Harness packet is rejected after enforcement is enabled.
- Missing required runtime journal data is a completion rejection, not a worker crash.
- Invalid Harness contracts still throw through the existing validators because contract corruption is a programming/data-integrity error.
- Duplicate evidence IDs remain fail-closed through `harnessCompletionGate`.
- Review targets outside declared dependency PRs are rejected.
- Failed or missing latest required test/build observations produce missing evidence rather than a positive evidence record.
- Existing task output, branch/PR metadata, summary, blockers, and journal paths are retained on rejection for debugging and recovery.

## Implementation boundaries

The implementation should introduce one focused runtime-completion module instead of embedding conversion logic separately in each orchestrator.

Expected responsibilities:

- classify safe Local Agent run observations
- collect trusted task-completion observations
- derive role-based required evidence
- normalize legacy task results into Harness contracts
- produce deterministic rejection messages

Existing `harnessCompletionGate.ts` remains the source of truth for final readiness.

`bloomLocalAgentRuntime.ts` changes only enough to journal safe run classification metadata. It does not change the model's final-report schema in this slice.

`headlessBuilderExecutor.ts` and the project-state completion path must call the shared adapter before setting `done`. `sessionReconciliation.ts` and headless interrupted-run reconciliation must route recovered results through the same enforcement path.

The existing merge gate remains a second, project-level defense; it is not removed or weakened.

## Testing strategy

TDD is required for the implementation.

- command observation tests: safe classification, no raw secret-like arguments, action/result pairing by step
- evidence extraction tests: latest test pass/fail semantics and build semantics
- writer tests: Agent claims cannot create `file-change`; runtime branch+commit can
- review tests: dependency PRs pass; unrelated claimed PRs fail
- QA tests: `verification: passed` without observed successful test is rejected
- completion tests: accepted packet becomes `done`; missing evidence becomes `blocked`
- dependency tests: rejected upstream completion does not unlock downstream tasks
- recovery tests: recovered result is subject to the exact same Gate
- merge tests: rejected task cannot make the project merge-ready

The normal Bloom policy suite, native Linux policy run, `build:bloom-worker`, `git diff --check`, and GitHub Harness workflow remain required before merge.

## Rollout

1. Add safe runtime command observation metadata and its tests.
2. Add the pure Runtime Completion Adapter and role baseline policy.
3. Wire headless normal dispatch and interrupted recovery through the Gate.
4. Wire project-state completion and session recovery through the same Gate.
5. Run the full policy suite and a clean local E2E that includes at least one repository writer and one QA/test path.
6. Only after this enforcement is stable, attach live Pack-required evidence and migrate the Local Agent final protocol toward native Harness contracts.

There is no compatibility mode in which a newly completed task may silently bypass the Gate after its path is migrated. Existing already-persisted `done` tasks are not retroactively rewritten.

## Success criteria

This design is implemented successfully when:

- Agent `completed` alone cannot produce `ProjectTaskRun.status === "done"`;
- free-form evidence or `verification: passed` cannot fake test/build/file-change proof;
- a trusted writer branch+commit can satisfy `file-change` evidence;
- a QA/test task needs a successful runtime-observed latest test command;
- a review task cannot claim a PR outside its dependency set;
- Gate rejection leaves the task blocked and downstream dependencies unopened;
- normal dispatch and interrupted recovery share the same enforcement rule;
- the project merge gate remains an additional defense;
- the Local Agent final-report schema remains backward compatible for this slice.

## YAGNI boundary

Do not add a new evidence database, a second merge engine, remote policy distribution, arbitrary evidence plugins, or a full Local Agent protocol rewrite in this change. The objective is one trustworthy compatibility boundary that makes the already-built Harness Completion Gate authoritative in live orchestration.
