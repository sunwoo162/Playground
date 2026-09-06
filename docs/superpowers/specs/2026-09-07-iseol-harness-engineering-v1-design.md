# Iseol Harness Engineering v1 Design

Status: accepted direction; ready for implementation planning after review
Date: 2026-09-07
Scope: common engineering Harness used by Iseol; extends the existing Bloom Harness without replacing proven runtime paths.

## Problem

Bloom already contains a working Harness foundation: versioned contracts, `.bloom/project.yaml` loading, a `bug-fix` pack, agent/evidence validation, persisted run artifacts, pack binding, project completion gates, and runtime completion adapters.

The remaining problem is not "make another agent framework." The problem is to turn those pieces into one reusable Engineering Runtime that Iseol can safely delegate work to across different repositories and then reconstruct as a trustworthy development history.

Without that layer, Iseol would have to infer state from logs, duplicate Git/test/deploy logic, or automate a browser UI as the source of truth. Those paths are intentionally rejected.

## Goals

1. Keep one common Harness runtime for development, review, QA, Git, deployment, E2E, and recovery.
2. Make project-specific differences declarative through a manifest and narrow adapters.
3. Give every task a stable `projectId`, `taskId`, `runId`, and participating `agentId` identity.
4. Record facts, technical decisions, failures, recoveries, and results as separate structured records.
5. Make completion fail closed and evidence-driven.
6. Expose a stable event/result contract that Iseol Web and Iseol Bot can consume without parsing internal logs.
7. Preserve enough history for Iseol to show what was done, why it was done, what failed, how it was fixed, and how the result was verified.

## Non-goals

- Rewriting Bloom PM, worker, bridge, Git, review, QA, or recovery code merely to rename it.
- Moving Iseol Discord/Web product logic into the Harness.
- Treating a browser UI as the authoritative execution path.
- Adding a large catalogue of speculative agents before a real workflow requires them.
- Building a public plugin marketplace or arbitrary remote scripting system in v1.

## System boundary

```text
Iseol Web / Iseol Bot
        |
        v
    Iseol Core
Project / Task / Approval / History
        |
        v
Engineering Harness
Plan / Build / Review / QA / Git / Deploy / Recovery
        |
        v
Repository / GitHub / CI / Server
```

Iseol is the control plane. The Harness is the execution plane. Bloom remains the project showcase/evaluation surface and may consume completed project/release evidence, but it does not own task orchestration for Iseol.

A browser may open automatically to show an active run, but pressing a Discord button must create the task/run through Iseol Core and the Harness API. UI automation is never the system of record.

## Canonical project contract

The machine-readable source of truth remains `.bloom/project.yaml`. `HARNESS.md` may exist as a human-readable companion, but it must not silently override machine policy.

The manifest owns only project-specific policy:

- install/lint/typecheck/test/build commands
- base branch and branch prefix
- quality gates
- filesystem/Git/GitHub/deploy permissions
- optional adapter/profile selection
- protected paths and deployment verification metadata when later versions add them

Missing manifest permissions remain deny-by-default. Inferred discovery may suggest commands or project type, but inferred values never grant write/deploy permission.

## Runtime data model

The common model is:

```text
Project
  -> Task
    -> Run
      -> Step
      -> Event
      -> Decision
      -> Evidence
      -> Failure
      -> Recovery
      -> Artifact
      -> Result
```

`Task` is the user/business objective. `Run` is one execution attempt; retries create new runs instead of mutating history into a false success story.

Every externally visible runtime record carries `projectId`, `taskId`, and `runId`. Agent-originated records also carry `agentId` and role. Evidence cannot satisfy a different run's completion gate unless an explicit inherited-evidence rule exists and is recorded.

## Fact, decision, and explanation

The Harness separates three categories:

- **Fact:** immutable or directly verifiable data such as command exit codes, test counts, diff/commit refs, PR/check state, deployment revision, health result, and timestamps.
- **Decision:** the technical choice made from available options, including the reason and rejected alternatives when material.
- **Explanation:** a user-facing summary derived from facts and decisions. It may be regenerated without changing the underlying history.

