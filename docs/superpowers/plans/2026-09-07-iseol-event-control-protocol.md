# Iseol Event / Control Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Give Iseol a stable, versioned protocol for observing Harness runs through ordered public events and issuing identity-bound control commands without parsing internal logs or driving browser UI.

**Architecture:** Add a small public protocol module beside the existing Harness contracts. Persist public events separately from internal `events.jsonl`, using stable `eventId` plus monotonic per-run `seq`. Control commands are pure validated messages first; an adapter maps safe pause/resume/stop semantics onto the existing Bloom `executionControl` model without replacing it.

**Tech Stack:** TypeScript 5.7, Node.js filesystem APIs, existing Bloom policy-test runner.

**Spec:** `docs/superpowers/specs/2026-09-07-iseol-harness-engineering-v1-design.md`

## Global Constraints

- Public Iseol clients consume structured contracts, never raw worker logs.
- Every public event and control command is bound to `HarnessExecutionIdentity`.
- Event ordering is per run: `seq` starts at 1 and must increase by exactly 1 for persisted events.
- Duplicate event delivery is tolerated by stable `eventId`; conflicting reuse of an `eventId` is rejected.
- Public run states are `QUEUED`, `PLANNING`, `RUNNING`, `TESTING`, `REVIEWING`, `DEPLOYING`, `BLOCKED`, `FAILED`, `RECOVERING`, `COMPLETE`, `CANCELLED`.
- This phase does not implement force-kill, merge, deploy approval, or arbitrary side-effect execution.
- Existing `executionControl.ts` stays authoritative for Bloom pause/resume/stop behavior during migration.
- Production changes are test-first.

---
### Task 1: Public Event / Control Contracts

**Files:**
- Create: `bloom-runtime/ts/iseolHarnessProtocol.ts`
- Create: `bloom-runtime/ts/iseolHarnessProtocol.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`

**Interfaces:**
- Produces: `IseolHarnessRunState`, `IseolHarnessEventType`, `IseolHarnessEvent`, `IseolHarnessControlAction`, `IseolHarnessControlCommand`.
- Produces: `validateIseolHarnessEvent()` and `validateIseolHarnessControlCommand()`.

- [x] **Step 1: Write failing protocol validation tests**

Use a valid execution identity and assert a valid event preserves `eventId`, `seq`, state/type, timestamp, summary, and evidence IDs. Assert a valid control preserves `commandId`, action, identity, requested time, and source. Reject `seq <= 0`, malformed IDs/timestamps/identity, unknown event/state/action values, duplicate evidence IDs, and multiline source/summary values.

- [x] **Step 2: Compile/run and verify RED**

Run:
`pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json && node .tmp/bloom-policy-tests/iseolHarnessProtocol.policy-test.js`

Expected: FAIL because the protocol module does not exist.

- [x] **Step 3: Implement minimal version-1 contracts and validators**

Event shape contains `version`, `eventId`, `identity`, positive integer `seq`, `type`, `state`, `at`, bounded single-line `summary`, and `evidenceIds`. Control shape contains `version`, `commandId`, `identity`, action (`pause|resume|cancel|retry|status`), `requestedAt`, and bounded single-line `source`.
Stable event types for v1 are: `RUN_STATE_CHANGED`, `AGENT_STARTED`, `AGENT_FINISHED`, `DECISION_RECORDED`, `EVIDENCE_RECORDED`, `FAILURE_RECORDED`, `RECOVERY_RECORDED`, `ARTIFACT_RECORDED`, `GIT_PUBLISHED`, `DEPLOYMENT_CHANGED`, and `RUN_COMPLETED`.

- [x] **Step 4: Re-run focused protocol validation and verify GREEN**

Expected: PASS.

- [x] **Step 5: Commit Task 1**

```bash
git add bloom-runtime/ts/iseolHarnessProtocol.ts bloom-runtime/ts/iseolHarnessProtocol.policy-test.ts bloom-runtime/tsconfig.policy-tests.json
git commit -m "feat : define iseol harness protocol"
```

### Task 2: Ordered Public Event Store

**Files:**
- Modify: `bloom-runtime/ts/harnessRunArtifacts.ts`
- Modify: `bloom-runtime/ts/harnessRunArtifacts.policy-test.ts`

**Interfaces:**
- Adds `publicEvents: IseolHarnessEvent[]` to `HarnessRunArtifactBundle`.
- Adds `appendPublicEvent(event: IseolHarnessEvent): void` to `HarnessRunArtifactStore`.
- Persists `public-events.jsonl` separately from internal `events.jsonl`.

- [x] **Step 1: Add failing ordered-event persistence tests**

Create an identity-bound store and append seq 1 and 2. Assert `readRun().publicEvents` preserves order. Re-appending the exact same `eventId`/payload is idempotent and does not duplicate the event. Reusing the same `eventId` with different content, appending seq 4 after seq 2, cross-run identity, or writing public events to an unbound store must fail.
- [x] **Step 2: Run focused artifact tests and verify RED**

