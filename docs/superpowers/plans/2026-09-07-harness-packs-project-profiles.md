# Harness Packs and Project Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Harness task classification beyond bug fixes and add narrow project profiles that describe framework/runtime shape without changing core lifecycle or permissions.

**Architecture:** Packs describe task workflow/evidence/quality responsibilities. Profiles describe project shape and command/deployment capabilities. Implementation roles remain selected by the project plan rather than hard-coded into generic packs.

**Tech Stack:** TypeScript 5.7, YAML manifest loader, existing Bloom policy-test runner.

**Spec:** `docs/superpowers/specs/2026-09-07-iseol-harness-engineering-v1-design.md`

## Global Constraints

- Keep `bug-fix` behavior backward compatible.
- Pack inference must be deterministic and explicit pack selection always wins.
- Profiles never grant permissions; manifest permissions remain authoritative and deny-by-default.
- Unknown/ambiguous project shape resolves to `unknown`, not a guessed writable profile.
- No framework-specific execution logic is added to the Harness core in this phase.

### Task 1: Expand Built-in Harness Packs

**Files:**
- Modify: `bloom-runtime/ts/harnessPackRegistry.ts`
- Modify: `bloom-runtime/ts/harnessPackRegistry.policy-test.ts`

**Interfaces:**
- Adds `FEATURE_DEVELOPMENT_PACK`, `CODE_REVIEW_PACK`, `DOCUMENTATION_PACK`, `DEPLOYMENT_PACK`.
- `findHarnessPackById`, `inferHarnessPack`, and `resolveHarnessPack` continue as the public resolution API.

- [ ] **Step 1:** Add failing tests for explicit lookup and intent inference for all four new packs while preserving all current bug-fix cases.
- [ ] **Step 2:** Compile/run `harnessPackRegistry.policy-test.js`; expect RED because new packs are missing.
- [ ] **Step 3:** Implement deterministic pack definitions and non-overlapping inference precedence: bug-fix → deployment → code-review → documentation → feature-development.
- [ ] **Step 4:** Re-run focused pack tests; expect PASS.
- [ ] **Step 5:** Commit `feat : expand harness task packs`.

### Task 2: Add Project Profile Registry

**Files:**
- Create: `bloom-runtime/ts/harnessProjectProfiles.ts`
- Create: `bloom-runtime/ts/harnessProjectProfiles.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`

**Interfaces:**
- Produces profiles: `web-frontend`, `backend-service`, `fullstack-web`, `react-native`, `desktop-native`, `unknown`.
- Produces `resolveHarnessProjectProfile(projectType: string)` with exact alias normalization only.

- [ ] **Step 1:** Add failing profile tests for supported aliases, unknown fallback, required command capabilities, and deployment/preview flags.
- [ ] **Step 2:** Compile/run focused profile test; expect RED because the registry does not exist.
- [ ] **Step 3:** Implement immutable profile metadata only; no command execution and no permission elevation.
- [ ] **Step 4:** Re-run focused profile test; expect PASS.
- [ ] **Step 5:** Commit `feat : add harness project profiles`.

### Task 3: Bind Manifest Resolution to Profiles

**Files:**
- Modify: `bloom-runtime/ts/harnessProjectManifest.ts`
- Modify: `bloom-runtime/ts/harnessProjectManifest.policy-test.ts`

**Interfaces:**
- Extends `HarnessProjectManifestResolution` with a resolved read-only `profile`.
- Explicit manifest `project.type` remains the source input; inferred manifests resolve to `unknown` unless a future discovery layer supplies a trusted type.

- [ ] **Step 1:** Add failing tests that explicit project types resolve to the expected profile and inferred manifests remain `unknown`.
- [ ] **Step 2:** Run focused manifest tests; expect RED due to missing profile output.
- [ ] **Step 3:** Resolve profile metadata during manifest loading without changing commands, quality gates, or permissions.
- [ ] **Step 4:** Re-run manifest and pack-plan tests; expect PASS.
- [ ] **Step 5:** Commit `feat : bind harness manifests to project profiles`.

### Task 4: Regression Gate

- [ ] **Step 1:** Compile all policy tests.
- [ ] **Step 2:** Run pack, profile, manifest, pack-plan, protocol, history, and completion focused suites.
- [ ] **Step 3:** Run `pnpm run build:bloom-worker`.
- [ ] **Step 4:** Run full Windows Bloom runtime suite; only the documented `lunaServerRuntime` POSIX-path baseline may remain.
- [ ] **Step 5:** Push and require the PR `Harness` job on `ubuntu-latest` to be green, then record head SHA/run ID.

## Deferred after this plan

- Framework-specific command discovery/execution adapters.
- Approval/protected-action records and safe retry/idempotency.
- Iseol tree/timeline projection.
- Iseol Core/Web/Bot production wiring.
