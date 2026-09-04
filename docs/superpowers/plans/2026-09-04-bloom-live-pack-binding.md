# Bloom Live Pack Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind live Bloom projects to an immutable Harness pack snapshot, repair PM plans that violate a bound pack, persist runtime-owned task evidence, and block desktop review/headless merge until pack-wide evidence is satisfied.

**Architecture:** Add pure pack binding, plan-policy, task-evidence, and project-completion modules first. Desktop and headless runtimes keep their existing side-effect ownership but share the same binding snapshot, planning context, semantic retry policy, plan validator, and final pack gate. Legacy persisted state migrates to explicit `unbound` without re-inferring against the current registry.

**Tech Stack:** TypeScript, Node 22, existing Bloom policy-test runner, Tauri invoke bridge, existing headless Builder snapshot protocol.

**Spec:** `docs/superpowers/specs/2026-09-04-bloom-live-pack-binding-design.md`

## Global Constraints

- Pack resolution happens once before PM planning and is persisted before PM side effects.
- Existing unmatched feature work remains explicitly `unbound`; only a matched or explicitly selected pack is enforced.
- Unknown explicit pack ids fail closed as durable `blocked` bindings.
- Recovery never re-resolves an existing binding.
- Legacy persisted projects/snapshots migrate once to `unbound` and are never inferred retroactively.
- Runtime must not auto-insert tasks to satisfy a pack; PM owns task creation and repair. Bound plans are checked once before deterministic task injection and again after preparation.
- `bug-fix` fix work must be downstream of `debug-router`; `data-marketing` and `documentation` cannot satisfy the fix stage.
- Legacy Agent report strings never satisfy pack evidence; only persisted Runtime Completion Adapter evidence counts.
- Headless merge and desktop `review` transition occur only after the pack-wide completion gate passes.
- Do not add feature-development, documentation, deployment, marketplace, or third-party packs in this phase.
- Do not wire the Run Artifact Store into every live path in this phase; keep the binding snapshot serializable for that future integration.
- Do not build the benchmark Evaluator in this phase.

---
## File Structure

- `bloom-runtime/ts/harnessPackRegistry.ts`: canonical pack lookup/inference only; preserve the existing throwing resolver API.
- `bloom-runtime/ts/harnessPackBinding.ts`: durable binding contract, resolver, validator, and legacy-unbound migration helper.
- `bloom-runtime/ts/harnessPackPlanPolicy.ts`: PM planning context plus prepared-plan semantic validation for a bound pack.
- `bloom-runtime/ts/harnessTaskEvidence.ts`: persisted runtime-owned task completion record and validator.
- `bloom-runtime/ts/harnessProjectCompletionGate.ts`: aggregate trusted task evidence and evaluate project-level pack completion.
- `bloom-runtime/ts/pmPlanningPolicy.ts`: shared bounded PM semantic repair loop used by desktop and headless runtime bridges.
- `bloom-runtime/ts/runtimeTaskCompletion.ts`: persist the Runtime Completion Adapter decision on each task run.
- `bloom-runtime/ts/store.ts`: desktop binding lifecycle, legacy state hydration, Harness failure source, and final project pack gate.
- `bloom-runtime/ts/runtime.ts`: plan-only desktop PM flow, semantic repair, then repository bootstrap.
- `bloom-runtime/ts/builderWorkerAdapter.ts`: optional explicit `harnessPackId` on claims.
- `bloom-runtime/ts/headlessBuilderExecutor.ts`: durable pack binding in snapshot, recovery validation, defensive plan validation, and pre-merge pack gate.
- `bloom-worker/run.js`: use the shared PM repair policy and pack plan validator inside the existing bridge retry boundary.

---

### Task 1: Durable Pack Binding and Conservative Resolution

**Files:**
- Modify: `bloom-runtime/ts/harnessPackRegistry.ts`
- Modify: `bloom-runtime/ts/harnessPackRegistry.policy-test.ts`
- Create: `bloom-runtime/ts/harnessPackBinding.ts`
- Create: `bloom-runtime/ts/harnessPackBinding.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`
**Interfaces:**
- Produces: `findHarnessPackById(id): HarnessPack | null`.
- Produces: `inferHarnessPack(intent): HarnessPackResolution | null`.
- Produces: `resolveHarnessPackBinding({ intent, explicitPack }): HarnessPackBinding`.
- Produces: `validateHarnessPackBinding(value): HarnessPackBinding`.
- Produces: `legacyUnboundHarnessPackBinding(reason): HarnessPackBinding`.

