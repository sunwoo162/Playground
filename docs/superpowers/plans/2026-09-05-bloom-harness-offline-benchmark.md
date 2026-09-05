# Bloom Harness Offline Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic offline Harness benchmark suite that evaluates normalized golden run fixtures against production Pack/trusted-evidence completion semantics and blocks CI on unintended verdict or metric changes.

**Architecture:** Keep filesystem loading, semantic evaluation, golden comparison, suite orchestration, and CLI behavior separate. Reuse production Pack binding, task completion, and project completion validators; benchmark code must not call LLMs, networks, GitHub, repository clones, or live Builder/Agent execution.

**Tech Stack:** TypeScript 5.7, Node.js 22/CommonJS compile output, pnpm 10.33, existing Bloom Harness validators and GitHub Actions Harness workflow.

**Spec:** `docs/superpowers/specs/2026-09-05-bloom-harness-offline-benchmark-design.md`

## Global Constraints

- v1 fixtures are normalized synthetic `run.json` + `expected.json`; there is no `baseline.json`.
- `expected.json` is the accepted golden baseline; test mode is read-only.
- `invalid` results must use `metrics: null`; only `pass`/`fail` produce full metrics.
- Stable violation codes are canonicalized; raw validator error strings are never golden data.
- Valid `blocked` Pack bindings are `fail / PACK_BINDING_BLOCKED`, not `invalid`.
- `ProjectTaskRun.evidence: string[]` must never become trusted Pack evidence.
- Legacy-unbound fixtures must never re-run current Pack inference.
- Same fixture + same commit must serialize to byte-identical benchmark JSON across repeated runs.
- Update mode must refuse CI and require explicit `--case CASE_ID` or `--all`.
- v1 does not apply retry/replan/failure-route tolerances; those counters are fixture inputs, not paired live-run observations.
- CI benchmark step sits after `test:bloom-runtime` and before `build:bloom-worker`.
- No v2 Live Benchmark, scoring, UI, persistent database, paired-run executor, or automatic Team Evolution rollback in this phase.

## File Map

- Modify `bloom-runtime/ts/harnessProjectCompletionGate.ts`: narrow project-gate task input to the structural fields the gate actually reads.
- Modify `bloom-runtime/ts/harnessProjectCompletionGate.policy-test.ts`: prove full `ProjectTaskRun[]` remains compatible.
- Create `bloom-runtime/ts/harnessBenchmarkContracts.ts`: fixture/result contracts, stable codes, primitive validation, canonicalization.
- Create `bloom-runtime/ts/harnessBenchmarkContracts.benchmark-test.ts`: contract RED/GREEN tests.
- Create `bloom-runtime/ts/harnessOfflineEvaluator.ts`: production-validator-backed deterministic case evaluation.
- Create `bloom-runtime/ts/harnessOfflineEvaluator.benchmark-test.ts`: pass/fail/invalid evaluator tests.
- Create `bloom-runtime/ts/harnessBenchmarkLoader.ts`: filesystem discovery + JSON loading only.
- Create `bloom-runtime/ts/harnessBenchmarkComparator.ts`: exact golden comparison.
- Create `bloom-runtime/ts/harnessBenchmarkSuite.ts`: deterministic suite orchestration and serialization.
- Create benchmark tests for loader/comparator/suite.
- Create `bloom-runtime/tsconfig.harness-benchmarks.json` and `bloom-runtime/run-harness-benchmark-tests.cjs`.
- Create six directories under `bloom-runtime/fixtures/harness-benchmarks/`.
- Create `scripts/harness-benchmark.cjs`; modify `package.json` and `.github/workflows/harness.yml`.

---

### Task 1: Narrow the Production Project Completion Gate Input
**Files:**
- Modify: `bloom-runtime/ts/harnessProjectCompletionGate.ts`
- Modify: `bloom-runtime/ts/harnessProjectCompletionGate.policy-test.ts`

**Interfaces:**
- Consumes: `HarnessPackBinding`, `HarnessTaskCompletionRecord`, `TaskRunStatus`.
- Produces: `HarnessProjectCompletionTaskView` and unchanged `evaluateHarnessPackProjectCompletion(input)` behavior.

- [ ] **Step 1: Write the compile/runtime regression test**

Import the new view type in the policy test so the current code is guaranteed RED, then also pass a real `ProjectTaskRun[]` to prove backward structural compatibility:

```ts
import type { HarnessProjectCompletionTaskView } from "./harnessProjectCompletionGate";
import type { ProjectTaskRun } from "./types";

const minimalRuns: HarnessProjectCompletionTaskView[] = [{
  taskId: "MIN-001", status: "done", harnessCompletion: null,
}];
const minimalResult = evaluateHarnessPackProjectCompletion({
  binding: legacyUnboundHarnessPackBinding("legacy benchmark fixture"),
  taskRuns: minimalRuns,
});
assert.ok(minimalResult.ready, "minimal structural task view must be accepted");

const fullRuns: ProjectTaskRun[] = [{
  taskId: "FE-001", role: "frontend", agentId: "rose:frontend", status: "done",
  attempts: 1, branchName: null, worktreePath: null, threadId: null, sessionId: null,
  turnId: null, eventsPath: null, stderrPath: null, commitSha: null,
  pullRequestNumber: null, pullRequestUrl: null, reviewedPullRequests: [],
  summary: "done", rationaleSummary: "fixture", evidence: ["free-form-must-not-count"],
  harnessCompletion: null, verification: [], blockers: [], lastError: null,
  startedAt: null, completedAt: null,
}];
const result = evaluateHarnessPackProjectCompletion({
  binding: legacyUnboundHarnessPackBinding("legacy benchmark fixture"),
  taskRuns: fullRuns,
});
assert.ok(result.ready, "full ProjectTaskRun[] must remain structurally compatible");
```
- [ ] **Step 2: Run the focused policy test and verify RED**

Run:

```bash
pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json
node .tmp/bloom-policy-tests/harnessProjectCompletionGate.policy-test.js
```

Expected: compile fails because `HarnessProjectCompletionTaskView` does not exist yet, or the new type assertion cannot be expressed against the current `ProjectTaskRun[]`-only input.

- [ ] **Step 3: Implement the minimal structural task view**

Change the production gate input to:

```ts
import type { HarnessTaskCompletionRecord } from "./harnessTaskEvidence";
import type { TaskRunStatus } from "./types";

export type HarnessProjectCompletionTaskView = {
  taskId: string;
  status: TaskRunStatus;
  harnessCompletion?: HarnessTaskCompletionRecord | null;
};

export type HarnessPackProjectCompletionInput = {
  binding: HarnessPackBinding;
  taskRuns: readonly HarnessProjectCompletionTaskView[];
};
```

Do not read role, branch, worktree, free-form evidence, verification, or session fields inside the gate.

- [ ] **Step 4: Re-run focused policy test and verify GREEN**

Run the same two commands. Expected: PASS with existing project-gate semantics unchanged.

- [ ] **Step 5: Commit**

```bash
git add bloom-runtime/ts/harnessProjectCompletionGate.ts bloom-runtime/ts/harnessProjectCompletionGate.policy-test.ts
git commit -m "refactor : narrow bloom harness completion input"
```

---

### Task 2: Add Benchmark Contracts and a Dedicated Compile/Test Harness
**Files:**
- Create: `bloom-runtime/ts/harnessBenchmarkContracts.ts`
- Create: `bloom-runtime/ts/harnessBenchmarkContracts.benchmark-test.ts`
- Create: `bloom-runtime/tsconfig.harness-benchmarks.json`
- Create: `bloom-runtime/run-harness-benchmark-tests.cjs`

**Interfaces:**
- Produces: `HarnessBenchmarkRunFixture`, `HarnessBenchmarkResult`, `HarnessBenchmarkExpected`, `HarnessBenchmarkMetrics`, `HarnessBenchmarkViolationCode`.
- Produces: `validateHarnessBenchmarkCaseId(value)`, `validateHarnessBenchmarkRunFixture(value, directoryCaseId)`, `validateHarnessBenchmarkExpected(value, directoryCaseId)`, `canonicalizeHarnessBenchmarkViolations(codes)`.

- [ ] **Step 1: Write contract tests first**

