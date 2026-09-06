# Harness Contract Identity Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind Harness agent results, evidence, completion gates, and persisted runs to stable `projectId` / `taskId` / `runId` / `agentId` identity so evidence cannot cross-contaminate execution attempts.

**Architecture:** Extend the existing version-1 Harness contracts rather than replacing Bloom runtime paths. Introduce one validated `HarnessExecutionIdentity`, stamp runtime-generated result/evidence with it, reject completion when referenced evidence belongs to another identity, and let the run artifact store bind new runs to identity while retaining read compatibility for legacy unbound artifacts.

**Tech Stack:** TypeScript 5.7, Node.js filesystem APIs, existing CommonJS Bloom policy-test runner.

**Spec:** `docs/superpowers/specs/2026-09-07-iseol-harness-engineering-v1-design.md`

## Global Constraints

- Existing Bloom PM, worker, bridge, Git, review, QA, deploy, and recovery execution paths are not rewritten in this phase.
- `.bloom/project.yaml` remains the machine-readable project policy source of truth.
- Missing or malformed identity fails closed for new identity-aware runtime completion packets.
- Legacy persisted run directories without identity metadata remain readable, but cannot be treated as identity-bound Iseol runs.
- Evidence may satisfy a completion result only when its identity exactly matches the result identity.
- All production behavior changes are test-first.
- Existing Linux/CI policy behavior remains authoritative for Linux path/symlink scenarios.

---
### Task 1: Execution Identity Contract and Validation

**Files:**
- Modify: `bloom-runtime/ts/harnessContracts.ts`
- Modify: `bloom-runtime/ts/harnessValidation.ts`
- Modify: `bloom-runtime/ts/harnessValidation.policy-test.ts`

**Interfaces:**
- Produces: `HarnessExecutionIdentity`.
- Produces: `validateHarnessExecutionIdentity(input: unknown): HarnessExecutionIdentity`.
- Changes: `HarnessAgentEnvelope`, `HarnessAgentResult`, and `HarnessEvidence` each require `identity: HarnessExecutionIdentity`.

- [ ] **Step 1: Add failing validation cases before production changes**

Add an `identity()` test helper returning:

```ts
const identity = () => ({
  projectId: "jobdam",
  taskId: "TASK-52",
  runId: "run-102",
  agentId: "frontend-1",
});
```

Update the existing valid envelope/result/evidence fixtures to include `identity: identity()`, then add assertions that missing identity and identifiers containing `/`, `\\`, leading whitespace, or empty values are rejected.

- [ ] **Step 2: Compile/run the focused test and verify RED**

Run:
`pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json && node .tmp/bloom-policy-tests/harnessValidation.policy-test.js`

Expected: FAIL because the contract/validator does not yet accept or require the new identity shape.
- [ ] **Step 3: Implement the minimal identity contract and validator**

Add to `harnessContracts.ts`:

```ts
export type HarnessExecutionIdentity = {
  projectId: string;
  taskId: string;
  runId: string;
  agentId: string | null;
};
```

Require `identity` on `HarnessAgentEnvelope`, `HarnessAgentResult`, and `HarnessEvidence`.

In `harnessValidation.ts`, add:

```ts
const HARNESS_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function validateHarnessExecutionIdentity(input: unknown): HarnessExecutionIdentity;
```

Each non-null identifier must match the safe pattern; `agentId` may be `null` for system-generated records. All three existing validators call this function and return the normalized identity.

- [ ] **Step 4: Re-run focused validation tests and verify GREEN**

