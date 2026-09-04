# Bloom Run Artifact Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Persist each Bloom Harness run as a reproducible, fail-closed local artifact bundle without changing existing orchestration side effects.

**Architecture:** Add a focused TypeScript filesystem adapter under `bloom-runtime/ts`. It validates run IDs, maps typed artifact names to `.bloom/runs/<run-id>/`, writes snapshots once, appends events, appends evidence without allowing evidence-ID replacement, and reconstructs a run bundle for recovery/evaluation consumers.

**Tech Stack:** TypeScript, Node.js `fs`/`path`, existing Bloom policy-test runner.

**Spec:** `docs/superpowers/specs/2026-09-04-bloom-harness-v1-design.md`

## Global Constraints

- Existing Bloom PM/worker/bridge/Git runtime is not replaced in this phase.
- Completed snapshots are immutable; attempts to replace them fail closed.
- Events preserve append order in `events.jsonl`.
- Evidence IDs are immutable and duplicate IDs are rejected.
- Run IDs must never escape `.bloom/runs` through path traversal.
- Luna remains independently buildable and does not import Bloom runtime code.

---
### Task 1: Safe Run Paths and Immutable Snapshots

**Files:**
- Create: `bloom-runtime/ts/harnessRunArtifacts.ts`
- Create: `bloom-runtime/ts/harnessRunArtifacts.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`

**Interfaces:**
- Produces: `createHarnessRunArtifactStore(repoRoot, runId)`.
- Produces: `writeSnapshot(name, value)` for `request`, `manifest`, `pack`, `plan`, `dag`, `review`, `qa`, and `result`.
- Produces: `writeRetrospective(markdown)`.

- [x] **Step 1: Write failing tests**

```ts
const store = createHarnessRunArtifactStore(root, "run-001");
store.writeSnapshot("request", { objective: "Fix login" });
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, ".bloom/runs/run-001/request.json"), "utf8")), { objective: "Fix login" });
assert.throws(() => store.writeSnapshot("request", { objective: "replace" }), /already exists/);
assert.throws(() => createHarnessRunArtifactStore(root, "../escape"), /run id/);
```

- [x] **Step 2: Compile/run and confirm RED**

Run the policy-test TypeScript compiler and `harnessRunArtifacts.policy-test.js`.
Expected: FAIL because `harnessRunArtifacts.ts` does not exist.
- [x] **Step 3: Implement minimal safe snapshot writer**

```ts
const SNAPSHOT_FILES = {
  request: "request.json",
  manifest: "manifest.snapshot.json",
  pack: "pack.snapshot.json",
  plan: "plan.json",
  dag: "dag.json",
  review: "review.json",
  qa: "qa.json",
  result: "result.json",
} as const;
```

Validate `runId` against a conservative allow-list, create `.bloom/runs/<run-id>`, and use exclusive file creation (`flag: "wx"`) for snapshot/retrospective writes. JSON output must end with one newline.

- [x] **Step 4: Run focused test and full Bloom policy tests**

Expected: focused test PASS. Full Linux policy suite remains green.

- [x] **Step 5: Commit**

```bash
git add bloom-runtime/ts/harnessRunArtifacts.ts bloom-runtime/ts/harnessRunArtifacts.policy-test.ts bloom-runtime/tsconfig.policy-tests.json
git commit -m "feat : persist bloom run snapshots"
```

### Task 2: Append-Only Events and Evidence

**Files:**
- Modify: `bloom-runtime/ts/harnessRunArtifacts.ts`
- Modify: `bloom-runtime/ts/harnessRunArtifacts.policy-test.ts`

**Interfaces:**
- Produces: `appendEvent(event)` writing one JSON object per line to `events.jsonl`.
- Produces: `appendEvidence(evidence: HarnessEvidence)` maintaining `evidence.json` as an ordered array.
- [x] **Step 1: Add failing append-only tests**

```ts
store.appendEvent({ type: "run.started", at: "2026-09-04T00:00:00Z" });
store.appendEvent({ type: "plan.created", at: "2026-09-04T00:00:01Z" });
assert.equal(fs.readFileSync(eventsPath, "utf8").trim().split("\n").length, 2);

store.appendEvidence({ version: 1, id: "test-1", kind: "test", summary: "passed" });
assert.throws(
  () => store.appendEvidence({ version: 1, id: "test-1", kind: "test", summary: "replace" }),
  /evidence id already exists/,
);
```

- [x] **Step 2: Run focused test and confirm RED**

Expected: FAIL because append APIs do not exist yet.

- [x] **Step 3: Implement append behavior**

`appendEvent` appends a single-line JSON record with `fs.appendFileSync`. `appendEvidence` validates through `validateHarnessEvidence`, reads the current array if present, rejects duplicate IDs, writes the expanded array to a temporary sibling file, then atomically renames it to `evidence.json`.

- [x] **Step 4: Verify focused and regression tests**

Expected: append order preserved, duplicate evidence rejected, existing Harness tests remain green.

- [x] **Step 5: Commit**

```bash
git add bloom-runtime/ts/harnessRunArtifacts.ts bloom-runtime/ts/harnessRunArtifacts.policy-test.ts
git commit -m "feat : append bloom run evidence"
```
### Task 3: Reconstruct Stored Runs

**Files:**
- Modify: `bloom-runtime/ts/harnessRunArtifacts.ts`
- Modify: `bloom-runtime/ts/harnessRunArtifacts.policy-test.ts`

**Interfaces:**
- Produces: `readRun()` returning the run ID, present immutable snapshots, ordered events, ordered evidence, and optional retrospective markdown.

- [x] **Step 1: Add failing reconstruction test**

```ts
const restored = store.readRun();
assert.equal(restored.runId, "run-001");
assert.deepEqual(restored.snapshots.request, { objective: "Fix login" });
assert.equal(restored.events[0].type, "run.started");
assert.equal(restored.evidence[0].id, "test-1");
```

- [x] **Step 2: Run focused test and confirm RED**

Expected: FAIL because `readRun` does not exist.

- [x] **Step 3: Implement reconstruction**

Missing optional files return `undefined`/empty arrays instead of fabricated values. Malformed stored JSON throws a path-specific error so recovery/evaluator callers never silently continue from corrupt artifacts.

- [x] **Step 4: Run full regression gate**

Run `pnpm run test:bloom-runtime`, `pnpm run build:bloom-worker`, and `git diff --check`. On Windows, separately account for the already-known path/symlink-only baseline failures and confirm the full suite with native Linux Node.

- [x] **Step 5: Commit and push**

```bash
git add bloom-runtime/ts/harnessRunArtifacts.ts bloom-runtime/ts/harnessRunArtifacts.policy-test.ts docs/superpowers/plans/2026-09-04-bloom-run-artifact-store.md
git commit -m "feat : reconstruct bloom run artifacts"
git push -u origin feat/bloom-run-artifact-store
```

## Execution Notes

- Implemented on isolated branch `feat/bloom-run-artifact-store`.
- Task 1 observed RED on missing `harnessRunArtifacts`, then GREEN for safe run IDs and write-once snapshots.
- Task 2 observed RED on missing append APIs, then GREEN for ordered events and duplicate-safe evidence.
- Task 3 observed RED on missing `readRun`, then GREEN for reconstruction and corrupt-file failure.
- Windows host: 61 policy tests passed after excluding the two known path/symlink-only baseline cases.
- Native Linux Node 22.23.2: full Bloom policy suite passed 63/63.
- `pnpm run build:bloom-worker` and `git diff --check` passed.
