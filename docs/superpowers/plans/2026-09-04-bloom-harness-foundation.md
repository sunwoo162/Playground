# Bloom Harness Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first executable Bloom Harness layer: versioned contracts, project manifest loading, a deterministic `bug-fix` task pack, and validated agent/evidence envelopes.

**Architecture:** Keep the current Bloom PM/worker/runtime paths intact. Add focused TypeScript modules under `bloom-runtime/ts` that define and validate harness contracts, then expose conservative repository policy from `.bloom/project.yaml` and a small built-in pack registry. The first phase does not yet migrate orchestration or persist run artifacts.

**Tech Stack:** TypeScript 5.7, Node.js CommonJS policy-test build, `node:test`-style assertion scripts already used by Bloom policy tests, `yaml` for `.bloom/project.yaml` parsing.

**Spec:** `docs/superpowers/specs/2026-09-04-bloom-harness-v1-design.md`

## Global Constraints

- Luna remains a separate desktop-pet product; no Bloom runtime dependency may be added to `apps/desktop`.
- Existing Bloom PM, worker, bridge, Git, review, QA, and recovery paths are not replaced in this phase.
- Invalid manifests and contract version mismatches fail closed before repository mutation.
- Missing manifest permissions never grant write, GitHub, or deployment capability.
- New runtime behavior is implemented test-first and added to `bloom-runtime/tsconfig.policy-tests.json`.
- Existing Bloom policy tests remain required before this phase is considered complete.

---
### Task 1: Versioned Harness Contracts

**Files:**
- Create: `bloom-runtime/ts/harnessContracts.ts`
- Create: `bloom-runtime/ts/harnessContracts.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`

**Interfaces:**
- Produces: `HARNESS_CONTRACT_VERSION`, `HarnessProjectManifest`, `HarnessAgentEnvelope`, `HarnessAgentResult`, `HarnessEvidence`, `assertHarnessContractVersion(version)`.
- Consumes: existing `AgentRole` and `AgentPermission` types from `bloom-runtime/ts/types.ts`.

- [x] **Step 1: Write the failing contract test**

```ts
import assert from "node:assert/strict";
import { HARNESS_CONTRACT_VERSION, assertHarnessContractVersion } from "./harnessContracts";

assert.equal(HARNESS_CONTRACT_VERSION, 1);
assert.doesNotThrow(() => assertHarnessContractVersion(1));
assert.throws(() => assertHarnessContractVersion(2), /Unsupported Bloom Harness contract version: 2/);
```

- [x] **Step 2: Add the new test/module paths to `tsconfig.policy-tests.json` and run the focused compile/test**

Run: `pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json && node .tmp/bloom-policy-tests/harnessContracts.policy-test.js`
Expected: FAIL because `./harnessContracts` does not exist.
- [x] **Step 3: Implement the minimal contract module**

```ts
import type { AgentPermission, AgentRole } from "./types";

export const HARNESS_CONTRACT_VERSION = 1 as const;
export type HarnessPermissionMode = "deny" | "read" | "write";
export type HarnessProjectManifest = {
  version: 1;
  project: { type: string };
  commands: Partial<Record<"install" | "lint" | "typecheck" | "test" | "build", string>>;
  git: { baseBranch: string; branchPrefix: string };
  quality: { requireReview: boolean; requireTests: boolean; requireBuild: boolean };
  permissions: { filesystem: HarnessPermissionMode; git: HarnessPermissionMode; github: HarnessPermissionMode; deploy: "deny" | "write" };
};
export type HarnessAgentEnvelope = { version: 1; objective: string; role: AgentRole; permissions: AgentPermission[]; acceptanceCriteria: string[]; requiredEvidence: string[] };
export type HarnessAgentResult = { version: 1; status: "done" | "blocked" | "failed"; summary: string; changedFiles: string[]; commandsExecuted: string[]; evidenceIds: string[]; risks: string[]; unresolvedIssues: string[]; nextActions: string[] };
export type HarnessEvidence = { version: 1; id: string; kind: "command" | "test" | "build" | "file-change" | "review" | "github" | "deployment"; summary: string };
export function assertHarnessContractVersion(version: number): asserts version is 1 { if (version !== HARNESS_CONTRACT_VERSION) throw new Error(`Unsupported Bloom Harness contract version: ${version}`); }
```

- [x] **Step 4: Run the focused test, then full Bloom policy tests**

Run: `pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json && node .tmp/bloom-policy-tests/harnessContracts.policy-test.js`
Expected: PASS.