`HarnessPackBinding` is:

```ts
export type HarnessPackBinding = {
  version: 1;
  status: "bound" | "unbound" | "blocked";
  source: "explicit" | "intent" | "none";
  packId: string | null;
  packVersion: 1 | null;
  reason: string;
  pack: {
    version: 1;
    id: string;
    requiredRoles: ExecutableAgentRole[];
    stages: string[];
    requiredEvidence: HarnessEvidenceKind[];
  } | null;
};
```

- [x] **Step 1: Write failing resolution/binding tests**
```ts
const explicit = resolveHarnessPackBinding({ intent: "ship feature", explicitPack: "bug-fix" });
assert.equal(explicit.status, "bound");
assert.equal(explicit.source, "explicit");
assert.equal(explicit.pack?.id, "bug-fix");

for (const intent of ["Fix login crash", "로그인 버그 고쳐", "결제 오류", "회귀 문제 고치자"]) {
  const inferred = resolveHarnessPackBinding({ intent });
  assert.equal(inferred.status, "bound", intent);
  assert.equal(inferred.source, "intent", intent);
}

assert.equal(resolveHarnessPackBinding({ intent: "Add profile page" }).status, "unbound");
assert.equal(resolveHarnessPackBinding({ intent: "화면 수정" }).status, "unbound");
assert.equal(resolveHarnessPackBinding({ intent: "x", explicitPack: "unknown" }).status, "blocked");
assert.equal(legacyUnboundHarnessPackBinding("legacy").status, "unbound");
assert.throws(() => validateHarnessPackBinding({ version: 2 }), /version|Unsupported/);
```

- [x] **Step 2: Run focused tests and verify RED**

Run: `pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json && node .tmp/bloom-policy-tests/harnessPackBinding.policy-test.js`

Expected: FAIL because `harnessPackBinding.ts` and new registry helpers do not exist.

- [x] **Step 3: Implement registry helpers and binding contract**

Preserve `resolveHarnessPack()` behavior for existing callers. Extend the intent matcher only with `버그|오류|에러|크래시|회귀|고쳐|고치`; do not infer from broad `수정` alone. Copy pack arrays into the binding snapshot so later registry mutation cannot mutate persisted bindings.
- [x] **Step 4: Run focused tests and verify GREEN**

Run the same compile + `harnessPackRegistry.policy-test.js` + `harnessPackBinding.policy-test.js` commands.

Expected: PASS; old throwing resolver tests remain unchanged.

- [x] **Step 5: Commit**

```bash
git add bloom-runtime/ts/harnessPackRegistry.ts bloom-runtime/ts/harnessPackRegistry.policy-test.ts bloom-runtime/ts/harnessPackBinding.ts bloom-runtime/ts/harnessPackBinding.policy-test.ts bloom-runtime/tsconfig.policy-tests.json
git commit -m "feat : bind bloom harness packs"
```

---

### Task 2: Pack-Aware PM Plan Policy

**Files:**
- Create: `bloom-runtime/ts/harnessPackPlanPolicy.ts`
- Create: `bloom-runtime/ts/harnessPackPlanPolicy.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`
- Modify: `bloom-runtime/tsconfig.worker.json`

**Interfaces:**
- Consumes: `HarnessPackBinding`, `ProjectPlan`, `taskTransitivelyDependsOn`, `REPOSITORY_WRITER_ROLES`.
- Produces: `harnessPackPlanningContext(binding): string`.
- Produces: `evaluateHarnessPackPlan(binding, plan): { ready: boolean; reasons: string[] }`.
- Produces: `assertHarnessPackPlan(binding, plan): ProjectPlan`.
- Error prefix: `Bloom Harness pack plan rejected:` so PM repair can classify it deterministically.
- [x] **Step 1: Write failing semantic plan tests**