The test must cover unsupported versions, case-id mismatch/path traversal, negative/non-integer counters, duplicate task IDs, unknown verdict/code, invalid metrics nullability, and canonical violation ordering.

Begin the test file with:

```ts
import * as assert from "node:assert/strict";
```

Use a minimal valid fixture factory:

```ts
const fixture = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  caseId: "case-a",
  description: "normalized fixture",
  binding: { sentinel: "validated later" },
  tasks: [],
  operational: { failureRouteCount: 0, replanCount: 0 },
  ...overrides,
});
assert.ok(validateHarnessBenchmarkRunFixture(fixture(), "case-a").caseId === "case-a");
assert.throws(() => validateHarnessBenchmarkRunFixture(fixture({ version: 2 }), "case-a"));
assert.throws(() => validateHarnessBenchmarkRunFixture(fixture(), "other-case"));
assert.throws(() => validateHarnessBenchmarkCaseId("../escape"));
assert.throws(() => validateHarnessBenchmarkRunFixture(fixture({ operational: { failureRouteCount: -1, replanCount: 0 } }), "case-a"));
```
Add expected-result validation around exact verdict/code rules:

```ts
const metrics = {
  packBound: true, taskCount: 1, acceptedTaskCount: 1, retryCount: 0,
  failureRouteCount: 0, replanCount: 0, verificationIssueCount: 0,
  requiredEvidenceKindsPresent: 3, requiredEvidenceKindsTotal: 3,
  completionGateReady: true,
};
const expected = { version: 1, caseId: "case-a", verdict: "pass", violations: [], metrics };
assert.ok(validateHarnessBenchmarkExpected(expected, "case-a").verdict === "pass");
assert.throws(() => validateHarnessBenchmarkExpected({ ...expected, verdict: "invalid", metrics }, "case-a"));
assert.throws(() => validateHarnessBenchmarkExpected({ ...expected, violations: ["NOT_A_CODE"] }, "case-a"));
assert.deepEqual(
  canonicalizeHarnessBenchmarkViolations(["MISSING_REQUIRED_EVIDENCE", "TASK_NOT_DONE", "TASK_NOT_DONE"]),
  ["TASK_NOT_DONE", "MISSING_REQUIRED_EVIDENCE"],
);
```

- [ ] **Step 2: Create the benchmark tsconfig and runner, then verify RED**

Create `bloom-runtime/tsconfig.harness-benchmarks.json` exactly as the initial dedicated compile boundary:

```json
{
  "compilerOptions": {
    "target": "ES2020", "module": "CommonJS", "moduleResolution": "Node",
    "strict": true, "skipLibCheck": true, "rootDir": "ts", "outDir": "../.tmp/harness-benchmarks"
  },
  "include": [
    "ts/types.ts", "ts/harnessContracts.ts", "ts/harnessValidation.ts",
    "ts/harnessPackRegistry.ts", "ts/harnessPackBinding.ts", "ts/harnessTaskEvidence.ts",
    "ts/harnessCompletionGate.ts", "ts/harnessProjectCompletionGate.ts",
    "ts/harnessBenchmarkContracts.ts", "ts/harnessBenchmarkContracts.benchmark-test.ts"
  ]
}
```

Create `bloom-runtime/run-harness-benchmark-tests.cjs` so it discovers sorted `*.benchmark-test.js` files and fails on the first non-zero child exit:

```js
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const outputDir = path.resolve(__dirname, '../.tmp/harness-benchmarks');
const tests = fs.readdirSync(outputDir).filter((name) => name.endsWith('.benchmark-test.js')).sort();
if (tests.length === 0) throw new Error(`No Harness benchmark tests found in ${outputDir}`);
for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(outputDir, test)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Harness benchmark module tests passed (${tests.length})`);
```

Run:

```bash
node -e "require('fs').rmSync('.tmp/harness-benchmarks',{recursive:true,force:true})"
pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.harness-benchmarks.json
node bloom-runtime/run-harness-benchmark-tests.cjs
```

Expected: RED because contract functions/types are not implemented yet.
- [ ] **Step 3: Implement benchmark contracts and primitive validation**

Use the exact stable code order below:

```ts
export const HARNESS_BENCHMARK_VIOLATION_CODES = [
  "FIXTURE_SCHEMA_INVALID",
  "PACK_BINDING_INVALID",
  "PACK_BINDING_BLOCKED",
  "TASK_COMPLETION_INVALID",
  "DUPLICATE_EVIDENCE_ID",
  "TASK_NOT_DONE",
  "MISSING_TRUSTED_COMPLETION",
  "TASK_COMPLETION_REJECTED",
  "MISSING_REQUIRED_EVIDENCE",
] as const;
export type HarnessBenchmarkViolationCode = typeof HARNESS_BENCHMARK_VIOLATION_CODES[number];
export type HarnessBenchmarkVerdict = "pass" | "fail" | "invalid";

const HARNESS_BENCHMARK_CASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export function validateHarnessBenchmarkCaseId(value: unknown): string {
  if (typeof value !== "string" || !HARNESS_BENCHMARK_CASE_ID_PATTERN.test(value)) {
    throw new Error(`Bloom Harness benchmark case id is invalid: ${String(value)}`);
  }
  return value;
}
```

The run fixture must keep nested trust-boundary values as `unknown` so the evaluator, not the loader, owns production semantic validation:

```ts
export type HarnessBenchmarkTaskFixture = {
  taskId: string;
  role: ExecutableAgentRole;
  status: TaskRunStatus;
  attempts: number;
  verification: AgentTaskVerification[];
  harnessCompletion: unknown | null;
};
export type HarnessBenchmarkRunFixture = {
  version: 1; caseId: string; description: string; binding: unknown;
  tasks: HarnessBenchmarkTaskFixture[];
  operational: { failureRouteCount: number; replanCount: number };
};
```
Define exact result contracts:

```ts
export type HarnessBenchmarkMetrics = {
  packBound: boolean;
  taskCount: number;
  acceptedTaskCount: number;
  retryCount: number;
  failureRouteCount: number;
  replanCount: number;
  verificationIssueCount: number;
  requiredEvidenceKindsPresent: number;
  requiredEvidenceKindsTotal: number;
  completionGateReady: boolean;
};
export type HarnessBenchmarkResult = {
  version: 1;
  caseId: string;
  verdict: HarnessBenchmarkVerdict;
  violations: HarnessBenchmarkViolationCode[];
  metrics: HarnessBenchmarkMetrics | null;
};
export type HarnessBenchmarkExpected = HarnessBenchmarkResult;
```

Validation requirements:
- case IDs: `/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/` and exact directory-name match.
- description/task IDs: non-empty strings; task IDs unique.
- roles/status/verification statuses: existing production enum values only.
- attempts/failureRouteCount/replanCount/all metric counts: non-negative integers.
- `pass` requires empty violations and non-null metrics.
- `fail` requires at least one violation and non-null metrics.
- `invalid` requires at least one violation and `metrics:null`.
- Validators must return newly constructed normalized objects in the field order declared by the contract; do not return/spread the raw parsed object.

- [ ] **Step 4: Run dedicated benchmark contract tests GREEN**

Run the Task 2 compile/runner commands again. Expected: `harnessBenchmarkContracts.benchmark-test` PASS.

- [ ] **Step 5: Commit**

```bash
git add bloom-runtime/ts/harnessBenchmarkContracts.ts bloom-runtime/ts/harnessBenchmarkContracts.benchmark-test.ts bloom-runtime/tsconfig.harness-benchmarks.json bloom-runtime/run-harness-benchmark-tests.cjs
git commit -m "feat : add bloom harness benchmark contracts"
```

---

### Task 3: Implement the Deterministic Offline Evaluator
**Files:**
- Create: `bloom-runtime/ts/harnessOfflineEvaluator.ts`
- Create: `bloom-runtime/ts/harnessOfflineEvaluator.benchmark-test.ts`
- Modify: `bloom-runtime/tsconfig.harness-benchmarks.json`

**Interfaces:**
- Consumes: validated `HarnessBenchmarkRunFixture` from Task 2.
- Reuses: `validateHarnessPackBinding`, `validateHarnessTaskCompletionRecord`, `evaluateHarnessPackProjectCompletion`.
- Produces: `evaluateHarnessBenchmarkCase(fixture): HarnessBenchmarkResult`.

- [ ] **Step 1: Write evaluator tests for every verdict class**

Begin `harnessOfflineEvaluator.benchmark-test.ts` with the exact test dependencies:

```ts
import * as assert from "node:assert/strict";
import type { HarnessEvidence, HarnessEvidenceKind } from "./harnessContracts";
import { legacyUnboundHarnessPackBinding, resolveHarnessPackBinding } from "./harnessPackBinding";
```

Create helpers that return normalized task fixtures and an explicit bug-fix binding snapshot. Do not infer from the fixture description/request:

```ts
const bugFixBinding = resolveHarnessPackBinding({ intent: "", explicitPack: "bug-fix" });
const evidence = (id: string, kind: HarnessEvidenceKind) => ({ version: 1 as const, id, kind, summary: id });
const accepted = (items: HarnessEvidence[], requiredEvidence: HarnessEvidenceKind[] = []) => ({
  version: 1 as const, accepted: true, evidence: items, requiredEvidence, rejectionReason: null,
});
const task = (taskId: string, completion: unknown | null) => ({
  taskId, role: "frontend" as const, status: "done" as const, attempts: 1,
  verification: [], harnessCompletion: completion,
});
```

Assert a complete bound run passes:

```ts
const complete = validateHarnessBenchmarkRunFixture({
  version: 1, caseId: "complete", description: "complete", binding: bugFixBinding,
  tasks: [task("T1", accepted([
    evidence("file", "file-change"), evidence("review", "review"), evidence("test", "test"),
  ]))],
  operational: { failureRouteCount: 0, replanCount: 0 },
}, "complete");
const result = evaluateHarnessBenchmarkCase(complete);
assert.ok(result.verdict === "pass");
assert.ok(result.metrics?.completionGateReady === true);
```
Add explicit fail/invalid cases:

```ts
const missingTest = structuredClone(complete);
missingTest.caseId = "missing-test";
missingTest.tasks[0].harnessCompletion = accepted([
  evidence("file", "file-change"), evidence("review", "review"),
]);
assert.deepEqual(evaluateHarnessBenchmarkCase(missingTest).violations, ["MISSING_REQUIRED_EVIDENCE"]);