Run the focused compile/test command from Step 2.
Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add bloom-runtime/ts/harnessContracts.ts bloom-runtime/ts/harnessValidation.ts bloom-runtime/ts/harnessValidation.policy-test.ts
git commit -m "feat : bind harness records to execution identity"
```

### Task 2: Runtime Completion Identity Propagation

**Files:**
- Modify: `bloom-runtime/ts/runtimeCompletionAdapter.ts`
- Modify: `bloom-runtime/ts/runtimeCompletionAdapter.policy-test.ts`

**Interfaces:**
- Changes: `RuntimeTaskCompletionInput` requires `projectId`, `taskId`, `runId`, and `agentId`.
- Produces: every generated `HarnessAgentResult` and `HarnessEvidence` carries the same validated identity.
- Changes evidence IDs to include the run identity so retry runs cannot collide.
- [ ] **Step 1: Add failing runtime propagation assertions**

Update `completedInput()` so every test input includes:

```ts
projectId: "jobdam",
taskId: `TASK-${role}`,
runId: `run-${role}`,
agentId: `${role}-agent-1`,
```

Add assertions that the packet result identity and every evidence identity equal those four fields. Add a retry case with the same task but different `runId` and assert the generated evidence IDs are different.

- [ ] **Step 2: Run the focused runtime adapter test and verify RED**

Run:
`pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json && node .tmp/bloom-policy-tests/runtimeCompletionAdapter.policy-test.js`

Expected: FAIL because runtime completion does not yet propagate identity.

- [ ] **Step 3: Implement minimal propagation**

Build one validated identity at the start of `evaluateRuntimeTaskCompletion()` and pass it to the evidence factory. Change the factory to:

```ts
function evidence(
  identity: HarnessExecutionIdentity,
  suffix: string,
  kind: HarnessEvidenceKind,
  summary: string,
): HarnessEvidence
```

Generate IDs as:

```ts
`${identity.projectId}:${identity.taskId}:${identity.runId}:${suffix}`
```

Stamp the same identity on the final `HarnessAgentResult`.

- [ ] **Step 4: Re-run focused runtime adapter tests and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add bloom-runtime/ts/runtimeCompletionAdapter.ts bloom-runtime/ts/runtimeCompletionAdapter.policy-test.ts
git commit -m "feat : propagate harness run identity"
```
### Task 3: Completion Gate Cross-Run Isolation

**Files:**
- Modify: `bloom-runtime/ts/harnessCompletionGate.ts`
- Modify: `bloom-runtime/ts/harnessCompletionGate.policy-test.ts`
- Modify: `bloom-runtime/ts/harnessProjectCompletionGate.policy-test.ts` only as needed to supply identity fixtures.

**Interfaces:**
- Adds: `identity-mismatch` to `HarnessCompletionGateReason`.
- Guarantees: referenced evidence must have the exact same identity as the result.
- Guarantees: run-bundle completion rejects a result whose `identity.runId` differs from `bundle.runId`.

- [ ] **Step 1: Add failing cross-run evidence cases**

Create one base identity and a second identity that differs only by `runId`. Add a case where the result references an evidence ID present in storage but owned by the other run; expect `ready === false` and `reason === "identity-mismatch"`.

Add a persisted-run case where the stored result says `runId: "run-other"` while the artifact bundle is `run-ready`; expect an explicit run identity mismatch error.

- [ ] **Step 2: Run focused completion-gate tests and verify RED**

Run:
`pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json && node .tmp/bloom-policy-tests/harnessCompletionGate.policy-test.js`

Expected: FAIL because the gate currently matches evidence by ID/kind only.

- [ ] **Step 3: Implement identity equality and fail-closed gating**

Add a small equality helper comparing all four identity fields. After referenced evidence is resolved, detect any identity mismatch before checking required kinds. Return `identity-mismatch` and expose the mismatched evidence IDs in a new `mismatchedEvidenceIds: string[]` result field.

`assertHarnessCompletion()` throws a descriptive identity mismatch error. `evaluateHarnessRunCompletion()` and `assertHarnessRunCompletion()` first verify `result.identity.runId === bundle.runId`.