```ts
function task(id: string, role: ProjectTaskPlan["role"], dependsOn: string[]): ProjectTaskPlan {
  return { id, title: id, role, taskSlug: id.toLowerCase(), summary: id, dependsOn, acceptanceCriteria: ["done"] };
}
function plan(tasks: ProjectTaskPlan[]): ProjectPlan {
  return { projectName: "Pack", repositoryName: "pack", productSummary: "pack", architectureSummary: "pack", needsAuth: false, technologyDecisions: [], tasks };
}

const binding = resolveHarnessPackBinding({ intent: "Fix login crash" });
const governanceOnly = plan([
  task("DBG", "debug-router", []), task("MKT", "data-marketing", ["DBG"]),
  task("DOC", "documentation", ["MKT"]), task("CR", "code-review", ["DOC"]),
  task("REV", "reviewer", ["CR"]), task("QA", "qa", ["REV"]),
]);
assert.equal(evaluateHarnessPackPlan(binding, governanceOnly).ready, false);

const independentFix = plan([task("DBG", "debug-router", []), task("FE", "frontend", []), task("CR", "code-review", ["FE"]), task("REV", "reviewer", ["CR"]), task("QA", "qa", ["REV"])]);
assert.throws(() => assertHarnessPackPlan(binding, independentFix), /downstream|fix/);

const valid = plan([task("DBG", "debug-router", []), task("FE", "frontend", ["DBG"]), task("CR", "code-review", ["FE"]), task("REV", "reviewer", ["CR"]), task("QA", "qa", ["REV"])]);
assert.equal(assertHarnessPackPlan(binding, valid), valid);
assert.match(harnessPackPlanningContext(binding), /bug-fix/);
assert.equal(harnessPackPlanningContext(resolveHarnessPackBinding({ intent: "Add profile" })), "");
```

- [x] **Step 2: Run focused test and verify RED**

Run: `pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json && node .tmp/bloom-policy-tests/harnessPackPlanPolicy.policy-test.js`

Expected: FAIL because the plan-policy module is missing.

- [x] **Step 3: Implement semantic mapping**

Use all `BUG_FIX_PACK.requiredRoles`, then require at least one writer from `REPOSITORY_WRITER_ROLES` excluding `debug-router`, `data-marketing`, and `documentation` that transitively depends on a `debug-router`. Require downstream `code-review -> reviewer -> qa` for that fix writer. `unbound` returns ready; `blocked` returns a deterministic reason.
- [x] **Step 4: Verify GREEN and worker compilation**

Run the focused policy test, then `pnpm run build:bloom-worker`.

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add bloom-runtime/ts/harnessPackPlanPolicy.ts bloom-runtime/ts/harnessPackPlanPolicy.policy-test.ts bloom-runtime/tsconfig.policy-tests.json bloom-runtime/tsconfig.worker.json
git commit -m "feat : validate bloom pack plans"
```

---

### Task 3: Persist Trusted Task Evidence and Aggregate Pack Completion

**Files:**
- Create: `bloom-runtime/ts/harnessTaskEvidence.ts`
- Create: `bloom-runtime/ts/harnessTaskEvidence.policy-test.ts`
- Create: `bloom-runtime/ts/harnessProjectCompletionGate.ts`
- Create: `bloom-runtime/ts/harnessProjectCompletionGate.policy-test.ts`
- Modify: `bloom-runtime/ts/types.ts`
- Modify: `bloom-runtime/ts/runtimeTaskCompletion.ts`
- Modify: `bloom-runtime/ts/runtimeTaskCompletion.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`

**Interfaces:**

```ts
export type HarnessTaskCompletionRecord = {
  version: 1;
  accepted: boolean;
  evidence: HarnessEvidence[];
  requiredEvidence: HarnessEvidenceKind[];
  rejectionReason: string | null;
};
```

- Produces: `validateHarnessTaskCompletionRecord(value)`.
- Adds: `ProjectTaskRun.harnessCompletion?: HarnessTaskCompletionRecord | null`.
- Produces: `evaluateHarnessPackProjectCompletion({ binding, taskRuns })`.
- [x] **Step 1: Write failing persistence and aggregate-gate tests**

```ts
// Extend the existing validWriter case in runtimeTaskCompletion.policy-test.ts:
assert(validWriter.harnessCompletion?.accepted === true, "accepted writer must persist Harness completion");
assert(validWriter.harnessCompletion.evidence.some((item) => item.kind === "file-change"), "writer record must persist file-change evidence");