const blocked = structuredClone(complete);
blocked.caseId = "blocked";
blocked.binding = {
  version: 1, status: "blocked", source: "explicit", packId: null, packVersion: null,
  reason: "Unknown Bloom Harness pack: unknown", pack: null,
};
assert.deepEqual(evaluateHarnessBenchmarkCase(blocked).violations, ["PACK_BINDING_BLOCKED"]);

const malformedBinding = structuredClone(complete);
malformedBinding.caseId = "bad-binding";
malformedBinding.binding = { version: 1, status: "bound" };
const badBindingResult = evaluateHarnessBenchmarkCase(malformedBinding);
assert.ok(badBindingResult.verdict === "invalid" && badBindingResult.metrics === null);
assert.deepEqual(badBindingResult.violations, ["PACK_BINDING_INVALID"]);
```

Also cover:
- status `running` → `TASK_NOT_DONE`.
- done + `harnessCompletion:null` → `MISSING_TRUSTED_COMPLETION`.
- valid `accepted:false` + rejection reason → `TASK_COMPLETION_REJECTED`.
- accepted completion missing its own required evidence → `TASK_COMPLETION_INVALID`.
- duplicate evidence ID within one completion and across two completions → `DUPLICATE_EVIDENCE_ID` and `metrics:null`.
- `legacyUnboundHarnessPackBinding(...)` → `pass`, `requiredEvidenceKindsTotal:0`, no inference call.

- [ ] **Step 2: Compile/run dedicated tests and verify RED**

Add evaluator source/test to benchmark tsconfig, then run:

```bash
pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.harness-benchmarks.json
node .tmp/harness-benchmarks/harnessOfflineEvaluator.benchmark-test.js
```

Expected: FAIL because `evaluateHarnessBenchmarkCase` does not exist.
- [ ] **Step 3: Implement minimal evaluator with fail-closed trust validation**

Core flow must be explicit and must not import `inferHarnessPack` or `resolveHarnessPackBinding`:

```ts
export function evaluateHarnessBenchmarkCase(
  fixture: HarnessBenchmarkRunFixture,
): HarnessBenchmarkResult {
  let binding: HarnessPackBinding;
  try {
    binding = validateHarnessPackBinding(fixture.binding);
  } catch {
    return invalidResult(fixture.caseId, ["PACK_BINDING_INVALID"]);
  }

  const taskViews: HarnessProjectCompletionTaskView[] = [];
  const invalid: HarnessBenchmarkViolationCode[] = [];
  const seenEvidenceIds = new Set<string>();

  for (const task of fixture.tasks) {
    let completion: HarnessTaskCompletionRecord | null = null;
    if (task.harnessCompletion !== null) {
      try {
        completion = validateHarnessTaskCompletionRecord(task.harnessCompletion);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        invalid.push(detail.includes("duplicate task evidence id")
          ? "DUPLICATE_EVIDENCE_ID"
          : "TASK_COMPLETION_INVALID");
        continue;
      }
      for (const item of completion.evidence) {
        if (seenEvidenceIds.has(item.id)) invalid.push("DUPLICATE_EVIDENCE_ID");
        seenEvidenceIds.add(item.id);
      }
    }
    taskViews.push({ taskId: task.taskId, status: task.status, harnessCompletion: completion });
  }

  if (invalid.length > 0) return invalidResult(fixture.caseId, invalid);
```

Define the invalid result helper explicitly:

```ts
function invalidResult(caseId: string, violations: HarnessBenchmarkViolationCode[]): HarnessBenchmarkResult {
  return {
    version: 1,
    caseId,
    verdict: "invalid",
    violations: canonicalizeHarnessBenchmarkViolations(violations),
    metrics: null,
  };
}
```

Then classify valid-policy failures and compute metrics from validated completions only:

```ts
  const violations: HarnessBenchmarkViolationCode[] = [];
  if (binding.status === "blocked") violations.push("PACK_BINDING_BLOCKED");
  if (binding.status === "bound") {
    for (const run of taskViews) {
      if (run.status !== "done") violations.push("TASK_NOT_DONE");
      else if (!run.harnessCompletion) violations.push("MISSING_TRUSTED_COMPLETION");
      else if (!run.harnessCompletion.accepted) violations.push("TASK_COMPLETION_REJECTED");
    }
  }

  const gate = evaluateHarnessPackProjectCompletion({ binding, taskRuns: taskViews });
  if (gate.missingEvidenceKinds.length > 0) violations.push("MISSING_REQUIRED_EVIDENCE");

  const trustedEvidence = taskViews.flatMap((run) =>
    run.status === "done" && run.harnessCompletion?.accepted
      ? run.harnessCompletion.evidence
      : [],
  );
  const requiredKinds = binding.status === "bound" && binding.pack
    ? binding.pack.requiredEvidence
    : [];
  const presentKinds = new Set(trustedEvidence.map((item) => item.kind));
  const metrics: HarnessBenchmarkMetrics = {
    packBound: binding.status === "bound",
    taskCount: fixture.tasks.length,
    acceptedTaskCount: taskViews.filter((run) => run.harnessCompletion?.accepted).length,
    retryCount: fixture.tasks.reduce((sum, task) => sum + Math.max(0, task.attempts - 1), 0),
    failureRouteCount: fixture.operational.failureRouteCount,
    replanCount: fixture.operational.replanCount,
    verificationIssueCount: fixture.tasks.flatMap((task) => task.verification)
      .filter((item) => item.status === "failed" || item.status === "blocked").length,
    requiredEvidenceKindsPresent: requiredKinds.filter((kind) => presentKinds.has(kind)).length,
    requiredEvidenceKindsTotal: requiredKinds.length,
    completionGateReady: gate.ready,
  };
```
Return canonicalized violations and exact verdict:

```ts
  const canonical = canonicalizeHarnessBenchmarkViolations(violations);
  return {
    version: 1,
    caseId: fixture.caseId,
    verdict: canonical.length === 0 && gate.ready ? "pass" : "fail",
    violations: canonical,
    metrics,
  };
}
```

`invalidResult(caseId, violations)` must return version 1, canonicalized violations, and `metrics:null`. Do not catch errors from `evaluateHarnessPackProjectCompletion()` after all benchmark-owned validation has succeeded; an unexpected production-validator failure should fail the benchmark process rather than be silently goldenized.

- [ ] **Step 4: Run evaluator tests GREEN and full benchmark tests**

```bash
pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.harness-benchmarks.json
node bloom-runtime/run-harness-benchmark-tests.cjs
```

Expected: contract and evaluator benchmark tests PASS.

- [ ] **Step 5: Run existing project completion regression**

```bash
pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json
node .tmp/bloom-policy-tests/harnessProjectCompletionGate.policy-test.js
```

Expected: PASS, proving evaluator reuse did not change live gate behavior.

- [ ] **Step 6: Commit**

```bash
git add bloom-runtime/ts/harnessOfflineEvaluator.ts bloom-runtime/ts/harnessOfflineEvaluator.benchmark-test.ts bloom-runtime/tsconfig.harness-benchmarks.json
git commit -m "feat : evaluate bloom harness benchmark runs"
```

---

### Task 4: Add Loader, Exact Comparator, and Deterministic Suite
**Files:**
- Create: `bloom-runtime/ts/harnessBenchmarkLoader.ts`
- Create: `bloom-runtime/ts/harnessBenchmarkLoader.benchmark-test.ts`
- Create: `bloom-runtime/ts/harnessBenchmarkComparator.ts`
- Create: `bloom-runtime/ts/harnessBenchmarkComparator.benchmark-test.ts`
- Create: `bloom-runtime/ts/harnessBenchmarkSuite.ts`
- Create: `bloom-runtime/ts/harnessBenchmarkSuite.benchmark-test.ts`
- Modify: `bloom-runtime/tsconfig.harness-benchmarks.json`

**Interfaces:**
- `discoverHarnessBenchmarkCaseIds(rootDir: string): string[]`
- `HarnessBenchmarkFixtureSchemaError extends Error`
- `loadHarnessBenchmarkRunFixture(rootDir: string, caseId: string): HarnessBenchmarkRunFixture`
- `loadHarnessBenchmarkExpected(rootDir: string, caseId: string): HarnessBenchmarkExpected`
- `loadHarnessBenchmarkCase(rootDir: string, caseId: string): HarnessBenchmarkLoadedCase`
- `HarnessBenchmarkLoadedCase = { caseId, caseDir, fixture, expected }`
- `compareHarnessBenchmarkResult(expected, candidate): HarnessBenchmarkComparison`
- `HarnessBenchmarkComparison = { caseId, pass, differences }`
- `runHarnessBenchmarkSuite(rootDir: string): HarnessBenchmarkSuiteResult`
- `serializeHarnessBenchmarkSuiteResult(result): string`

- [ ] **Step 1: Write loader RED tests**

Begin the loader/comparator/suite benchmark tests with:

```ts
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const validRun = (caseId: string) => ({
  version: 1, caseId, description: "loader fixture",
  binding: { version: 1, status: "unbound", source: "none", packId: null, packVersion: null, reason: "loader fixture", pack: null },
  tasks: [], operational: { failureRouteCount: 0, replanCount: 0 },
});
const validExpected = (caseId: string) => ({
  version: 1, caseId, verdict: "pass", violations: [],
  metrics: { packBound: false, taskCount: 0, acceptedTaskCount: 0, retryCount: 0, failureRouteCount: 0, replanCount: 0, verificationIssueCount: 0, requiredEvidenceKindsPresent: 0, requiredEvidenceKindsTotal: 0, completionGateReady: true },
});
```

Use a temporary directory with deliberately unsorted case folders:

```ts
const root = fs.mkdtempSync(path.join(os.tmpdir(), "bloom-benchmark-loader-"));
for (const id of ["z-case", "a-case"]) {
  const dir = path.join(root, id);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify(validRun(id)));
  fs.writeFileSync(path.join(dir, "expected.json"), JSON.stringify(validExpected(id)));
}
assert.deepEqual(discoverHarnessBenchmarkCaseIds(root), ["a-case", "z-case"]);
assert.ok(loadHarnessBenchmarkCase(root, "a-case").fixture.caseId === "a-case");
assert.throws(() => loadHarnessBenchmarkCase(root, "../escape"));
```
Also assert directory/caseId traversal is rejected before path access. A missing `run.json`/`expected.json` must remain a fatal file error. A present `run.json` with malformed JSON or invalid primitive benchmark schema must throw `HarnessBenchmarkFixtureSchemaError`; expected-file parse/schema failures remain fatal golden errors. The loader must not call Pack/task semantic validators.

- [ ] **Step 2: Write comparator/suite RED tests**

Comparator tests must prove exact golden semantics:

```ts
const candidate = validExpected("case-a");
assert.ok(compareHarnessBenchmarkResult(candidate, candidate).pass);
assert.deepEqual(
  compareHarnessBenchmarkResult(candidate, { ...candidate, verdict: "fail", violations: ["TASK_NOT_DONE"] }).differences,
  ["verdict: expected pass, received fail", "violations: expected [], received [TASK_NOT_DONE]"],
);
```

Suite tests must evaluate two valid fixture folders twice and require byte equality, then prove primitive-invalid run schemas are observable verdicts:

```ts
const first = runHarnessBenchmarkSuite(root);
const second = runHarnessBenchmarkSuite(root);
assert.ok(first.passed && second.passed);
assert.ok(serializeHarnessBenchmarkSuiteResult(first) === serializeHarnessBenchmarkSuiteResult(second));
assert.deepEqual(first.cases.map((item) => item.caseId), ["a-case", "z-case"]);