- [ ] **Step 4: Re-run focused completion-gate tests and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add bloom-runtime/ts/harnessCompletionGate.ts bloom-runtime/ts/harnessCompletionGate.policy-test.ts bloom-runtime/ts/harnessProjectCompletionGate.policy-test.ts
git commit -m "feat : isolate harness completion by run"
```
### Task 4: Identity-Bound Run Artifact Store

**Files:**
- Modify: `bloom-runtime/ts/harnessRunArtifacts.ts`
- Modify: `bloom-runtime/ts/harnessRunArtifacts.policy-test.ts`
- Modify: `bloom-runtime/ts/harnessCompletionGate.policy-test.ts` only where store creation changes.

**Interfaces:**
- Adds optional third parameter: `createHarnessRunArtifactStore(repoRoot, runId, identity?)`.
- Adds: `identity: HarnessExecutionIdentity | null` to `HarnessRunArtifactBundle`.
- New identity-aware stores persist immutable `identity.json` and reject evidence whose identity does not match.
- Legacy stores created/read without identity remain readable with `identity: null`.

- [ ] **Step 1: Add failing artifact identity tests**

Create an identity-bound store for `run-001`, assert `identity.json` is written once and `readRun().identity` matches. Assert creating the same run with a conflicting identity fails. Assert appending evidence from another run is rejected.

Keep one explicit legacy store case without identity and assert `readRun().identity === null`.

- [ ] **Step 2: Run focused artifact tests and verify RED**

Run:
`pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json && node .tmp/bloom-policy-tests/harnessRunArtifacts.policy-test.js`

Expected: FAIL because the store has no identity metadata/binding yet.

- [ ] **Step 3: Implement immutable identity binding**

On store creation with identity, validate identity, require `identity.runId === runId`, write `identity.json` with write-once semantics, or verify exact equality when it already exists. `appendEvidence()` checks the stored identity when present. `readRun()` returns validated identity or `null` for old runs.

- [ ] **Step 4: Re-run focused artifact and completion tests**

Run the artifact test, then the completion-gate test.
Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add bloom-runtime/ts/harnessRunArtifacts.ts bloom-runtime/ts/harnessRunArtifacts.policy-test.ts bloom-runtime/ts/harnessCompletionGate.policy-test.ts
git commit -m "feat : bind harness artifacts to run identity"
```
### Task 5: Identity Upgrade Regression Gate

**Files:**
- Modify only if Tasks 1-4 reveal an identity integration defect.

**Interfaces:**
- Consumes the upgraded Harness identity contracts, runtime adapter, completion gate, and run artifact store.
- Produces no new API; this task proves the subproject is safe to build the Decision/Failure/Recovery phase on.

- [ ] **Step 1: Run TypeScript policy-test compilation**

Run: `pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json`
Expected: exit 0.

- [ ] **Step 2: Run focused Harness identity suites**

Run the compiled policy tests for `harnessValidation`, `runtimeCompletionAdapter`, `harnessCompletionGate`, `harnessRunArtifacts`, `harnessTaskEvidence`, and `harnessProjectCompletionGate`.
Expected: all focused suites PASS.

- [ ] **Step 3: Run worker compile**

Run: `pnpm run build:bloom-worker`
Expected: exit 0.

- [ ] **Step 4: Run full Bloom runtime policy suite and classify baseline-only failures**

Run: `pnpm run test:bloom-runtime`.
Expected on Linux/CI: PASS. On Windows, only previously documented platform-specific runtime-path/symlink failures may remain; any Harness identity failure blocks completion.

- [ ] **Step 5: Verify diff hygiene and plan completion**

Run: `git diff --check` and `git status --short`. Update only checkboxes for steps actually executed, then commit the plan progress separately if it changed.

## Deferred after this plan

- Decision / Failure / Recovery / Artifact / Result structured contracts.
- Versioned Iseol public event/control protocol (`eventId`, per-run `seq`, stable state vocabulary).
- Additional built-in task packs and project adapter profiles.
- Approval records and protected-action policy.
- Iseol-ready development-history projection.
