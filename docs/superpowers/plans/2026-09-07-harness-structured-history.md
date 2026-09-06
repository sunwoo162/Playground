# Harness Structured History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add identity-bound Decision, Failure, Recovery, Artifact, and Run Result records so Iseol can reconstruct why work happened, what failed, how recovery changed the path, and what durable outputs resulted.

**Architecture:** Keep existing Bloom `AgentDecision`, `FailureRouteRecord`, and `ProjectReplanRecord` as product/runtime records. Add generic Harness history contracts and validators, persist them inside identity-bound Harness run stores, then add adapters from existing Bloom records instead of replacing their runtime behavior.

**Tech Stack:** TypeScript 5.7, Node.js filesystem APIs, existing Bloom policy-test runner.

**Spec:** `docs/superpowers/specs/2026-09-07-iseol-harness-engineering-v1-design.md`

## Global Constraints

- Structured Harness history records require `HarnessExecutionIdentity`; legacy unbound run stores remain readable but cannot append new structured history.
- Existing Bloom decision/failure/replan execution paths are not rewritten in this phase.
- Facts, decisions, failures, recoveries, and user-facing explanations remain separate concepts.
- Durable history never stores secrets or arbitrary raw log bodies; artifacts store bounded references/metadata.
- New append operations reject cross-run identity mismatches.
- All production behavior changes are test-first.

---
### Task 1: Structured History Contracts and Validation

**Files:**
- Create: `bloom-runtime/ts/harnessHistoryContracts.ts`
- Create: `bloom-runtime/ts/harnessHistoryValidation.ts`
- Create: `bloom-runtime/ts/harnessHistoryValidation.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`

**Interfaces:**
- Produces: `HarnessDecisionRecord`, `HarnessFailureRecord`, `HarnessRecoveryRecord`, `HarnessArtifactRecord`, `HarnessRunResultRecord`.
- Produces validators for each record.
- All records use `HarnessExecutionIdentity` from `harnessContracts.ts`.

- [ ] **Step 1: Write failing validation tests**

Use one valid identity and assert valid records preserve it. Reject empty IDs, malformed timestamps, empty decision/reason/summary fields, invalid status/kind values, and malformed identity.

- [ ] **Step 2: Compile/run and verify RED**

Run:
`pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json && node .tmp/bloom-policy-tests/harnessHistoryValidation.policy-test.js`

Expected: FAIL because the history modules do not exist.
- [ ] **Step 3: Implement minimal version-1 contracts**

Use these core shapes:

```ts
type HarnessDecisionRecord = {
  version: 1; id: string; identity: HarnessExecutionIdentity;
  problem: string | null; observations: string[]; options: string[];
  decision: string; reason: string; outcome: string | null;
  evidenceIds: string[]; at: string;
};

type HarnessFailureRecord = {
  version: 1; id: string; identity: HarnessExecutionIdentity;
  failureType: string; severity: "low" | "medium" | "high" | "critical";
  summary: string; cause: string | null; evidenceIds: string[]; at: string;
};
```

Recovery records contain `failureId`, `action`, `reason`, `status`, `result`, `actorAgentId`, evidence IDs, and timestamp. Artifact records contain a bounded kind, summary, reference, optional digest, and timestamp. Run result records contain status, summary, referenced history/evidence/artifact IDs, start/completion timestamps.

- [ ] **Step 4: Re-run focused validation and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

`git commit -m "feat : add harness structured history contracts"`

### Task 2: Persist Identity-Bound Structured History

**Files:**
- Modify: `bloom-runtime/ts/harnessRunArtifacts.ts`
- Modify: `bloom-runtime/ts/harnessRunArtifacts.policy-test.ts`

**Interfaces:**
- Adds history arrays/result to `HarnessRunArtifactBundle`.
- Adds `appendDecision`, `appendFailure`, `appendRecovery`, `appendArtifact`, and `writeRunResult`.
- Structured history writes require an identity-bound store and exact run identity match.
- [ ] **Step 1: Add failing persistence tests**

Create an identity-bound store, append one record of each type, write one run result, and assert `readRun()` reconstructs all values. Assert duplicate record IDs, cross-run identities, structured writes on an unbound legacy store, and a recovery referencing an unknown failure ID are rejected.

- [ ] **Step 2: Run focused artifact test and verify RED**

Run the policy-test compile plus `harnessRunArtifacts.policy-test.js`.
Expected: FAIL because structured history methods/files do not exist.

- [ ] **Step 3: Implement durable files**

Persist `decisions.json`, `failures.json`, `recoveries.json`, `artifacts.json`, and write-once `run-result.json`. Reuse atomic array replacement used by evidence. Validate every read. A recovery may use a different `actorAgentId`, but its record identity remains the run being recovered.

- [ ] **Step 4: Re-run artifact and completion tests**

Expected: PASS for run artifacts and completion gate suites.

- [ ] **Step 5: Commit Task 2**

`git commit -m "feat : persist harness structured history"`

### Task 3: Adapt Existing Bloom Decision and Recovery Records

**Files:**
- Create: `bloom-runtime/ts/harnessHistoryAdapter.ts`
- Create: `bloom-runtime/ts/harnessHistoryAdapter.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`

**Interfaces:**
- `adaptAgentDecision(decision, identity): HarnessDecisionRecord`.
- `adaptFailureRoute(route, identity): { failure: HarnessFailureRecord; recovery: HarnessRecoveryRecord }`.
- `adaptProjectReplan(replan, identity, failureId): HarnessRecoveryRecord`.
- [ ] **Step 1: Add failing adapter tests**

Verify mapping keeps project/task/run identity, action/rationale/alternatives, failure classification/severity, route recommendation, replan summary, and source record IDs. Reject identity/project/task mismatches that would attach history to the wrong run.

- [ ] **Step 2: Run focused adapter test and verify RED**

Expected: FAIL because adapter module does not exist.

- [ ] **Step 3: Implement minimal pure adapters**

Do not mutate `ProjectTeamsState` or replace existing runtime records. Mapping only converts existing records into generic Harness history records. Failure route mapping uses the failed run identity; `routerAgentId` is recorded as recovery `actorAgentId` rather than replacing the run identity.

- [ ] **Step 4: Re-run adapter test and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

`git commit -m "feat : adapt bloom history to harness records"`

### Task 4: Structured History Regression Gate

**Files:**
- Modify only if Tasks 1-3 expose integration defects.

- [ ] **Step 1: Compile all policy tests**

Run: `pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json`
Expected: exit 0.

- [ ] **Step 2: Run focused history/identity suites**

Run history validation, history adapter, run artifacts, completion gate, runtime completion, and project completion suites.
Expected: all PASS.

- [ ] **Step 3: Run worker build**

Run: `pnpm run build:bloom-worker`
Expected: exit 0.

- [ ] **Step 4: Run full Bloom runtime suite and GitHub Harness CI**

Windows may retain only the documented POSIX-path baseline failure. The PR `Harness` job on `ubuntu-latest` is authoritative and must be green.

- [ ] **Step 5: Verify diff hygiene and record outcomes**

Run `git diff --check` and `git status --short`; update actual plan progress and commit it separately.

## Deferred after this plan

- Versioned Iseol public event/control protocol (`eventId`, per-run `seq`, stable run state vocabulary).
- Additional task packs and project adapters.
- Approval/protected-action records and idempotency keys.
- Iseol-ready tree/timeline projection across multiple runs/tasks.
