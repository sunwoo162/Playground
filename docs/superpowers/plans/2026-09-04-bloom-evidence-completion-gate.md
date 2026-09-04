# Bloom Evidence Completion Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Reject Bloom `done` completion claims unless every referenced evidence ID exists and every required evidence kind is satisfied by evidence referenced from the result.

**Architecture:** Add a pure completion evaluator over existing Harness result/evidence contracts, then add a thin adapter that reads a persisted Run Artifact Store bundle. The gate has no repository side effects and does not change orchestration in this phase.

**Tech Stack:** TypeScript, existing Harness validators, existing Run Artifact Store, Bloom policy-test runner.

**Spec:** `docs/superpowers/specs/2026-09-04-bloom-harness-v1-design.md`

## Global Constraints

- `status: done` is never sufficient by itself.
- Unreferenced evidence does not satisfy a completion requirement.
- A referenced evidence ID that is absent fails closed.
- Duplicate stored evidence IDs fail closed.
- Invalid result/evidence contract values fail before completion evaluation.
- Blocked/failed results never pass the completion gate.

---
### Task 1: Pure Completion Evaluation

**Files:**
- Create: `bloom-runtime/ts/harnessCompletionGate.ts`
- Create: `bloom-runtime/ts/harnessCompletionGate.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`

**Interfaces:**
- Produces: `evaluateHarnessCompletion(input): HarnessCompletionGateResult`.
- Produces: `assertHarnessCompletion(input): HarnessAgentResult`.
- Input contains `requiredEvidence`, unknown `result`, and unknown `evidence` entries.

- [x] **Step 1: Write failing tests**

```ts
const ready = evaluateHarnessCompletion({
  requiredEvidence: ["test", "file-change", "review"],
  result: doneResult(["test-1", "file-1", "review-1"]),
  evidence: [testEvidence, fileEvidence, reviewEvidence],
});
assert.equal(ready.ready, true);

const missing = evaluateHarnessCompletion({
  requiredEvidence: ["review"],
  result: doneResult(["test-1"]),
  evidence: [testEvidence, reviewEvidence],
});
assert.deepEqual(missing.missingEvidenceKinds, ["review"]);
```

- [x] **Step 2: Verify RED**

Run the focused policy-test compile and execute `harnessCompletionGate.policy-test.js`.
Expected: FAIL because `harnessCompletionGate.ts` does not exist.

- [x] **Step 3: Implement the pure gate**

Validate `result` and every evidence entry first. Reject duplicate stored evidence IDs. For a validated `done` result, every `result.evidenceIds` value must resolve to stored evidence, and each required evidence kind must appear among the referenced evidence only. Return structured missing ID/kind data instead of guessing.

- [x] **Step 4: Verify GREEN and regressions**

Run the focused test, then the Bloom policy suite. Expected: completion cases PASS; existing platform-only Windows failures remain isolated.

- [x] **Step 5: Commit**

Commit only the pure completion gate, policy test, and policy tsconfig change as `feat : enforce bloom evidence completion`.

### Task 2: Persisted Run Adapter

**Files:**
- Modify: `bloom-runtime/ts/harnessCompletionGate.ts`
- Modify: `bloom-runtime/ts/harnessCompletionGate.policy-test.ts`

**Interfaces:**
- Consumes: `HarnessRunArtifactBundle` from `harnessRunArtifacts.ts`.
- Produces: `evaluateHarnessRunCompletion(bundle, requiredEvidence)` and `assertHarnessRunCompletion(bundle, requiredEvidence)`.

- [x] **Step 1: Write failing run-bundle tests**

Create an artifact store fixture, persist `result.json` plus evidence, call `readRun()`, and assert a complete bundle passes. Add failures for missing `result.json`, missing referenced evidence, and unreferenced evidence of the required kind.

- [x] **Step 2: Verify RED**

Expected: FAIL because the run-bundle adapter functions do not exist.

- [x] **Step 3: Implement the thin adapter**

Read only `bundle.snapshots.result` and `bundle.evidence`; do not infer completion from events, review, QA, or summaries. Missing result fails closed with a descriptive error/result.

- [x] **Step 4: Verify GREEN and regressions**

Run the focused gate test, filtered Windows policy suite, native Linux full policy suite, `pnpm run build:bloom-worker`, and `git diff --check`.

- [x] **Step 5: Commit**

Commit the run-bundle adapter changes as `feat : gate persisted bloom runs`.

### Task 3: Final Review Gate

**Files:**
- Modify: `docs/superpowers/plans/2026-09-04-bloom-evidence-completion-gate.md`

- [x] **Step 1: Review failure semantics**

Confirm blocked/failed results cannot pass; unknown evidence kinds fail in validation; duplicate stored evidence IDs fail closed; every referenced ID must exist; unreferenced evidence cannot satisfy a required kind.

- [x] **Step 2: Run final CI-equivalent checks**

Expected: native Linux Bloom policy suite all PASS, Bloom worker build PASS, diff hygiene PASS.

- [x] **Step 3: Record execution notes and commit**

Record only observed RED/GREEN and verification evidence. Commit plan progress separately if changed.

## Execution Notes

- Pure completion gate observed RED on missing module, then GREEN for done/reference/kind/duplicate/status scenarios.
- Persisted run adapter observed RED on missing exports, then GREEN against real Run Artifact Store fixtures.
- Windows host passed 62 policy tests with the two known platform-only Luna path/symlink baselines excluded.
- Native Linux Node 22.23.2 passed all 64 Bloom policy tests.
- `pnpm run build:bloom-worker` and `git diff --check` passed.