const ev = (id: string, kind: HarnessEvidenceKind): HarnessEvidence => ({ version: 1, id, kind, summary: id });
function doneRun(taskId: string, role: ProjectTaskRun["role"], evidence: HarnessEvidence[]): ProjectTaskRun {
  return {
    taskId, role, agentId: `rose:${role}`, status: "done", attempts: 1,
    branchName: null, worktreePath: null, threadId: null, sessionId: null, turnId: null,
    eventsPath: null, stderrPath: null, commitSha: null, pullRequestNumber: null, pullRequestUrl: null,
    reviewedPullRequests: [], summary: "done", rationaleSummary: "done", evidence: [], verification: [], blockers: [], lastError: null,
    startedAt: "2026-09-04T00:00:00Z", completedAt: "2026-09-04T00:01:00Z",
    harnessCompletion: { version: 1, accepted: true, evidence, requiredEvidence: [], rejectionReason: null },
  };
}
const binding = resolveHarnessPackBinding({ intent: "Fix login crash" });
const gate = evaluateHarnessPackProjectCompletion({ binding, taskRuns: [
  doneRun("FE", "frontend", [ev("file", "file-change")]),
  doneRun("REV", "reviewer", [ev("review", "review")]),
  doneRun("QA", "qa", [ev("test", "test")]),
] });
assert.equal(gate.ready, true);

const legacy = { ...doneRun("LEGACY", "qa", []), harnessCompletion: null, evidence: ["test passed"] };
const legacyGate = evaluateHarnessPackProjectCompletion({ binding, taskRuns: [legacy] });
assert.equal(legacyGate.ready, false);
assert(legacyGate.missingEvidenceKinds.includes("test"));
```

Also assert invalid/duplicate structured evidence fails closed and a bound `done` run without a valid `harnessCompletion` record cannot satisfy the gate.

- [x] **Step 2: Run focused tests and verify RED**

Expected: missing persisted record/project gate APIs.

- [x] **Step 3: Implement record validation and persistence**

`applyRuntimeCompletionToTaskRun()` stores a validated record from the Runtime Completion Adapter decision. `emptyTaskRun()`, headless `initialTaskRun()`, and `retryInterruptedTask()` initialize/reset the field to `null`; `retryBlockedAgentTasks()` also clears it before a new attempt. Rejected decisions retain their structured record for audit but never count as accepted evidence.
- [x] **Step 4: Implement project pack gate**

For `unbound`, return ready. For `blocked`, return not-ready with the binding reason. For `bound`, validate every `done` task's persisted Harness record, collect evidence only from accepted records, then call `evaluateHarnessCompletion()` with a synthetic project `done` result referencing exactly those evidence ids and the pack snapshot's `requiredEvidence`.

- [x] **Step 5: Verify GREEN**

Run the four focused policy tests: task evidence, project gate, runtime completion adapter, and runtime task completion.

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add bloom-runtime/ts/harnessTaskEvidence.ts bloom-runtime/ts/harnessTaskEvidence.policy-test.ts bloom-runtime/ts/harnessProjectCompletionGate.ts bloom-runtime/ts/harnessProjectCompletionGate.policy-test.ts bloom-runtime/ts/types.ts bloom-runtime/ts/runtimeTaskCompletion.ts bloom-runtime/ts/runtimeTaskCompletion.policy-test.ts bloom-runtime/tsconfig.policy-tests.json
git commit -m "feat : persist bloom harness task evidence"
```

---

### Task 4: Desktop Project Binding and Final Pack Gate

**Files:**
- Modify: `bloom-runtime/ts/types.ts`
- Modify: `bloom-runtime/ts/store.ts`
- Create: `bloom-runtime/ts/storeHarnessPack.policy-test.ts`
- Modify: `bloom-runtime/ts/storeCompletion.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`
**Interfaces:**
- Adds: `RuntimeFailureSource = "pm" | "agent" | "harness"`.
- Adds: `ProjectState.harnessPackBinding?: HarnessPackBinding | null`.
- Produces: `bindProjectHarnessPack(state, projectId, explicitPack?): { state: ProjectTeamsState; binding: HarnessPackBinding }`.

- [x] **Step 1: Write failing store lifecycle tests**

```ts
const started = startProject(createInitialProjectTeamsState(), "로그인 버그 고쳐");
assert(started.ok && started.project.harnessPackBinding === null);

const bound = bindProjectHarnessPack(started.state, started.project.id);
assert.equal(bound.binding.status, "bound");
assert.equal(bound.state.projects[0]?.harnessPackBinding?.packId, "bug-fix");

const rebound = bindProjectHarnessPack(bound.state, started.project.id, "unknown");
assert.deepEqual(rebound.binding, bound.binding); // immutable after first resolution
```

