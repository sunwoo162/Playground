# Bloom Live Pack Binding Design

## Status

Approved design for the next Bloom Harness v1 phase after Runtime Completion Adapter.

## Goal

Connect the existing Harness pack registry to live Bloom project execution without replacing the current PM/orchestration runtime.
A matched pack becomes a durable project-level contract that constrains PM planning and final project completion.

The first supported live pack is `bug-fix`.

## Design principles

- Bind packs at the project/run level, not independently per task.
- Keep task completion evidence role-specific through the existing Runtime Completion Adapter.
- Enforce pack-wide requirements again at the project boundary.
- Never silently invent missing PM tasks to satisfy a pack.
- Never guess an unsupported default pack.
- Preserve existing feature-development behavior while only `bug-fix` exists.
- Persist enough binding data for recovery and future evaluator use.
## Resolution model

Pack resolution happens before PM planning.

Resolution has three outcomes:

1. `bound`
   - An explicit supported pack is requested, or the request deterministically matches a supported pack.
   - The resolved pack snapshot is attached to the project execution.
2. `unbound`
   - No supported pack matches the request and no explicit pack was requested.
   - Bloom continues with the existing Runtime Completion Gate only.
   - No default pack is guessed.
3. `blocked`
   - An explicit pack identifier was requested but is unknown or unsupported.
   - The project does not proceed to PM planning.

This prevents the single existing `bug-fix` pack from accidentally blocking unrelated feature work while still making explicit pack selection fail closed.

## Binding contract

Introduce a project-level `HarnessPackBinding` containing:

- contract version
- binding status: `bound | unbound | blocked`
- pack id/version when bound
- resolution reason
- resolution source: `explicit | intent | none`
- immutable pack snapshot when bound: required roles, stages, and required evidence

The snapshot, not a later registry lookup, is authoritative for resumed execution.

Live runtime inputs may provide an optional `harnessPackId`. Existing callers omit it and remain backward compatible. Desktop `StartProjectRuntimeInput` and headless `BuilderWorkerClaim` accept the optional field; when absent, resolution uses request intent only. The Builder backend does not need to emit the field for this phase.

The bug-fix intent matcher retains the existing English bug/fix/error/crash/failure/regression vocabulary and adds conservative Korean bug terms: `버그`, `오류`, `에러`, `크래시`, `회귀`, `고쳐`, and `고치`. Broad words such as `수정` do not infer bug-fix by themselves.

## Binding lifecycle

Resolution runs exactly once for a fresh project immediately before PM planning.

- Desktop stores the result on `ProjectState` before invoking PM.
- Headless stores the result in the fresh builder orchestration snapshot before invoking PM.
- Bound, unbound, and blocked outcomes are all persisted.
- Resume/recovery validates the stored binding version and reuses it unchanged.
- Recovery must never call `resolveHarnessPack()` for a project that already has a binding.
- Legacy desktop projects or Builder snapshots that predate this field migrate once to an explicit `unbound` legacy binding; they are never re-inferred from the current registry.

A blocked explicit-pack resolution therefore becomes a durable Harness failure rather than a transient parser error.


## Plan validation

After PM produces a plan and after the existing deterministic preparation steps run, the prepared plan is validated against the bound pack.

For `bug-fix`, validation checks that the plan can represent the pack workflow without requiring Runtime-generated tasks. At minimum it must contain the pack-required role coverage and a valid review/QA topology compatible with the existing orchestration rules.

Pack stages are semantic requirements, not one-to-one task identifiers. The validator maps required stages to observable plan responsibilities instead of demanding task slugs named `reproduce`, `root-cause`, and so on.

If a bound plan does not satisfy the pack:

- do not dispatch Agent tasks;
- do not inject replacement tasks inside Runtime;
- return structured pack validation failures to the PM repair/replan boundary;
- include the missing roles/responsibilities and pack id in the repair prompt;
- consume the existing bounded PM repair budget;
- fail closed if the repaired plan still violates the pack.

This keeps task ownership with PM and avoids a second hidden planner inside Harness.

## Bug-fix semantic stage mapping

The `bug-fix` pack stages are enforced by stable runtime semantics rather than task names or natural-language keyword matching:

- `reproduce` + `root-cause`: a `debug-router` task is present.
- `fix`: at least one repository-writing implementation task exists downstream of `debug-router`; mandatory governance writers (`data-marketing`, `documentation`) do not satisfy this stage.
- `review`: `code-review` and `reviewer` tasks exist in valid downstream topology.
- `qa`: a downstream `qa` task exists.
- `regression-test`: final trusted `test` evidence is required by the pack completion gate.

`BUG_FIX_PACK.requiredRoles` remains authoritative. The additional implementation-writer requirement represents the semantic `fix` stage without hard-coding frontend/backend, while excluding automatically injected governance work from falsely satisfying the pack.

## Planning execution

Create shared pure TypeScript pack helpers used by desktop and headless execution: resolver, PM planning context, prepared-plan validator, and project completion gate.

Each runtime keeps ownership of its existing PM side effects and retry loop. Both callers pass the original request plus the stored `HarnessPackBinding` through the same planning context and validator, so policy stays identical without coupling the two runtimes.