Run: `pnpm run test:bloom-runtime`
Expected: all Bloom policy tests pass.

- [x] **Step 5: Commit**

`git add bloom-runtime/ts/harnessContracts.ts bloom-runtime/ts/harnessContracts.policy-test.ts bloom-runtime/tsconfig.policy-tests.json && git commit -m "feat : add bloom harness contracts"`
### Task 2: Project Manifest Loader

**Files:**
- Create: `bloom-runtime/ts/harnessProjectManifest.ts`
- Create: `bloom-runtime/ts/harnessProjectManifest.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `HarnessProjectManifest`, `assertHarnessContractVersion`.
- Produces: `loadHarnessProjectManifest(repoRoot: string): HarnessProjectManifestResolution` where resolution includes `source: "explicit" | "inferred"`, `path`, and `manifest`.

- [x] **Step 1: Write failing tests for explicit and missing manifests**

```ts
const explicit = loadHarnessProjectManifest(fixtureWithYaml);
assert.equal(explicit.source, "explicit");
assert.equal(explicit.manifest.git.baseBranch, "develop");
assert.equal(explicit.manifest.permissions.deploy, "deny");

const inferred = loadHarnessProjectManifest(emptyFixture);
assert.equal(inferred.source, "inferred");
assert.equal(inferred.manifest.permissions.filesystem, "deny");
assert.equal(inferred.manifest.permissions.git, "deny");
assert.equal(inferred.manifest.permissions.github, "deny");
assert.equal(inferred.manifest.permissions.deploy, "deny");
```

- [x] **Step 2: Add `yaml` as a direct dependency and run the focused test**

Run: `pnpm add yaml`
Then compile/run the new policy test.
Expected: FAIL because `loadHarnessProjectManifest` is not implemented.
- [x] **Step 3: Implement conservative manifest parsing and validation**

Implementation requirements:

```ts
export type HarnessProjectManifestResolution = {
  source: "explicit" | "inferred";
  path: string;
  manifest: HarnessProjectManifest;
};