Add tests that an unknown explicit pack blocks with `runtimeFailureSource === "harness"`, a legacy project missing the property hydrates to `unbound` without inference, and a bound all-done project with an incomplete pack gate remains `blocked` instead of entering `review`.

- [x] **Step 2: Run focused store tests and verify RED**

Expected: missing binding state/helper and missing Harness project-completion enforcement.

- [x] **Step 3: Implement lifecycle/hydration**

Fresh projects store `harnessPackBinding: null`. Hydration distinguishes an absent legacy property from explicit `null`; absent becomes `legacyUnboundHarnessPackBinding("Legacy project predates live pack binding.")`. Existing valid bindings are validated, not re-resolved. `hydrateTaskRun()` validates a present `harnessCompletion` record, preserves explicit `null`, and defaults an absent legacy task record to `null`; malformed structured records fail closed instead of being trusted.
- [x] **Step 4: Enforce the desktop project gate**

After `completeAgentTask()` refreshes dependencies, keep the existing task-level blocked behavior first. When `allDone` is true, evaluate the stored binding against persisted Harness task records. Only a ready pack gate may transition the project to `review`; otherwise set project status `blocked`, `runtimeFailureSource: "harness"`, and a reason that names the missing pack evidence.

- [x] **Step 5: Verify GREEN**

Run: `storeHarnessPack.policy-test.js`, `storeCompletion.policy-test.js`, and `sessionReconciliation.policy-test.js` after policy compilation.

Expected: PASS, including the existing ready→running regression test.

- [x] **Step 6: Commit**

```bash
git add bloom-runtime/ts/types.ts bloom-runtime/ts/store.ts bloom-runtime/ts/storeHarnessPack.policy-test.ts bloom-runtime/ts/storeCompletion.policy-test.ts bloom-runtime/tsconfig.policy-tests.json
git commit -m "feat : enforce bloom pack state gates"
```

---

### Task 5: Shared PM Repair Policy and Desktop Plan-Before-Bootstrap Flow

**Files:**
- Create: `bloom-runtime/ts/pmPlanningPolicy.ts`
- Create: `bloom-runtime/ts/pmPlanningPolicy.policy-test.ts`
- Modify: `bloom-runtime/ts/runtime.ts`
- Modify: `bloom-runtime/ts/intakePlanning.ts`
- Modify: `bloom-runtime/ts/pmPlanningRepair.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`
- Modify: `bloom-runtime/tsconfig.worker.json`
**Interfaces:**
- Produces: `MAX_PM_PLAN_ATTEMPTS = 2`.
- Produces: `isSemanticPmPlanError(error): boolean`.
- Produces: `buildPmPlanningRequest(request, binding, validationError?): string`.
- Produces: `runPmPlanningWithRepair<T>({ request, binding, planOnce, prepareAndValidate }): Promise<T>`.
- Extends: `StartProjectRuntimeInput` with optional `harnessPackId?: string`.

- [x] **Step 1: Write failing shared repair-policy tests**

```ts
const binding = resolveHarnessPackBinding({ intent: "로그인 버그 고쳐" });
const capturedRequests: string[] = [];
const pm = (tasks: ProjectTaskPlan[]): PmCodexRunResult => ({
  plan: { projectName: "Bug", repositoryName: "bug", productSummary: "bug", architectureSummary: "bug", needsAuth: false, technologyDecisions: [], tasks },
  sessionId: "pm", eventsPath: "/tmp/pm.jsonl", outputPath: "/tmp/pm.json",
});
const task = (id: string, role: ProjectTaskPlan["role"], dependsOn: string[]): ProjectTaskPlan => ({ id, title: id, role, taskSlug: id.toLowerCase(), summary: id, dependsOn, acceptanceCriteria: ["done"] });
const invalid = pm([task("DBG", "debug-router", []), task("CR", "code-review", ["DBG"]), task("REV", "reviewer", ["CR"]), task("QA", "qa", ["REV"])]);
const valid = pm([task("DBG", "debug-router", []), task("FE", "frontend", ["DBG"]), task("CR", "code-review", ["DBG", "FE"]), task("REV", "reviewer", ["CR"]), task("QA", "qa", ["REV"])]);

let calls = 0;
const result = await runPmPlanningWithRepair({
  request: "로그인 버그 고쳐", binding,
  async planOnce(request) {
    calls += 1; capturedRequests.push(request); return calls === 1 ? invalid : valid;
  },
  prepareAndValidate(value) {
    assertHarnessPackPlan(binding, value.plan);
    const plan = prepareOrchestrationPlan(value.plan);
    assertHarnessPackPlan(binding, plan);
    return { ...value, plan };
  },
});
assert.equal(result.plan.repositoryName, "bug");
assert.equal(calls, 2);
assert.match(capturedRequests[0], /bug-fix/);
assert.match(capturedRequests[1], /previous PM plan failed/i);
```