A decision record uses the shape:

```text
Problem -> Observation -> Options -> Decision -> Reason -> Result -> Evidence
```

Failed attempts are retained. Iseol must be able to show why an approach was abandoned instead of presenting only the final successful path.

## Execution lifecycle

The default lifecycle is:

```text
REQUEST -> CONTEXT -> CLASSIFY -> PLAN -> IMPLEMENT -> TEST -> REVIEW
        -> FIX LOOP -> VERIFY -> COMMIT -> PR -> DEPLOY -> E2E -> COMPLETE
```

Packs may omit stages only when policy permits it. An agent cannot skip a required stage by declaring itself complete.

Initial built-in packs should become: `bug-fix`, `feature-development`, `code-review`, `documentation`, and `deployment`. `bug-fix` remains the reference pack already implemented today.

The initial role set remains intentionally small: Orchestrator, Builder, Reviewer, QA, Debugger, and Deploy. Roles are capabilities, not separate products, and no role receives more permission than it needs.

## Completion and evidence

Completion remains fail closed. A prose claim such as `done` is never sufficient by itself.

Required evidence is derived from the selected pack, manifest quality gates, and requested action. Typical code work requires file-change evidence, tests when applicable, review, and a commit or PR when the task contract requires publication. Deployment requires a concrete revision, health/smoke verification, and rollback state.

Evidence records must become richer than the current `{ id, kind, summary }` shell while preserving backward compatibility. V1 extension fields should include identity, source, timestamp, references/digests, and structured payload appropriate to the evidence kind.

Secrets, tokens, raw credentials, and unnecessary full logs are excluded from durable artifacts. Large logs are referenced by safe digest/path metadata.

## Failure, recovery, and idempotency

Failure is a first-class state, not an exceptional hole in history.

A recovery decision must reconcile live state before retrying side effects:

- confirm whether the previous agent/process is actually dead;
- confirm repository/worktree/commit/PR state;
- prevent duplicate task execution and duplicate publication;
- prevent evidence from an older run from being rebound silently;
- resume from a checkpoint only when the checkpoint identity matches the current task/run;
- escalate or replan repeated identical failures instead of retrying forever.

The active-run/orphan distinction remains a hard safety boundary because false orphan recovery can terminate healthy work.

## Project adapters

The Harness core stays framework-independent. Project differences are limited to a manifest plus narrow adapters/profiles.

Adapters may define how to discover or execute framework-specific commands, health checks, preview/deployment metadata, and repository layout rules. They must not redefine the Harness lifecycle, completion semantics, or permission model.

The first useful adapter profiles should cover the project shapes already in use: web frontend, backend/service, full-stack web, React Native, and desktop/native projects. New profiles are added only from real project requirements.

## Iseol event contract

Iseol must consume structured Harness events, never scrape internal worker logs. External events use a versioned envelope similar to:

```json
{
  "version": 1,
  "projectId": "jobdam",
  "taskId": "task-52",
  "runId": "run-102",
  "type": "TEST_FAILED",
  "at": "2026-09-07T00:00:00Z",
  "summary": "Session E2E failed",
  "evidenceIds": ["evidence-17"]
}
```

The stable event vocabulary covers lifecycle transitions, agent start/finish, decisions, evidence creation, failures, recoveries, Git/PR publication, deployment, and completion. Internal diagnostic events may remain richer, but public event compatibility is versioned.

Iseol sends control commands such as create task, start run, cancel, retry, approve protected action, and request status. The Harness returns state, events, decisions, evidence, artifacts, failures, and the final result.

## Run states and ordering

Externally visible run state uses a small stable vocabulary:

```text
QUEUED -> PLANNING -> RUNNING -> TESTING/REVIEWING/DEPLOYING
       -> BLOCKED | FAILED | RECOVERING | COMPLETE | CANCELLED
```

State changes are emitted as ordered events. Public events need a stable `eventId` and monotonic per-run `seq` so Iseol can rebuild the same timeline after reconnects or duplicate delivery.