const invalidDir = path.join(root, "schema-invalid");
fs.mkdirSync(invalidDir);
fs.writeFileSync(path.join(invalidDir, "run.json"), JSON.stringify({ ...validRun("schema-invalid"), version: 2 }));
fs.writeFileSync(path.join(invalidDir, "expected.json"), JSON.stringify({
  version: 1, caseId: "schema-invalid", verdict: "invalid",
  violations: ["FIXTURE_SCHEMA_INVALID"], metrics: null,
}));
const withInvalid = runHarnessBenchmarkSuite(root);
assert.ok(withInvalid.passed);
assert.deepEqual(withInvalid.cases.find((item) => item.caseId === "schema-invalid")?.candidate, {
  version: 1, caseId: "schema-invalid", verdict: "invalid",
  violations: ["FIXTURE_SCHEMA_INVALID"], metrics: null,
});
```

- [ ] **Step 3: Add sources/tests to benchmark tsconfig and verify RED**

```bash
pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.harness-benchmarks.json
node bloom-runtime/run-harness-benchmark-tests.cjs
```

Expected: compile/test failure because loader/comparator/suite functions do not exist.
- [ ] **Step 4: Implement loader with lexical discovery and exact identity checks**

```ts
export function discoverHarnessBenchmarkCaseIds(rootDir: string): string[] {
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export class HarnessBenchmarkFixtureSchemaError extends Error {}

export type HarnessBenchmarkLoadedCase = {
  caseId: string;
  caseDir: string;
  fixture: HarnessBenchmarkRunFixture;
  expected: HarnessBenchmarkExpected;
};

function readRequiredJson(filePath: string, label: string): unknown {
  if (!fs.existsSync(filePath) || !fs.lstatSync(filePath).isFile()) {
    throw new Error(`Bloom Harness benchmark ${label} file is missing: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function loadHarnessBenchmarkRunFixture(rootDir: string, caseId: string): HarnessBenchmarkRunFixture {
  const safeCaseId = validateHarnessBenchmarkCaseId(caseId);
  const filePath = path.join(rootDir, safeCaseId, "run.json");
  let parsed: unknown;
  try {
    parsed = readRequiredJson(filePath, `${safeCaseId} run`);
    return validateHarnessBenchmarkRunFixture(parsed, safeCaseId);
  } catch (error) {
    if (!fs.existsSync(filePath) || !fs.lstatSync(filePath).isFile()) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new HarnessBenchmarkFixtureSchemaError(`Bloom Harness benchmark run schema is invalid for ${safeCaseId}: ${detail}`);
  }
}

export function loadHarnessBenchmarkExpected(rootDir: string, caseId: string): HarnessBenchmarkExpected {
  const safeCaseId = validateHarnessBenchmarkCaseId(caseId);
  const filePath = path.join(rootDir, safeCaseId, "expected.json");
  try {
    const parsed = readRequiredJson(filePath, `${safeCaseId} expected`);
    return validateHarnessBenchmarkExpected(parsed, safeCaseId);
  } catch (error) {
    if (!fs.existsSync(filePath) || !fs.lstatSync(filePath).isFile()) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Bloom Harness benchmark expected schema is invalid for ${safeCaseId}: ${detail}`);
  }
}

export function loadHarnessBenchmarkCase(rootDir: string, caseId: string): HarnessBenchmarkLoadedCase {
  const safeCaseId = validateHarnessBenchmarkCaseId(caseId);
  return {
    caseId: safeCaseId,
    caseDir: path.join(rootDir, safeCaseId),
    fixture: loadHarnessBenchmarkRunFixture(rootDir, safeCaseId),
    expected: loadHarnessBenchmarkExpected(rootDir, safeCaseId),
  };
}
```

This module performs no writes.

- [ ] **Step 5: Implement exact comparator**

```ts
export function compareHarnessBenchmarkResult(expected: HarnessBenchmarkExpected, candidate: HarnessBenchmarkResult) {
  const differences: string[] = [];
  if (expected.verdict !== candidate.verdict) differences.push(`verdict: expected ${expected.verdict}, received ${candidate.verdict}`);
  if (JSON.stringify(expected.violations) !== JSON.stringify(candidate.violations)) {
    differences.push(`violations: expected [${expected.violations.join(", ")}], received [${candidate.violations.join(", ")}]`);
  }
  if (JSON.stringify(expected.metrics) !== JSON.stringify(candidate.metrics)) differences.push("metrics differ from golden expectation");
  return { caseId: expected.caseId, pass: differences.length === 0, differences };
}
```
- [ ] **Step 6: Implement deterministic suite orchestration**

```ts
export type HarnessBenchmarkSuiteResult = {
  version: 1;
  passed: boolean;
  cases: Array<{
    caseId: string;
    pass: boolean;
    expected: HarnessBenchmarkExpected;
    candidate: HarnessBenchmarkResult;
    differences: string[];
  }>;
};

export function runHarnessBenchmarkSuite(rootDir: string): HarnessBenchmarkSuiteResult {
  const cases = discoverHarnessBenchmarkCaseIds(rootDir).map((caseId) => {
    const expected = loadHarnessBenchmarkExpected(rootDir, caseId);
    let candidate: HarnessBenchmarkResult;
    try {
      candidate = evaluateHarnessBenchmarkCase(loadHarnessBenchmarkRunFixture(rootDir, caseId));
    } catch (error) {
      if (!(error instanceof HarnessBenchmarkFixtureSchemaError)) throw error;
      candidate = {
        version: 1, caseId, verdict: "invalid",
        violations: ["FIXTURE_SCHEMA_INVALID"], metrics: null,
      };
    }
    const comparison = compareHarnessBenchmarkResult(expected, candidate);
    return { caseId, pass: comparison.pass, expected, candidate, differences: comparison.differences };
  });
  return { version: 1, passed: cases.every((item) => item.pass), cases };
}

export function serializeHarnessBenchmarkSuiteResult(result: HarnessBenchmarkSuiteResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
```

Do not include current time, cwd, absolute fixture paths, random values, or git metadata in the returned object.

- [ ] **Step 7: Run all benchmark module tests GREEN**

```bash
pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.harness-benchmarks.json
node bloom-runtime/run-harness-benchmark-tests.cjs
```

Expected: all benchmark contract/evaluator/loader/comparator/suite tests PASS.

- [ ] **Step 8: Commit**

```bash
git add bloom-runtime/ts/harnessBenchmarkLoader.ts bloom-runtime/ts/harnessBenchmarkLoader.benchmark-test.ts bloom-runtime/ts/harnessBenchmarkComparator.ts bloom-runtime/ts/harnessBenchmarkComparator.benchmark-test.ts bloom-runtime/ts/harnessBenchmarkSuite.ts bloom-runtime/ts/harnessBenchmarkSuite.benchmark-test.ts bloom-runtime/tsconfig.harness-benchmarks.json
git commit -m "feat : run bloom harness benchmark suites"
```

---

### Task 5: Add the CLI, Safe Golden Update Mode, and Package Scripts

**Files:**
- Create: `scripts/harness-benchmark.cjs`
- Create: `scripts/harness-benchmark.policy-test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes Task 4 `loadHarnessBenchmarkRunFixture(rootDir, caseId)` so update mode can create a missing `expected.json` without bypassing run validation.
- CLI commands: `test`, `update --case CASE_ID`, `update --all`.
- Package scripts: `test:harness-benchmarks`, `update:harness-benchmarks`.

- [ ] **Step 1: Write CLI policy tests before the CLI**

The Node test must assert update safety and package wiring:

```js
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.match(pkg.scripts['test:harness-benchmarks'], /tsconfig\.harness-benchmarks\.json/);
assert.match(pkg.scripts['update:harness-benchmarks'], /harness-benchmark\.cjs update/);
const denied = spawnSync(process.execPath, ['scripts/harness-benchmark.cjs', 'update', '--all'], {
  cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'true' },
});
assert.notEqual(denied.status, 0);
assert.match(`${denied.stdout}${denied.stderr}`, /refuses golden updates in CI/i);
```
Also test the local argument-validation paths with CI markers explicitly cleared so GitHub Actions itself cannot mask them:

```js
const localEnv = { ...process.env };
for (const key of ['CI', 'GITHUB_ACTIONS', 'BUILDKITE', 'CIRCLECI', 'JENKINS_URL']) delete localEnv[key];
const missingTarget = spawnSync(process.execPath, ['scripts/harness-benchmark.cjs', 'update'], {
  cwd: root, encoding: 'utf8', env: localEnv,
});
assert.notEqual(missingTarget.status, 0);
assert.match(`${missingTarget.stdout}${missingTarget.stderr}`, /explicit --case CASE_ID or --all/i);
const ambiguous = spawnSync(process.execPath, ['scripts/harness-benchmark.cjs', 'update', '--case', 'a', '--all'], {
  cwd: root, encoding: 'utf8', env: localEnv,
});
assert.notEqual(ambiguous.status, 0);
assert.match(`${ambiguous.stdout}${ambiguous.stderr}`, /explicit --case CASE_ID or --all/i);
```

- [ ] **Step 2: Verify CLI tests RED**

Compile benchmark modules from Task 4, then run:

```bash
pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.harness-benchmarks.json
node --test scripts/harness-benchmark.policy-test.js
```

Expected: RED because the CLI/package scripts do not exist.

- [ ] **Step 3: Implement CLI argument parsing and CI refusal**

Start `scripts/harness-benchmark.cjs` with compiled-module imports only; it must not import worker/evaluator/network modules:

```js
const fs = require('node:fs');
const path = require('node:path');
const {
  HarnessBenchmarkFixtureSchemaError,
  discoverHarnessBenchmarkCaseIds,
  loadHarnessBenchmarkRunFixture,
} = require('../.tmp/harness-benchmarks/harnessBenchmarkLoader.js');
const { evaluateHarnessBenchmarkCase } = require('../.tmp/harness-benchmarks/harnessOfflineEvaluator.js');
const { runHarnessBenchmarkSuite } = require('../.tmp/harness-benchmarks/harnessBenchmarkSuite.js');
const fixtureRoot = path.resolve(__dirname, '../bloom-runtime/fixtures/harness-benchmarks');

function selectedMode() {
  const mode = process.argv[2];
  if (mode !== 'test' && mode !== 'update') {
    throw new Error('Bloom Harness benchmark mode must be test or update.');
  }
  return mode;
}
```

At the top of update mode, reject CI before touching fixture files:

```js
function isCi() {
  return ['CI', 'GITHUB_ACTIONS', 'BUILDKITE', 'CIRCLECI', 'JENKINS_URL']
    .some((name) => Boolean(process.env[name]));
}
function parseUpdateTarget(args) {
  const all = args.includes('--all');
  const caseIndex = args.indexOf('--case');
  const caseId = caseIndex >= 0 ? args[caseIndex + 1] : null;
  if ((all && caseId) || (!all && !caseId)) {
    throw new Error('Bloom Harness benchmark update requires explicit --case CASE_ID or --all.');
  }
  if (caseIndex >= 0 && (!caseId || caseId.startsWith('--'))) {
    throw new Error('Bloom Harness benchmark --case requires a case id.');
  }
  return all ? { all: true, caseId: null } : { all: false, caseId };
}
```

`update` must throw `Bloom Harness benchmark refuses golden updates in CI.` when `isCi()` is true.

- [ ] **Step 4: Implement read-only test mode**

```js
function runTestMode() {
  const result = runHarnessBenchmarkSuite(fixtureRoot);
  console.log('Harness Benchmark Suite');
  console.log(`${result.cases.length} cases`);
  for (const item of result.cases) {
    const expectedVerdict = item.expected.verdict === 'pass' ? '' : ` (expected ${item.expected.verdict})`;
    console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.caseId}${expectedVerdict}`);
  }
  if (!result.passed) process.exitCode = 1;
}
```
- [ ] **Step 5: Implement explicit golden update mode**

Update only `expected.json` and then verify the whole suite:

```js
function evaluateCaseId(caseId) {
  try {
    return evaluateHarnessBenchmarkCase(loadHarnessBenchmarkRunFixture(fixtureRoot, caseId));
  } catch (error) {
    if (!(error instanceof HarnessBenchmarkFixtureSchemaError)) throw error;
    return {
      version: 1, caseId, verdict: 'invalid',
      violations: ['FIXTURE_SCHEMA_INVALID'], metrics: null,
    };
  }
}

