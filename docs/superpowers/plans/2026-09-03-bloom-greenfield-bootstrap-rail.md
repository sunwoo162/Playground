# Bloom Greenfield Bootstrap Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make failed Local Agent tool activity observable and give supported greenfield projects a deterministic source/config baseline before implementation Agents run.

**Architecture:** The Node Local Agent runner appends sanitized action/result events directly to a runtime-owned JSONL path on every step. The headless Builder adds a separate `bootstrap` phase backed by a strict scaffold profile and a Runtime command that creates/commits the baseline before task dispatch.

**Tech Stack:** TypeScript/Node.js, Rust headless runtime bridge, Git/GitHub CLI, existing Bloom policy-test harness.

**Spec:** `docs/superpowers/specs/2026-09-03-bloom-greenfield-bootstrap-rail.md`

## Global Constraints

- Existing review/Reviewer/QA DAG rules remain unchanged.
- Existing writer branch/worktree and Runtime-owned Git publication semantics remain unchanged.
- Journal records must not persist file contents or secrets; record paths, byte counts, hashes, statuses, and errors only.
- Older snapshots/plans without `scaffoldProfile` must remain readable.
- Live E2E Pulseboard must deterministically resolve to `react-api-sqlite-monorepo-v1`.

---### Task 1: Failure-safe Local Agent journal

**Files:**
- Modify: `bloom-runtime/ts/bloomLocalAgentRuntime.ts`
- Modify: `bloom-runtime/ts/bloomLocalAgentInference.policy-test.ts`
- Modify: `bloom-runtime/src/agent_runtime.rs`

**Interfaces:**
- Consumes: runtime-owned `eventsPath` supplied with a Local Agent request.
- Produces: append-only JSONL records for sanitized `action` and `toolResult` observations.

- [ ] Write a policy test where a repeated failed write causes `runLocalAgent` to reject, then assert the journal still contains the first action path and first tool error.
- [ ] Compile and run the targeted test; verify RED because failed runs currently leave no journal.
- [ ] Add optional `eventsPath` to the Local Agent input and append each event immediately after it is observed.
- [ ] Pass the existing Rust `events_path` into the Node runner request; retain success-path compatibility.
- [ ] Re-run targeted Local Agent policy tests and verify GREEN.
- [ ] Commit as `fix : persist local agent action journal`.

### Task 2: Strict scaffold profile and bootstrap phase

**Files:**
- Modify: `bloom-runtime/ts/types.ts`
- Modify: `bloom-runtime/ts/e2eSmoke.ts`
- Modify: `bloom-runtime/ts/headlessBuilderExecutor.ts`
- Modify: `bloom-runtime/ts/headlessBuilderExecutor.policy-test.ts`
- Modify: `bloom-runtime/src/project_runtime.rs`
- Modify: `bloom-runtime/src/headless_runtime.rs`
- Modify: `bloom-worker/run.js`

**Interfaces:**
- Produces: `ScaffoldProfile = "none" | "react-api-sqlite-monorepo-v1"` and a Runtime bootstrap result with profile, commit SHA, and generated-file evidence.- [ ] Add failing policy coverage proving Live E2E resolves the supported scaffold profile and `bootstrap` is persisted before any `dispatch:*` event.
- [ ] Verify RED because the plan/runtime currently has no scaffold phase or Runtime command.
- [ ] Add the strict profile type with legacy fallback to `none`; force the Live E2E marker to the Pulseboard profile without spending PM repair budget.
- [ ] Add a Runtime `bootstrapGreenfieldProject` bridge command and call it only after repository bootstrap, then persist phase `bootstrap` before task waves.
- [ ] For `react-api-sqlite-monorepo-v1`, create only deterministic baseline source/config files, commit them on `develop`, push `develop`, and return observed file/commit evidence.
- [ ] Re-run targeted Headless Builder, Live E2E, and bootstrap policy tests until GREEN.
- [ ] Commit as `feat : add greenfield bootstrap rail`.

### Task 3: Integration verification

**Files:**
- Verify all modified runtime/worker files.

- [ ] Run `pnpm run test:production-runtime`.
- [ ] Run `pnpm run test:bloom-runtime`; classify only the known Windows Luna POSIX-path mismatch as pre-existing if it remains the sole failure.
- [ ] Run `pnpm run build:bloom-worker`.
- [ ] Run `git diff --check origin/main...HEAD`.
- [ ] Review the final diff for secret leakage, duplicated state machines, and stale snapshot compatibility.
- [ ] Push the branch, open a PR, wait for Linux Harness, merge only if required checks are green, then verify Worker deployment before starting the next Live E2E run.