Run policy-test compilation plus `harnessRunArtifacts.policy-test.js`.
Expected: FAIL because the store does not expose ordered public events yet.

- [x] **Step 3: Implement identity-bound ordered event persistence**

Validate each event with `validateIseolHarnessEvent`. Require exact bound identity. Read existing `public-events.jsonl`, accept an exact duplicate `eventId` as a no-op, reject a conflicting duplicate, and require the next new `seq` to equal `lastSeq + 1` (or `1` for an empty store). Append one validated JSON line only after all checks pass.

- [x] **Step 4: Re-run run-artifact and completion suites**

Expected: PASS; existing internal events/evidence/history remain unchanged.

- [x] **Step 5: Commit Task 2**

```bash
git add bloom-runtime/ts/harnessRunArtifacts.ts bloom-runtime/ts/harnessRunArtifacts.policy-test.ts
git commit -m "feat : persist ordered iseol harness events"
```

### Task 3: Safe Control Adapter

**Files:**
- Create: `bloom-runtime/ts/iseolExecutionControlAdapter.ts`
- Create: `bloom-runtime/ts/iseolExecutionControlAdapter.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`

**Interfaces:**
- Produces: `mapIseolControlToBloomAction(command, project): ProjectExecutionControlAction | "status" | "retry"`.
- Produces: `IseolControlApplyResult = { status: "applied" | "observed" | "deferred"; control: ProjectExecutionControlRecord; reason: string | null }`.
- Produces: `applyIseolProjectControl(command, project): IseolControlApplyResult` for safe pause/resume/cancel/status commands only.
- [x] **Step 1: Add failing adapter tests**

Assert identity project mismatch fails. Assert `pause` maps to existing pause semantics, `resume` maps to resume, `cancel` maps to stop/cooperative cancellation, and `status` returns current state without mutation. Assert `retry` is validated but rejected by this adapter with an explicit unsupported/deferred result so it cannot silently duplicate work.

- [x] **Step 2: Run focused adapter test and verify RED**

Expected: FAIL because the adapter module does not exist.

- [x] **Step 3: Implement minimal adapter around `executionControl.ts`**

Do not duplicate the state machine. Reuse `requestProjectPause`, `requestProjectResume`, `requestProjectStop`, and `getProjectExecutionControl`. Require `command.identity.projectId === project.id`. Map cancel to cooperative `stop`; do not force-kill a process. `retry` returns a typed deferred/unsupported result until run reconciliation/idempotency is implemented in the later protected-action phase.

- [x] **Step 4: Re-run adapter plus existing `executionControl.policy-test.js`**

Expected: PASS.

- [x] **Step 5: Commit Task 3**

```bash
git add bloom-runtime/ts/iseolExecutionControlAdapter.ts bloom-runtime/ts/iseolExecutionControlAdapter.policy-test.ts bloom-runtime/tsconfig.policy-tests.json
git commit -m "feat : bridge iseol controls to harness execution"
```

### Task 4: Protocol Regression Gate

**Files:**
- Modify only if Tasks 1-3 expose integration defects.

- [x] **Step 1: Compile all policy tests**

Run: `pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json`.
Expected: exit 0.
- [x] **Step 2: Run focused public-protocol suites**

Run compiled tests for `iseolHarnessProtocol`, `harnessRunArtifacts`, `iseolExecutionControlAdapter`, `executionControl`, `harnessHistoryValidation`, and `harnessCompletionGate`.
Expected: all PASS.

- [x] **Step 3: Run worker build**

Run: `pnpm run build:bloom-worker`.
Expected: exit 0.

- [x] **Step 4: Run full Bloom runtime suite and GitHub Harness CI**

Windows may retain only the documented `lunaServerRuntime.policy-test` POSIX-path baseline failure. The PR `Harness` job on `ubuntu-latest` must be green.

- [x] **Step 5: Verify diff hygiene and record outcomes**

Run `git diff --check` and `git status --short`; update only steps actually executed and record the Linux CI run ID/head SHA.

## Deferred after this plan

- Approval/protected-action records and action-level idempotency keys for merge/deploy/promotion.
- Safe retry execution after live run/lease reconciliation.
- Additional task packs and project adapter profiles.
- Iseol-ready tree/timeline projection across projects/tasks/runs.
- Actual Iseol Core/Web/Bot wiring to this protocol.


## Verification Record

- Head: `a07543b0fb5e4e2617667f1c3a0f4a9d1cb63923`
- Ubuntu Harness CI: `34068834734` — success
- Windows focused protocol/history/completion suites: PASS
- Worker build: PASS
- Full Windows runtime suite: only the pre-existing `lunaServerRuntime` POSIX-path baseline failure remains.