export function loadHarnessProjectManifest(repoRoot: string): HarnessProjectManifestResolution;
```

When `.bloom/project.yaml` is absent, return a version-1 inferred manifest with empty commands, `main` as the base branch, `agent/` as the branch prefix, all quality gates enabled, and every permission set to `deny`. When YAML exists, reject non-object roots, unsupported versions, empty project type, empty Git branch values, invalid permission values, and non-string command values.

- [x] **Step 4: Run focused and regression tests**

Run the compiled `harnessProjectManifest.policy-test.js`, then `pnpm run test:bloom-runtime`.
Expected: PASS with no pre-existing policy regression.

- [x] **Step 5: Commit**

`git add package.json pnpm-lock.yaml bloom-runtime/ts/harnessProjectManifest.ts bloom-runtime/ts/harnessProjectManifest.policy-test.ts bloom-runtime/tsconfig.policy-tests.json && git commit -m "feat : load bloom project manifests"`

### Task 3: Deterministic Bug-Fix Pack Registry

**Files:**
- Create: `bloom-runtime/ts/harnessPackRegistry.ts`
- Create: `bloom-runtime/ts/harnessPackRegistry.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`

**Interfaces:**
- Produces: `HarnessPack`, `BUG_FIX_PACK`, `resolveHarnessPack(input)`.
- `resolveHarnessPack` returns `{ pack, reason }`; explicit pack selection wins over intent inference.
- [x] **Step 1: Write the failing pack-selection test**

```ts
assert.equal(resolveHarnessPack({ explicitPack: "bug-fix", intent: "anything" }).pack.id, "bug-fix");
assert.match(resolveHarnessPack({ intent: "fix login crash" }).reason, /intent/i);
assert.equal(resolveHarnessPack({ intent: "fix login crash" }).pack.id, "bug-fix");
assert.throws(() => resolveHarnessPack({ explicitPack: "unknown", intent: "fix bug" }), /Unknown Bloom Harness pack/);
```

- [x] **Step 2: Compile/run and confirm RED**

Expected: FAIL because the registry module does not exist.

- [x] **Step 3: Implement the minimal reference pack**

```ts
export const BUG_FIX_PACK = {
  version: 1,
  id: "bug-fix",
  requiredRoles: ["debug-router", "code-review", "reviewer", "qa"],
  stages: ["reproduce", "root-cause", "regression-test", "fix", "review", "qa"],
  requiredEvidence: ["test", "file-change", "review"],
} as const;
```

Automatic selection recognizes `bug`, `fix`, `error`, `crash`, `failure`, and `regression` case-insensitively. Non-matching intent throws an explicit no-pack error rather than guessing.

- [x] **Step 4: Run focused and full Bloom tests**

Expected: focused test PASS and `pnpm run test:bloom-runtime` PASS.

- [x] **Step 5: Commit**

`git add bloom-runtime/ts/harnessPackRegistry.ts bloom-runtime/ts/harnessPackRegistry.policy-test.ts bloom-runtime/tsconfig.policy-tests.json && git commit -m "feat : add bloom bug fix pack"`
### Task 4: Agent and Evidence Validation

**Files:**
- Create: `bloom-runtime/ts/harnessValidation.ts`
- Create: `bloom-runtime/ts/harnessValidation.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`

**Interfaces:**
- Consumes: `HarnessAgentEnvelope`, `HarnessAgentResult`, `HarnessEvidence`, `assertHarnessContractVersion`.
- Produces: `validateHarnessAgentEnvelope(input)`, `validateHarnessAgentResult(input)`, `validateHarnessEvidence(input)`; each returns the validated value or throws a descriptive error.

- [x] **Step 1: Write failing validation tests**

```ts
assert.throws(() => validateHarnessAgentEnvelope({ version: 2 }), /contract version/);
assert.throws(() => validateHarnessAgentResult({ version: 1, status: "done", evidenceIds: [] }), /summary/);
assert.throws(() => validateHarnessEvidence({ version: 1, id: "", kind: "test", summary: "ok" }), /evidence id/);
```

Also include one valid object for each validator and assert that the returned value preserves its key fields.

- [x] **Step 2: Compile/run and confirm RED**

Expected: FAIL because `harnessValidation.ts` does not exist.

- [x] **Step 3: Implement minimal structural validation**

Validate version first, then required string/array fields and allowed status/evidence-kind values. Do not add repository side effects or orchestration integration here.

- [x] **Step 4: Run focused and full Bloom tests**

Expected: focused test PASS and `pnpm run test:bloom-runtime` PASS.

- [x] **Step 5: Commit**

`git add bloom-runtime/ts/harnessValidation.ts bloom-runtime/ts/harnessValidation.policy-test.ts bloom-runtime/tsconfig.policy-tests.json && git commit -m "feat : validate bloom harness evidence"`
### Task 5: Foundation Regression Gate

**Files:**
- Modify only if verification exposes a defect in Tasks 1-4.

**Interfaces:**
- Consumes all new Harness Foundation modules.
- Produces no new runtime API; this task proves the phase is safe to build on.

- [x] **Step 1: Run TypeScript contract build**

Run: `pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json`
Expected: exit 0.

- [x] **Step 2: Run all Bloom runtime policy tests**

Run: `pnpm run test:bloom-runtime`
Expected: exit 0 and the runner reports every compiled policy test passed.

- [x] **Step 3: Run worker compile to catch shared-type regressions**

Run: `pnpm run build:bloom-worker`
Expected: exit 0.

- [x] **Step 4: Check repository diff hygiene**

Run: `git diff --check && git status --short`
Expected: no whitespace errors; only intentionally uncommitted plan/progress files, if any.

- [x] **Step 5: Record phase outcome**

Update this plan's checkboxes only for steps actually executed, then commit the plan progress separately from runtime code if it changed.

## Deferred to Follow-up Plans

- Orchestration migration to consume packs.
- Durable run artifact/event/evidence persistence.
- Benchmark fixture runner and evaluator CLI.
- Additional `feature-development`, `code-review`, `documentation`, and `deployment` packs.
- Luna client rendering of Bloom request/status/evidence contracts.


## Execution Notes

- Implemented on branch `feat/bloom-harness-foundation` in an isolated worktree.
- Focused RED→GREEN tests were observed for contracts, project manifest loading, bug-fix pack selection, and agent/evidence validation.
- Native Linux Node 22.23.2 under WSL compiled the policy-test TypeScript and ran `bloom-runtime/run-policy-tests.cjs`: 61/61 policy tests passed.
- `pnpm run build:bloom-worker` passed on the Windows host.
- The Windows host's full policy runner still hits two pre-existing platform-specific baseline failures: Linux path joining in `lunaServerRuntime.policy-test` and symlink permission `EPERM` in `lunaStaticRelease.policy-test`.
- The same two scenarios pass under native Linux Node, matching the repository's `ubuntu-latest` Harness CI environment.