Cancellation is cooperative first. Forced termination is allowed only after run/lease identity is verified so a stale observer cannot kill healthy work.

## Approval policy

Existing manifest permissions remain deny/read/write for backward compatibility. Protected actions add a separate approval policy rather than overloading permission values.

An action therefore resolves to both capability and approval requirement. Examples include automatic test execution, user-approved production deploy, and denied force operations. Approval records carry task/run/action identity, approver source, decision, and timestamp and become part of the run history.

External side effects such as PR creation, merge, release promotion, or deployment use idempotency keys derived from task/run/action identity. Retrying a control command must not create a second side effect when the first one already succeeded.

## Current implementation and gaps

Already present on current `main`:

- versioned Harness contracts and validation;
- `.bloom/project.yaml` loader with conservative inferred defaults;
- deterministic `bug-fix` pack and pack binding/plan policy;
- task evidence records and completion gates;
- persisted run snapshots/events/evidence with artifact safety checks;
- project-level completion enforcement;
- runtime completion adapter integration;
- extensive Bloom policy tests and live E2E/recovery work.

The next implementation phase therefore focuses on gaps instead of rebuilding the foundation:

1. Introduce stable Project/Task/Run/Agent identity into public Harness records.
2. Add structured Decision, Failure, Recovery, Artifact, and Result contracts.
3. Extend evidence payloads while retaining v1 reads.
4. Define/version the Iseol-facing event and control contract.
5. Add the missing built-in packs and adapter/profile boundary.
6. Make run reconstruction produce an Iseol-ready development-history projection.
7. Add approval semantics for protected Git/deploy/destructive operations.
8. Add contract/evaluation fixtures proving retry, deduplication, and cross-run evidence isolation.

## Testing strategy

Every contract or state-machine change is test-first. Required coverage includes schema validation, serialization compatibility, completion fail-closed behavior, permission denial, run identity isolation, event ordering/reconstruction, interrupted-writer recovery, duplicate side-effect prevention, and stable benchmark scenarios.

Existing Bloom policy tests remain mandatory. Linux/CI is the authoritative environment for Linux-runtime path and symlink policy tests; Windows-only path behavior must not be misclassified as a Harness regression.

## Success criteria

Harness Engineering v1 is complete when:

- two or more materially different real projects can use the same Harness core with only manifest/adapter differences;
- every task/run/event/evidence record can be attributed to the correct project/task/run and relevant agent;
- required evidence cannot be borrowed accidentally from another run;
- decisions, failures, and recoveries can be reconstructed without relying on prose logs;
- missing evidence or permission produces `blocked`/`failed`, never a guessed success;
- review/test failures enter a bounded fix/replan loop;
- interrupted execution can reconcile and resume without duplicate commit/PR/deploy side effects;
- Git/PR/deployment actions respect manifest permissions and explicit approval policy;
- Iseol can render a project development tree and dated timeline from Harness contracts alone;
- Iseol can issue work through a stable API/event boundary without controlling the Harness through browser UI;
- existing Bloom showcase/evaluation and runtime behavior remain functional during the migration.

## Delivery order

1. Contract/identity upgrade.
2. Decision/failure/recovery and richer evidence records.
3. Iseol public event/control protocol.
4. Additional packs and adapter profiles.
5. History projection and run reconstruction.
6. Approval policy and protected-action gates.
7. Evaluation/recovery hardening on real projects.
8. Only then wire Iseol Core/Web/Bot to delegate production work through the Harness.

This order deliberately finishes the engineering substrate before the Iseol UI becomes dependent on unstable runtime details.

## Design invariants

- **Evidence over claims:** a completion statement is never stronger than its required evidence.
- **Fail closed:** ambiguity in permission, identity, evidence, or deployment revision blocks success.
- **Idempotent side effects:** repeated control delivery cannot duplicate commits, PRs, merges, promotions, or deployments.
- **Traceable history:** important decisions, failures, recoveries, approvals, and results remain attributable to the originating run.
- **UI independence:** Iseol clients observe and control runs through contracts, not by treating a browser session as runtime state.