function runUpdateMode() {
  if (isCi()) throw new Error('Bloom Harness benchmark refuses golden updates in CI.');
  const target = parseUpdateTarget(process.argv.slice(3));
  const caseIds = target.all
    ? discoverHarnessBenchmarkCaseIds(fixtureRoot)
    : [target.caseId];
  for (const caseId of caseIds) {
    const expected = evaluateCaseId(caseId);
    fs.writeFileSync(
      path.join(fixtureRoot, caseId, 'expected.json'),
      `${JSON.stringify(expected, null, 2)}\n`,
      'utf8',
    );
    console.log(`UPDATED ${caseId}`);
  }
  const verification = runHarnessBenchmarkSuite(fixtureRoot);
  if (!verification.passed) {
    throw new Error('Bloom Harness benchmark golden verification failed after update.');
  }
}

function main() {
  const mode = selectedMode();
  if (mode === 'test') runTestMode();
  else runUpdateMode();
}

main();
```

The CLI must never create/edit `run.json`, call git, add/commit/push files, or infer Pack bindings.

- [ ] **Step 6: Add exact package scripts**

Add:

```json
"test:harness-benchmarks": "node -e \"require('fs').rmSync('.tmp/harness-benchmarks',{recursive:true,force:true})\" && pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.harness-benchmarks.json && node bloom-runtime/run-harness-benchmark-tests.cjs && node --test scripts/harness-benchmark.policy-test.js && node scripts/harness-benchmark.cjs test",
"update:harness-benchmarks": "node -e \"require('fs').rmSync('.tmp/harness-benchmarks',{recursive:true,force:true})\" && pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.harness-benchmarks.json && node scripts/harness-benchmark.cjs update"
```

Do not add benchmark execution to `scripts/harness-check.js`.

- [ ] **Step 7: Run pre-fixture CLI policy tests GREEN**

```bash
pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.harness-benchmarks.json
node bloom-runtime/run-harness-benchmark-tests.cjs
node --test scripts/harness-benchmark.policy-test.js
node --check scripts/harness-benchmark.cjs
```

Expected: all module/policy tests PASS. Do not run full `test:harness-benchmarks` until Task 6 creates fixtures.
- [ ] **Step 8: Commit**

```bash
git add scripts/harness-benchmark.cjs scripts/harness-benchmark.policy-test.js package.json
git commit -m "feat : add bloom harness benchmark cli"
```

---

### Task 6: Add the Six Normalized Golden Cases

**Files:**
- Create: `bloom-runtime/fixtures/harness-benchmarks/bug-fix-complete/run.json`
- Create: `bloom-runtime/fixtures/harness-benchmarks/bug-fix-complete/expected.json`
- Create: `bloom-runtime/fixtures/harness-benchmarks/missing-test-evidence/{run.json,expected.json}`
- Create: `bloom-runtime/fixtures/harness-benchmarks/missing-review-evidence/{run.json,expected.json}`
- Create: `bloom-runtime/fixtures/harness-benchmarks/rejected-task/{run.json,expected.json}`
- Create: `bloom-runtime/fixtures/harness-benchmarks/legacy-unbound/{run.json,expected.json}`
- Create: `bloom-runtime/fixtures/harness-benchmarks/corrupt-duplicate-evidence/{run.json,expected.json}`
- Create: `bloom-runtime/ts/harnessBenchmarkGolden.benchmark-test.ts`
- Modify: `bloom-runtime/tsconfig.harness-benchmarks.json`

**Interfaces:**
- Consumes: the Task 5 update CLI to generate initial `expected.json` files from fixed `run.json` inputs.
- Produces: six committed golden cases, sorted deterministically by case ID.

- [ ] **Step 1: Add a golden-suite test that fails while fixtures are absent**

```ts
import * as assert from "node:assert/strict";
import * as path from "node:path";