Also assert a non-semantic runtime error is not retried and an unbound request receives no pack context.
- [x] **Step 2: Run the shared repair test and verify RED**

Expected: `pmPlanningPolicy.ts` is missing.

- [x] **Step 3: Implement the shared bounded retry loop**

`buildPmPlanningRequest()` appends the pack context as internal Harness policy, keeps the existing uniqueness invariant, and adds the prior semantic validation message only on retry. `isSemanticPmPlanError()` keeps the current worker markers and adds `Bloom Harness pack plan rejected:`. `runPmPlanningWithRepair()` performs exactly two attempts and retries only classified semantic errors.

- [x] **Step 4: Switch desktop runtime to plan-only then bootstrap**

`startProjectRuntime()` must:

1. load the canonical `ProjectState.request` and call `bindProjectHarnessPack()` before invoking PM;
2. reject a durable blocked binding immediately;
3. preserve senior-PM, intake, and evolution context without using those augmented strings for pack inference;
4. call Tauri `plan_project_runtime` through `runPmPlanningWithRepair()`;
5. call `assertHarnessPackPlan()` on the raw PM plan, run `prepareOrchestrationPlan()`, then call `assertHarnessPackPlan()` again inside the retry boundary;
6. call `bootstrap_project_repository` only after both pack validations accept the plan;
7. return the same `{ pm, repository }` public result shape as today.

`startProjectRuntimeWithIntake()` keeps appending intake context to the PM request; pack resolution still uses the stored pristine project request.

- [x] **Step 5: Add source-policy assertions for side-effect order**

Update `pmPlanningRepair.policy-test.ts` so it proves desktop no longer invokes `start_project_runtime`, invokes `plan_project_runtime`, validates the raw Pack before `prepareOrchestrationPlan()`, validates the prepared Pack afterward, and reaches `bootstrap_project_repository` only after both validations. Both desktop/worker paths must use `runPmPlanningWithRepair()`.
- [x] **Step 6: Verify GREEN**

Run `pmPlanningPolicy.policy-test.js`, `pmPlanningRepair.policy-test.js`, `pnpm --dir apps/desktop build`, and `pnpm run build:bloom-worker`.

Expected: PASS; repository bootstrap is unreachable until plan/pack validation succeeds.

- [x] **Step 7: Commit**

```bash
git add bloom-runtime/ts/pmPlanningPolicy.ts bloom-runtime/ts/pmPlanningPolicy.policy-test.ts bloom-runtime/ts/runtime.ts bloom-runtime/ts/intakePlanning.ts bloom-runtime/ts/pmPlanningRepair.policy-test.ts bloom-runtime/tsconfig.policy-tests.json bloom-runtime/tsconfig.worker.json
git commit -m "feat : repair bloom pack planning"
```

---

### Task 6: Headless Binding, Recovery, and Pre-Merge Pack Enforcement

**Files:**
- Modify: `bloom-runtime/ts/builderWorkerAdapter.ts`
- Modify: `bloom-runtime/ts/headlessBuilderExecutor.ts`
- Modify: `bloom-runtime/ts/headlessBuilderExecutor.policy-test.ts`
- Modify: `bloom-runtime/ts/headlessCrashRecovery.policy-test.ts`
- Modify: `bloom-worker/run.js`
- Modify: `bloom-runtime/ts/pmPlanningRepair.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.worker.json`
**Interfaces and persistence:**
- Adds optional `BuilderWorkerClaim.harnessPackId?: string | null`.
- Bumps `HEADLESS_BUILDER_SNAPSHOT_SCHEMA_VERSION` from `1` to `2`.
- Adds required `HeadlessBuilderSnapshotPayload.harnessPackBinding: HarnessPackBinding` in schema v2.
- Schema-v1 snapshots migrate in memory to schema v2 with `legacyUnboundHarnessPackBinding(...)`; they do not run intent inference.
- Schema-v2 snapshots must contain a valid binding or fail closed.
- Extends `HeadlessBuilderRuntime.planProject()` input with `harnessPackBinding`.