- Headless reuses the existing `planProjectWithRepair` retry boundary.
- Desktop switches from the combined `start_project_runtime` path to the already-existing `plan_project_runtime` command followed by repository bootstrap only after the validated plan is accepted.
- Pack constraints are appended as internal PM planning context, not Product Owner requirements.
- An invalid repaired plan fails before repository bootstrap or Agent dispatch.

## Trusted task evidence persistence

Project-level pack completion must not rebuild evidence from legacy Agent report strings.
The accepted Runtime Completion Adapter packet is the trusted source.

Extend `ProjectTaskRun` with an optional persisted Harness completion record containing:

- accepted boolean
- structured Harness evidence generated by Runtime
- role-level required evidence kinds
- rejection reason when blocked

The field is optional for backward compatibility with existing persisted project snapshots.
New completed task runs must persist it.

Both `store.completeAgentTask()` and headless `applyTaskResult()` already share `applyRuntimeCompletionToTaskRun()`; that function becomes the single place that stores the trusted completion record.

Rejected task completion may persist its record for diagnostics, but only evidence from accepted task completions can satisfy a project pack gate.
## Project pack completion gate

Add a pure `evaluateBoundProjectCompletion()` policy.

For an unbound project, the policy returns ready once the existing orchestration completion rules are satisfied.
For a bound project it:

1. requires every task run to be `done`;
2. reads only accepted persisted Harness completion records;
3. flattens their structured evidence;
4. rejects duplicate evidence ids;
5. evaluates the bound pack snapshot's `requiredEvidence` against the aggregate evidence;
6. returns structured missing kinds/ids and a human-readable rejection reason.

For `bug-fix`, project completion therefore requires at least trusted `file-change`, `review`, and `test` evidence somewhere in the accepted task graph.

The project gate runs before:

- desktop/store transition from all task runs done to `review`;
- headless `evaluateProjectMergeGate()` and any PR merge side effect.

Pack failure sets the project/headless snapshot blocked with a Harness-specific reason. Desktop adds `harness` to `RuntimeFailureSource` so policy failures are distinguishable from PM and Agent failures.
## Persistence and recovery

`ProjectState` and the headless builder snapshot both persist the `HarnessPackBinding`.
Recovery never re-resolves the request against the current registry; it resumes from the stored immutable binding snapshot.

Persisted task Harness completion records survive desktop reload and headless crash recovery together with the existing `ProjectTaskRun` data.
A recovered task still passes through the Runtime Completion Adapter before its completion record is accepted.

The existing Run Artifact Store is not yet wired to every live runtime path. This phase keeps the binding snapshot serializable and identical to the future `pack.snapshot.json` payload, but does not introduce a second partial artifact-writing path. When live Run Artifact wiring is added, it writes the stored binding snapshot unchanged.

## Error handling

- Unknown explicit pack: block before PM planning.
- No inferred pack: record `unbound`; continue baseline Runtime behavior.
- Bound pack plan violation: semantic PM repair, then fail closed if still invalid.
- Missing trusted task evidence: task remains blocked at the existing Runtime Completion Gate.
- Missing aggregate pack evidence after all tasks: project remains blocked before review/merge.
- Corrupt or unsupported persisted binding version: fail closed and require operator/PM intervention rather than silently re-resolving.
## Testing strategy

TDD coverage must include:

- explicit supported, explicit unknown, inferred bug-fix, and unmatched/unbound resolution;
- immutable binding snapshot survives registry changes/recovery;
- bug-fix plan rejects missing debug-router, missing non-router writer, or broken review/QA topology;
- PM repair receives structured pack validation feedback and is bounded to the existing retry budget;
- desktop performs repository bootstrap only after pack-valid planning;
- accepted Runtime task completion persists structured trusted evidence;
- rejected task evidence cannot satisfy the project pack gate;
- bug-fix aggregate gate requires `test`, `file-change`, and `review`;
- headless merge is never called when the pack gate fails;
- desktop never transitions to `review` when the pack gate fails;
- interrupted recovery uses the stored binding snapshot without re-resolution.


Run the full Bloom policy suite on native Linux plus desktop build, headless worker build, Rust check, and diff hygiene before integration.

## Non-goals

This phase does not:

- add feature-development, documentation, or deployment packs;
- redesign the PM task schema around stage ids;
- auto-insert Pack tasks inside Runtime;
- replace the existing role-level Runtime Completion Adapter;
- introduce marketplace or third-party executable packs;
- fully wire the Run Artifact Store into every live execution path;
- build the benchmark Evaluator.


## Acceptance criteria

The phase is complete when a live bug-fix request is durably bound to the `bug-fix` snapshot, PM cannot proceed with a plan that violates the pack, accepted task evidence is persisted from runtime-owned observations, and both desktop and headless execution refuse project completion/merge until the pack-wide evidence gate passes.

Unmatched ordinary project requests must continue through the existing baseline Harness behavior as explicitly `unbound`, and recovery must never change an already stored binding by re-running pack resolution.