const fixtureRoot = path.resolve(__dirname, "../../bloom-runtime/fixtures/harness-benchmarks");
const expectedIds = [
  "bug-fix-complete",
  "corrupt-duplicate-evidence",
  "legacy-unbound",
  "missing-review-evidence",
  "missing-test-evidence",
  "rejected-task",
];
assert.deepEqual(discoverHarnessBenchmarkCaseIds(fixtureRoot), expectedIds);
const first = runHarnessBenchmarkSuite(fixtureRoot);
const second = runHarnessBenchmarkSuite(fixtureRoot);
assert.ok(first.passed && second.passed);
assert.ok(serializeHarnessBenchmarkSuiteResult(first) === serializeHarnessBenchmarkSuiteResult(second));
```
- [ ] **Step 2: Verify the golden-suite test is RED**

Add the test to the benchmark tsconfig and run:

```bash
pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.harness-benchmarks.json
node .tmp/harness-benchmarks/harnessBenchmarkGolden.benchmark-test.js
```

Expected: FAIL because `bloom-runtime/fixtures/harness-benchmarks` does not yet contain the six cases.

- [ ] **Step 3: Author the six fixed `run.json` inputs**

Use an uncommitted one-off helper or write the JSON directly. If using the helper, begin it exactly with:

```js
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('bloom-runtime/fixtures/harness-benchmarks');
```

Every bound case must embed this exact immutable bug-fix snapshot; do not call Pack inference while loading/evaluating fixtures:

```js
const bugFixBinding = {
  version: 1,
  status: 'bound',
  source: 'explicit',
  packId: 'bug-fix',
  packVersion: 1,
  reason: 'Selected from explicit pack request.',
  pack: {
    version: 1,
    id: 'bug-fix',
    requiredRoles: ['debug-router', 'code-review', 'reviewer', 'qa'],
    stages: ['reproduce', 'root-cause', 'regression-test', 'fix', 'review', 'qa'],
    requiredEvidence: ['test', 'file-change', 'review'],
  },
};
const ev = (id, kind) => ({ version: 1, id, kind, summary: id });
const accepted = (evidence, requiredEvidence = ['file-change']) => ({
  version: 1, accepted: true, evidence, requiredEvidence, rejectionReason: null,
});
```
Define the fixed task helper and first three cases exactly:

```js
const task = (taskId, harnessCompletion, overrides = {}) => ({
  taskId, role: 'frontend', status: 'done', attempts: 1,
  verification: [], harnessCompletion, ...overrides,
});
const runs = {
  'bug-fix-complete': {
    version: 1, caseId: 'bug-fix-complete', description: 'Bound bug-fix with complete trusted Pack evidence.',
    binding: bugFixBinding,
    tasks: [task('FIX-001', accepted([
      ev('complete-file', 'file-change'), ev('complete-review', 'review'), ev('complete-test', 'test'),
    ]), { verification: [{ name: 'tests', status: 'passed', details: 'synthetic pass' }] })],
    operational: { failureRouteCount: 0, replanCount: 0 },
  },
  'missing-test-evidence': {
    version: 1, caseId: 'missing-test-evidence', description: 'Bound bug-fix missing project-level test evidence.',
    binding: bugFixBinding,
    tasks: [task('FIX-001', accepted([
      ev('missing-test-file', 'file-change'), ev('missing-test-review', 'review'),
    ]), { attempts: 2, verification: [{ name: 'tests', status: 'failed', details: 'synthetic failure' }] })],
    operational: { failureRouteCount: 1, replanCount: 1 },
  },
  'missing-review-evidence': {
    version: 1, caseId: 'missing-review-evidence', description: 'Bound bug-fix missing project-level review evidence.',
    binding: bugFixBinding,
    tasks: [task('FIX-001', accepted([
      ev('missing-review-file', 'file-change'), ev('missing-review-test', 'test'),
    ]), { verification: [{ name: 'review-check', status: 'blocked', details: 'synthetic block' }] })],
    operational: { failureRouteCount: 0, replanCount: 0 },
  },
```
  'rejected-task': {
    version: 1, caseId: 'rejected-task', description: 'Bound bug-fix with a valid rejected trusted completion.',
    binding: bugFixBinding,
    tasks: [task('FIX-001', {
      version: 1, accepted: false, evidence: [], requiredEvidence: [],
      rejectionReason: 'implementation incomplete',
    })],
    operational: { failureRouteCount: 0, replanCount: 0 },
  },
  'legacy-unbound': {
    version: 1, caseId: 'legacy-unbound', description: 'Legacy run remains explicitly unbound without current inference.',
    binding: {
      version: 1, status: 'unbound', source: 'none', packId: null, packVersion: null,
      reason: 'Legacy benchmark fixture predates live pack binding.', pack: null,
    },
    tasks: [task('LEGACY-001', null, { attempts: 2 })],
    operational: { failureRouteCount: 1, replanCount: 2 },
  },
  'corrupt-duplicate-evidence': {
    version: 1, caseId: 'corrupt-duplicate-evidence', description: 'Two trusted task completions reuse one evidence id.',
    binding: bugFixBinding,
    tasks: [
      task('FIX-001', accepted([ev('duplicate-evidence', 'file-change')], ['file-change'])),
      task('REV-001', accepted([ev('duplicate-evidence', 'review')], ['review']), { role: 'code-review' }),
    ],
    operational: { failureRouteCount: 0, replanCount: 0 },
  },
};
for (const [caseId, run] of Object.entries(runs)) {
  const dir = path.join(root, caseId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
}
```

Do not commit the one-off authoring helper. Only the six `run.json` inputs belong in git.
- [ ] **Step 4: Generate initial `expected.json` files through the explicit update path**

Run locally with CI variables unset:

```bash
pnpm run update:harness-benchmarks -- --all
```

Expected output contains exactly six `UPDATED CASE_ID` lines and the command exits 0 after full-suite verification. Inspect `git diff -- bloom-runtime/fixtures/harness-benchmarks` and verify only `expected.json` files were added beside the fixed `run.json` inputs.

- [ ] **Step 5: Extend the golden test with the exact semantic matrix**

After `const first = runHarnessBenchmarkSuite(fixtureRoot)`, summarize candidates deterministically:

```ts
const compact = Object.fromEntries(first.cases.map(({ caseId, candidate }) => [caseId, {
  verdict: candidate.verdict,
  violations: candidate.violations,
  metrics: candidate.metrics && {
    packBound: candidate.metrics.packBound,
    taskCount: candidate.metrics.taskCount,
    acceptedTaskCount: candidate.metrics.acceptedTaskCount,
    retryCount: candidate.metrics.retryCount,
    failureRouteCount: candidate.metrics.failureRouteCount,
    replanCount: candidate.metrics.replanCount,
    verificationIssueCount: candidate.metrics.verificationIssueCount,
    evidence: `${candidate.metrics.requiredEvidenceKindsPresent}/${candidate.metrics.requiredEvidenceKindsTotal}`,
    ready: candidate.metrics.completionGateReady,
  },
}]));
```

Assert the exact matrix below; this prevents a blanket golden update from hiding evaluator regressions.
```ts
assert.deepEqual(compact, {
  "bug-fix-complete": {
    verdict: "pass", violations: [],
    metrics: { packBound: true, taskCount: 1, acceptedTaskCount: 1, retryCount: 0, failureRouteCount: 0, replanCount: 0, verificationIssueCount: 0, evidence: "3/3", ready: true },
  },
  "corrupt-duplicate-evidence": {
    verdict: "invalid", violations: ["DUPLICATE_EVIDENCE_ID"], metrics: null,
  },
  "legacy-unbound": {
    verdict: "pass", violations: [],
    metrics: { packBound: false, taskCount: 1, acceptedTaskCount: 0, retryCount: 1, failureRouteCount: 1, replanCount: 2, verificationIssueCount: 0, evidence: "0/0", ready: true },
  },
  "missing-review-evidence": {
    verdict: "fail", violations: ["MISSING_REQUIRED_EVIDENCE"],
    metrics: { packBound: true, taskCount: 1, acceptedTaskCount: 1, retryCount: 0, failureRouteCount: 0, replanCount: 0, verificationIssueCount: 1, evidence: "2/3", ready: false },
  },
  "missing-test-evidence": {
    verdict: "fail", violations: ["MISSING_REQUIRED_EVIDENCE"],
    metrics: { packBound: true, taskCount: 1, acceptedTaskCount: 1, retryCount: 1, failureRouteCount: 1, replanCount: 1, verificationIssueCount: 1, evidence: "2/3", ready: false },
  },
  "rejected-task": {
    verdict: "fail", violations: ["TASK_COMPLETION_REJECTED", "MISSING_REQUIRED_EVIDENCE"],
    metrics: { packBound: true, taskCount: 1, acceptedTaskCount: 0, retryCount: 0, failureRouteCount: 0, replanCount: 0, verificationIssueCount: 0, evidence: "0/3", ready: false },
  },
});
```
- [ ] **Step 6: Run the dedicated golden test GREEN**

```bash
pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.harness-benchmarks.json
node .tmp/harness-benchmarks/harnessBenchmarkGolden.benchmark-test.js
```

Expected: PASS with all six IDs, exact matrix, and byte-identical repeated suite serialization.

- [ ] **Step 7: Prove normal test mode is read-only**

Stage only the fixture directory as a comparison baseline, then run the full benchmark command twice:

```bash
git add bloom-runtime/fixtures/harness-benchmarks bloom-runtime/ts/harnessBenchmarkGolden.benchmark-test.ts bloom-runtime/tsconfig.harness-benchmarks.json
pnpm run test:harness-benchmarks
pnpm run test:harness-benchmarks
git diff --exit-code -- bloom-runtime/fixtures/harness-benchmarks
```

Expected: both benchmark runs PASS and `git diff --exit-code` returns 0, proving test mode did not alter staged `run.json` or `expected.json` content.

Expected CLI case lines:

```text
PASS bug-fix-complete
PASS corrupt-duplicate-evidence (expected invalid)
PASS legacy-unbound
PASS missing-review-evidence (expected fail)
PASS missing-test-evidence (expected fail)
PASS rejected-task (expected fail)
```

- [ ] **Step 8: Commit**

```bash
git commit -m "test : add bloom harness benchmark goldens"
```

Verify after commit that `.tmp/` remains untracked and no helper script was included:

```bash
git status --short --branch
git show --stat --oneline HEAD
```

---

### Task 7: Integrate CI, Run Full Verification, and Prepare the PR
**Files:**
- Modify: `.github/workflows/harness.yml`
- Modify: `scripts/harness-benchmark.policy-test.js`

**Interfaces:**
- CI must invoke the already-defined `pnpm run test:harness-benchmarks` command as its own named step.
- No benchmark behavior is added to `scripts/harness-check.js`.

- [ ] **Step 1: Write the workflow-order RED assertion**

Extend `scripts/harness-benchmark.policy-test.js`:

```js
const workflow = fs.readFileSync(path.join(root, '.github/workflows/harness.yml'), 'utf8');
const runtimeIndex = workflow.indexOf('Run Bloom agent runtime policy tests');
const benchmarkIndex = workflow.indexOf('Run Harness offline benchmarks');
const workerIndex = workflow.indexOf('Build Bloom headless worker');
assert.ok(runtimeIndex >= 0 && benchmarkIndex > runtimeIndex, 'benchmark step must follow Bloom runtime policy tests');
assert.ok(workerIndex > benchmarkIndex, 'benchmark step must run before headless worker build');
assert.match(workflow, /Run Harness offline benchmarks[\s\S]*run: pnpm run test:harness-benchmarks/);
```

- [ ] **Step 2: Run policy test and verify RED**

```bash
node --test scripts/harness-benchmark.policy-test.js
```

Expected: FAIL because the workflow step is absent.

- [ ] **Step 3: Add the independent GitHub Actions step**

Insert exactly between runtime policy tests and worker build:

```yaml
      - name: Run Harness offline benchmarks
        run: pnpm run test:harness-benchmarks
```

Do not merge it into another step and do not change the existing production harness invariant step.
- [ ] **Step 4: Re-run workflow policy and benchmark suite GREEN**

```bash
node --test scripts/harness-benchmark.policy-test.js
pnpm run test:harness-benchmarks
```

Expected: both PASS; benchmark CLI reports six passing benchmark cases, including expected fail/invalid semantic cases.

- [ ] **Step 5: Commit CI integration**

```bash
git add .github/workflows/harness.yml scripts/harness-benchmark.policy-test.js
git commit -m "ci : gate bloom harness benchmarks"
```

- [ ] **Step 6: Rebase onto latest main before final verification**

```bash
git fetch origin
git rebase origin/main
```

If rebase rewrites commits or resolves conflicts, re-run every verification command below from the rebased tree before pushing. Never reuse pre-rebase results.

- [ ] **Step 7: Run the feature-focused verification set**

```bash
pnpm run test:harness-benchmarks
pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json
node .tmp/bloom-policy-tests/harnessProjectCompletionGate.policy-test.js
node .tmp/bloom-policy-tests/harnessTaskEvidence.policy-test.js
node .tmp/bloom-policy-tests/harnessPackBinding.policy-test.js
node .tmp/bloom-policy-tests/headlessBuilderExecutor.policy-test.js
node --test scripts/harness-benchmark.policy-test.js
```

Expected: all PASS. If a listed compiled test name changed on latest main, use the exact current file name representing the same production boundary and record that adjustment in the PR verification section.

- [ ] **Step 8: Run broad repository regressions/builds**

```bash
pnpm run test:production-runtime
pnpm run build:bloom-worker
pnpm --dir apps/desktop run build
cargo check --manifest-path bloom-runtime/Cargo.toml
git diff --check origin/main...HEAD
```
All commands must PASS. Existing Rust unused-code warnings are acceptable only if unchanged from main; any new warning from benchmark work must be fixed.

- [ ] **Step 9: Run the full Bloom policy suite with platform-aware evidence**

First run the canonical command:

```bash
pnpm run test:bloom-runtime
```

On Linux, expected: full PASS with no exclusions. On Windows, if and only if the run stops on the unchanged known platform-sensitive `lunaServerRuntime.policy-test.js` and/or `lunaStaticRelease.policy-test.js`, verify every other compiled policy test with PowerShell:

```powershell
$excluded = @('lunaServerRuntime.policy-test.js', 'lunaStaticRelease.policy-test.js')
$passed = 0
Get-ChildItem .tmp/bloom-policy-tests -Filter '*.policy-test.js' |
  Where-Object { $excluded -notcontains $_.Name } |
  Sort-Object Name |
  ForEach-Object {
    node $_.FullName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $passed += 1
  }
Write-Output "WINDOWS_FILTERED_POLICY_PASS=$passed"
```

Do not add new exclusions. GitHub Actions Ubuntu full-suite success is the authoritative cross-platform result before merge.

- [ ] **Step 10: Review the benchmark trust boundary directly**

Run:

```bash
git grep -n "inferHarnessPack\|resolveHarnessPackBinding" -- bloom-runtime/ts/harnessBenchmark*.ts bloom-runtime/ts/harnessOfflineEvaluator.ts
git grep -n "fetch(\|https:\|github\|EvaluatorWorker\|SeniorEvaluator" -- bloom-runtime/ts/harnessBenchmark*.ts bloom-runtime/ts/harnessOfflineEvaluator.ts scripts/harness-benchmark.cjs
git grep -n "evidence: string\[\]" -- bloom-runtime/ts/harnessBenchmark*.ts bloom-runtime/ts/harnessOfflineEvaluator.ts
```

Expected: no evaluator/loader/suite imports or calls that infer Packs, use network/LLM/GitHub, or consume legacy free-form evidence. A type/documentation-only textual hit must be manually inspected and must not represent executable trust promotion.
- [ ] **Step 11: Inspect final scope and protect untracked artifacts**

```bash
git status --short --branch
git diff --name-only origin/main...HEAD
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Expected tracked scope is limited to the design/plan docs, benchmark TypeScript modules/tests, six fixture directories, benchmark tsconfig/runner, CLI/policy test, package scripts, project-gate structural type refactor, and Harness workflow. Do not stage or force-clean `.tmp/`, Rust `target/`, generated `Cargo.lock`, or unrelated local artifacts.

- [ ] **Step 12: Push and open the implementation PR**

Push the implementation branch only after all fresh verification above:

```bash
git push -u origin HEAD
```

Create a PR titled exactly:

```text
feat : add bloom harness offline benchmarks
```

The PR body must describe: deterministic offline scope; six golden cases; `pass/fail/invalid` taxonomy; production Pack/trusted-evidence validator reuse; read-only test vs explicit update workflow; no LLM/network/live execution; exact local verification results from Steps 7-10; and the Windows-only baseline exclusions only when they were actually observed.

- [ ] **Step 13: Inspect PR changed files and head SHA**

Compare the remote PR changed-file list against:

```bash
git diff --name-only origin/main...HEAD
git rev-parse HEAD
```

Any unexpected file is a blocker. Record the exact PR head SHA and do not merge a different head without rerunning verification.

- [ ] **Step 14: Request code review for the exact PR head**

Invoke the `superpowers:requesting-code-review` workflow against the exact recorded head SHA. Review at minimum the benchmark trust boundary, schema-invalid handling, golden update safety, deterministic serialization, and production gate compatibility. Any valid finding is a blocker: fix it in a focused commit, then repeat Steps 6-14 from the new head before relying on previous verification.

- [ ] **Step 15: Require the GitHub Harness workflow to be fully green**

For the unchanged PR head SHA, require the Ubuntu Harness job to complete successfully, including:
- `Run Bloom agent runtime policy tests`
- `Run Harness offline benchmarks`
- `Build Bloom headless worker`
- both Rust checks
- `Run harness invariants`

If CI changes the branch or a fix commit is added, repeat Steps 6-14 from the new head.
- [ ] **Step 16: Merge only the verified unchanged head**

Immediately before merge:

```bash
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
```

If `origin/main` advanced after the final rebase/verification, rebase again and repeat Steps 7-15. Otherwise merge the PR only when its recorded head SHA still equals local/remote branch HEAD and Harness CI is green for that exact SHA.

Immediately before claiming the feature complete, invoke `superpowers:verification-before-completion` and verify the fresh evidence from Steps 7-15. After merge verification, use `superpowers:finishing-a-development-branch` for branch/worktree cleanup decisions rather than deleting branches ad hoc.

After merge, verify the remote main branch contains the merge result:

```bash
git fetch origin
git log --oneline -3 origin/main
```

Do not delete protected `main`/`develop` branches. Feature/docs branch cleanup may happen only after merge verification and only if no other worktree depends on them.

---

## Expected Commit Sequence

1. `refactor : narrow bloom harness completion input`
2. `feat : add bloom harness benchmark contracts`
3. `feat : evaluate bloom harness benchmark runs`
4. `feat : run bloom harness benchmark suites`
5. `feat : add bloom harness benchmark cli`
6. `test : add bloom harness benchmark goldens`
7. `ci : gate bloom harness benchmarks`

Keep commits this small unless a rebase folds docs-only commits from the approved spec/plan branch into the implementation branch. Never mix unrelated Bloom E2E, Luna release, or Local Agent fixes into this feature.