- [x] **Step 1: Write failing headless binding/recovery tests**

Add cases that prove:

```ts
const bugClaim = { ...CLAIM, brief: "Fix login crash", harnessPackId: null };
// fresh executor persists save:binding with bound bug-fix before intake or PM is called

const legacySnapshot = schemaV1RunningSnapshot();
// recovery first persists schema-2 unbound legacy, resolver is not called, then existing task reconciliation runs

const unknown = { ...CLAIM, harnessPackId: "unknown" };
// blocked snapshot is persisted before intake/PM/bootstrap/dispatch
```

Use a dedicated valid bug-fix fixture with `debug-router -> frontend -> code-review -> reviewer -> qa`; do not reuse the generic BASE_PLAN for a bound bug-fix test. Assert event ordering: `save:binding` precedes `intake`, and legacy migration save precedes `reconcile:*`.

- [x] **Step 2: Write failing pre-merge project-gate test**

Create an all-done bound snapshot whose persisted trusted task evidence is missing `test`; assert the executor persists `blocked` and `mergePullRequests()` is never called.
- [x] **Step 3: Run headless tests and verify RED**

Run policy compilation, `headlessBuilderExecutor.policy-test.js`, and `headlessCrashRecovery.policy-test.js`.

Expected: missing binding/schema/gate behavior.

- [x] **Step 4: Implement snapshot binding and migration**

`freshPayload()` resolves once from the claim request plus optional explicit pack id. Before intake, the executor immediately persists a `binding` (or `blocked`) snapshot so a crash cannot trigger re-resolution. `parseSnapshot()` accepts schema 1 only as a one-way legacy-unbound migration; the executor persists the upgraded schema-2 snapshot before reconciliation or any other recovery side effect. Every schema-2 binding is validated with `validateHarnessPackBinding()`.

A fresh `blocked` binding calls `failBlocked()` before intake. A recovered payload never calls `resolveHarnessPackBinding()`.

- [x] **Step 5: Wire shared PM repair inside the worker bridge**

In `bloom-worker/run.js`, import `runPmPlanningWithRepair` and `assertHarnessPackPlan` from compiled worker modules. Remove the duplicated retry constants/helper implementations. Each bridge attempt asserts the immutable pack against the raw PM plan, applies existing orchestration/E2E preparation, then asserts the prepared plan again inside the same retry boundary.

- [x] **Step 6: Enforce project pack gate before merge**

After the task loop reports `allDone`, call `evaluateHarnessPackProjectCompletion()` before `evaluateProjectMergeGate()`. A non-ready pack gate calls `failBlocked("Bloom Harness pack completion rejected: ...")`; no integration/merge/release side effect may occur.

- [x] **Step 7: Verify GREEN**

Run headless executor, crash recovery, PM planning repair, scheduler observability, worker build, and `node --check bloom-worker/run.js`.

Expected: PASS for fresh bound/unbound, legacy recovery, blocked explicit pack, valid bug-fix, and missing-pack-evidence cases.
- [x] **Step 8: Commit**

```bash
git add bloom-runtime/ts/builderWorkerAdapter.ts bloom-runtime/ts/headlessBuilderExecutor.ts bloom-runtime/ts/headlessBuilderExecutor.policy-test.ts bloom-runtime/ts/headlessCrashRecovery.policy-test.ts bloom-worker/run.js bloom-runtime/ts/pmPlanningRepair.policy-test.ts bloom-runtime/tsconfig.worker.json
git commit -m "feat : enforce bloom packs headlessly"
```

`observedHeadlessBuilderExecutor.ts` consumes the exported snapshot type structurally and must remain behaviorally unchanged in this phase.

---

### Task 7: Full Verification, Review, and Integration Record

**Files:**
- Modify: `docs/superpowers/plans/2026-09-04-bloom-live-pack-binding.md` execution record only.

- [x] **Step 1: Run focused security/behavior regression set**

Run the new binding, plan policy, task evidence, project gate, store, PM repair, headless executor, and crash-recovery policy tests. Also rerun `runtimeCompletionAdapter.policy-test.js`, `runtimeTaskCompletion.policy-test.js`, `orchestrationCore.policy-test.js`, and `sessionReconciliation.policy-test.js`.

- [x] **Step 2: Run Windows policy regression**

Run all Bloom policy tests except the two known platform-sensitive Luna tests (`lunaServerRuntime`, `lunaStaticRelease`) if they still reproduce the existing Windows-only baseline. Record the exact new PASS count.

- [x] **Step 3: Run native Linux full policy suite**

Use Node `v22.23.2` and run every compiled Bloom policy test, including the two Luna tests. Record the exact PASS count; no exclusions are allowed on Linux.
- [x] **Step 4: Run build/runtime verification**

Run:

```bash
pnpm --dir apps/desktop build
pnpm run build:bloom-worker
cargo check --manifest-path bloom-runtime/Cargo.toml
git diff --check
```

Expected: all commands PASS; existing Rust unused-code warnings may remain if unchanged in scope.

- [x] **Step 5: Review the branch against Harness trust boundaries**

Confirm all of the following from the final diff:

- no Agent free-form `evidence: string[]` is read by the pack project gate;
- no recovery path calls pack resolution after a binding exists;
- no bound project reaches desktop `review` or headless merge without project pack evidence;
- no governance-only plan can satisfy the bug-fix `fix` stage;
- blocked explicit pack selection is persisted before PM/repository side effects;
- schema-v1 Builder recovery migrates to unbound rather than inferring a current pack;
- plan validation occurs inside both PM repair boundaries.

- [x] **Step 6: Record exact verification evidence and commit**

Append RED/GREEN commands, Windows/Linux policy counts, build results, review findings, base SHA, and implementation commit list to this plan, then:

```bash
git add docs/superpowers/plans/2026-09-04-bloom-live-pack-binding.md
git commit -m "docs : record bloom live pack verification"
```
- [ ] **Step 7: Push and open PR only after fresh verification**

Push the implementation branch, open a PR to `main`, inspect changed files for completion/pack bypasses, wait for the full GitHub Harness workflow, and merge only when the PR head SHA is unchanged and all checks are green.

Suggested PR title: `feat : bind live bloom harness packs`

The PR body must include the pack binding lifecycle, PM repair behavior, legacy migration rule, trusted evidence gate, exact local/Linux verification counts, and any review-discovered fixes.

## Execution Record — 2026-09-04

- Base verified against: `origin/main` at `c08721a5bb83`.
- Focused Harness/runtime regression: **15/15 PASS**.
- Windows compiled Bloom policy regression: **72 PASS / 0 FAIL**, excluding the unchanged Windows-only baselines `lunaServerRuntime.policy-test.js` and `lunaStaticRelease.policy-test.js`.
- Native Linux policy regression: **74/74 PASS** on Node `v22.23.2`, with no exclusions.
- `pnpm --dir apps/desktop build`: PASS.
- `pnpm run build:bloom-worker`: PASS.
- `cargo check --manifest-path bloom-runtime/Cargo.toml`: PASS; existing unused-code warnings remain outside this scope.
- `git diff --check origin/main...HEAD`: PASS.

### TDD / review findings

- Fresh bindings are persisted before intake; unknown explicit packs block before PM/repository/Agent side effects.
- Pack inference uses canonical project request / Builder `claim.brief` only; title/platform/features do not participate in intent inference.
- Schema-v1 Builder recovery migrates to durable legacy-unbound schema v2 before reconciliation and never re-runs pack inference.
- Outer/payload Builder snapshot schema mismatches fail closed.
- Persisted schema-v2 `blocked` pack bindings remain terminal across recovery and cannot resume intake/PM/reconcile/merge side effects.
- Raw PM plans and prepared orchestration plans are both checked inside the semantic repair boundary.
- Governance-only roles cannot satisfy the bug-fix implementation-writer stage.
- Project pack completion reads only persisted `harnessCompletion` evidence; free-form Agent `evidence: string[]` is not promoted into trusted pack evidence.
- Desktop cannot enter `review`, and headless cannot reach merge, until the project pack evidence gate passes.

### Implementation commits

- `4bbb746` feat : bind bloom harness packs
- `76ee467` feat : validate bloom pack plans
- `b286400` feat : persist bloom harness task evidence
- `72a05f5` feat : enforce bloom pack state gates
- `3b547fc` feat : repair bloom pack planning
- `59c56bc` feat : enforce bloom packs headlessly
- `f281fb2` fix : preserve blocked bloom pack recovery
