# Bloom Runtime Completion Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make live Bloom task completion fail closed unless runtime-owned evidence satisfies the existing Harness Completion Gate.

**Architecture:** Keep the legacy Local Agent final-report schema stable. Add safe command metadata to the Local Agent journal, have the Rust evidence boundary convert journal and verified repository facts into `completionObservations`, then use one TypeScript Runtime Completion Adapter before either project-state or headless task state can become `done`.

**Tech Stack:** TypeScript 5.7, Node.js 22, Rust/Tauri, existing Bloom policy-test runner, existing Harness contracts/completion gate.

**Spec:** `docs/superpowers/specs/2026-09-04-bloom-runtime-completion-adapter-design.md`

## Global Constraints

- Do not treat `report.evidence` or `report.verification` as trusted Harness evidence.
- Do not change the Local Agent `finalReportContract()` JSON schema in this slice.
- Reuse `REPOSITORY_WRITER_ROLES`; do not create another TypeScript writer-role list.
- Normal dispatch and interrupted recovery must share the same completion enforcement.
- A completed result without runtime-owned `completionObservations` fails closed.
- Do not globally apply `BUG_FIX_PACK.requiredEvidence` before live Pack-to-task binding exists.
- Preserve branch/commit/PR/report fields for audit even when Harness completion is rejected.
- Existing merge gate stays in place as a second defense.

---### Task 1: Safe Local Agent command observations

**Files:**
- Modify: `bloom-runtime/ts/bloomLocalAgentRuntime.ts`
- Modify: `bloom-runtime/ts/bloomLocalAgentRuntime.policy-test.ts`

**Interfaces:**
- Produces: `RuntimeCommandClass = "test" | "build" | "lint" | "typecheck" | "install" | "other"`.
- Produces journal action records with `step`, `action:"run"`, `command`, `commandClass`, and optional validated relative `cwd`; never raw argv.
- Later Rust parsing pairs these action records with the existing same-step `toolResult` record.

- [ ] **Step 1: Write failing classification/journal tests**

Add assertions covering `pnpm test`, `pnpm run test:bloom-runtime`, `npm run build`, `cargo test`, `cargo build`, `pnpm lint`, `pnpm typecheck`, and `node script.js => other`. Run the Local Agent with a mocked model response containing a secret-looking arg and assert the persisted/action event does not contain that arg.

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json && node ../../.tmp/bloom-policy-tests/bloomLocalAgentRuntime.policy-test.js`

Expected: FAIL because safe command classification fields/functions do not exist.

- [ ] **Step 3: Implement minimal safe classification**

Use only allow-listed executable basename plus safe subcommand/`run` target tokens. Persist `command` basename and `commandClass`; do not persist `args`, stdout, stderr, environment values, or arbitrary command text.

- [ ] **Step 4: Run focused test and verify GREEN**

Run the same command and require exit code 0.

- [ ] **Step 5: Commit**

`git add bloom-runtime/ts/bloomLocalAgentRuntime.ts bloom-runtime/ts/bloomLocalAgentRuntime.policy-test.ts && git commit -m "feat : journal bloom command observations"`### Task 2: Rust completion observation transport

**Files:**
- Modify: `bloom-runtime/src/agent_runtime.rs`
- Modify: `bloom-runtime/src/agent_reconciliation.rs`
- Modify: `bloom-runtime/src/agent_evidence_runtime.rs`
- Test: Rust unit tests inside `agent_evidence_runtime.rs`

**Interfaces:**
- Produces camelCase `completionObservations` on completed task results.
- Produces `commands: RuntimeCommandObservation[]` where each item has `step`, `command`, `commandClass`, `ok`, `exitCode`.
- Produces optional verified `publication` with `branchName`, `commitSha`, `pullRequestNumber`, `pullRequestUrl` after existing repository/PR verification succeeds.

- [ ] **Step 1: Write failing Rust parser tests**

Create temp JSONL fixtures with paired run/tool records. Assert same-step pairing, sorted command observations, malformed duplicate run records rejected, and raw `args` fields ignored even if present.

- [ ] **Step 2: Run focused Rust test and verify RED**

Run: `cargo test --manifest-path bloom-runtime/Cargo.toml agent_evidence_runtime::tests -- --nocapture`

Expected: FAIL because completion observation parser/DTO does not exist.

- [ ] **Step 3: Implement DTO and journal parser**

Add serializable observation structs and a parser that reads each JSONL line, records only safe `run` action metadata, pairs it with one `toolResult` by `step`, and rejects contradictory duplicates for completed results.

- [ ] **Step 4: Attach verified publication metadata**

After `verify_writer_repository_evidence()` succeeds, populate publication from the already verified result. Non-writers get `publication: null`. Completed normal and recovered results receive `completionObservations`; blocked results may omit it.

- [ ] **Step 5: Run Rust test and `cargo check` GREEN**

Run: `cargo test --manifest-path bloom-runtime/Cargo.toml agent_evidence_runtime::tests -- --nocapture` and `cargo check --manifest-path bloom-runtime/Cargo.toml`.

- [ ] **Step 6: Commit**

`git add bloom-runtime/src/agent_runtime.rs bloom-runtime/src/agent_reconciliation.rs bloom-runtime/src/agent_evidence_runtime.rs && git commit -m "feat : expose bloom completion observations"`### Task 3: Pure Runtime Completion Adapter

**Files:**
- Create: `bloom-runtime/ts/runtimeCompletionAdapter.ts`
- Create: `bloom-runtime/ts/runtimeCompletionAdapter.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`

**Interfaces:**
- Consumes legacy report fields structurally, runtime `completionObservations`, task role, task ID, and declared dependency PR numbers.
- Produces `RuntimeHarnessCompletionPacket { result, evidence, requiredEvidence }`.
- Produces `evaluateRuntimeTaskCompletion(input) -> { accepted, packet, gate, rejectionReason }` and always invokes `evaluateHarnessCompletion()`.

- [ ] **Step 1: Write failing adapter tests**

Cover: writer claim without publication rejected; verified publication satisfies `file-change`; QA `verification: passed` without observed test rejected; latest failed test invalidates earlier pass; later successful test restores evidence; reviewer dependency PR accepted; unrelated PR rejected; `test-automation` requires both `file-change` and `test`; missing observations on `completed` fails closed.

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json && node ../../.tmp/bloom-policy-tests/runtimeCompletionAdapter.policy-test.js`

Expected: FAIL because `runtimeCompletionAdapter` does not exist.

- [ ] **Step 3: Implement role baseline and deterministic evidence IDs**

Use `REPOSITORY_WRITER_ROLES` for `file-change`; add `review` for `code-review`/`reviewer`; add `test` for `qa`/`test-automation`. Create command IDs as `<taskId>:command:<step>`, test/build IDs with their latest successful step, file-change ID from verified commit SHA, GitHub ID from verified PR number, and review ID from sorted dependency-validated PR numbers.

- [ ] **Step 4: Normalize the Harness result**

Legacy `completed` maps to candidate `done`; legacy blocked maps to `blocked`. `summary` and blockers remain descriptive; `changedFiles`, `risks`, and `nextActions` stay empty; `commandsExecuted` contains only normalized command/class labels; `evidenceIds` comes only from adapter-created evidence.

- [ ] **Step 5: Run focused test GREEN**

Run the same focused command and require exit code 0.

- [ ] **Step 6: Commit**

`git add bloom-runtime/ts/runtimeCompletionAdapter.ts bloom-runtime/ts/runtimeCompletionAdapter.policy-test.ts bloom-runtime/tsconfig.policy-tests.json && git commit -m "feat : adapt bloom runtime completion evidence"`### Task 4: Enforce Gate in project-state completion and startup recovery

**Files:**
- Modify: `bloom-runtime/ts/runtime.ts`
- Modify: `bloom-runtime/ts/store.ts`
- Modify: `bloom-runtime/ts/sessionReconciliation.ts`
- Modify: `bloom-runtime/ts/sessionReconciliation.policy-test.ts`
- Modify: `bloom-runtime/ts/orchestrationCore.policy-test.ts` only if fixture support is required.

**Interfaces:**
- Extends `AgentTaskRunResult` with optional `completionObservations`; `completed` results require it at enforcement time.
- `completeAgentTask()` derives declared dependency PRs from the current plan/taskRuns and calls `evaluateRuntimeTaskCompletion()` before assigning `done`.
- Startup recovery continues calling `completeAgentTask()`, so recovered completions cannot bypass the Gate.

- [ ] **Step 1: Write failing state-transition tests**

Add fixtures where a writer returns legacy `completed` with no observations and assert the stored task is `blocked`, `lastError` contains a deterministic Harness rejection, and a dependent task remains `pending`. Add a valid publication fixture and assert `done` unlocks the dependency. Add recovered-result versions of both cases.

- [ ] **Step 2: Run focused policy test and verify RED**

Run: `pnpm --dir apps/desktop exec tsc -p ../../bloom-runtime/tsconfig.policy-tests.json && node ../../.tmp/bloom-policy-tests/sessionReconciliation.policy-test.js`

Expected: FAIL because legacy completion still becomes `done` without Harness evidence.

- [ ] **Step 3: Wire `completeAgentTask()` through the adapter**

Preserve report/branch/PR fields. For rejected `completed` results, write `status:"blocked"`, preserve output arrays, set deterministic `lastError`, then refresh dependency readiness. Legacy blocked results remain blocked without fabricated evidence.

- [ ] **Step 4: Verify normal and recovered project-state paths GREEN**

Run the focused reconciliation test plus `node ../../.tmp/bloom-policy-tests/orchestrationCore.policy-test.js`.

- [ ] **Step 5: Commit**

`git add bloom-runtime/ts/runtime.ts bloom-runtime/ts/store.ts bloom-runtime/ts/sessionReconciliation.ts bloom-runtime/ts/sessionReconciliation.policy-test.ts bloom-runtime/ts/orchestrationCore.policy-test.ts && git commit -m "feat : gate bloom project task completion"`### Task 5: Enforce Gate in headless normal dispatch and crash recovery

**Files:**
- Modify: `bloom-runtime/ts/headlessBuilderExecutor.ts`
- Modify: `bloom-runtime/ts/headlessBuilderExecutor.policy-test.ts`
- Modify: `bloom-runtime/ts/headlessCrashRecovery.policy-test.ts`
- Modify fixture helpers in those files so completed results carry valid `completionObservations` where appropriate.

**Interfaces:**
- `applyTaskResult()` receives plan/run context sufficient to derive declared dependency PRs and calls the same `evaluateRuntimeTaskCompletion()` as project-state completion.
- Both `dispatchTask()` results and `reconcileTask()` recovered results pass through the same `applyTaskResult()` function.

- [ ] **Step 1: Write failing headless completion tests**

Add a writer completion with a PR/commit but no observations and assert Builder blocks before dependency execution/integration. Add a QA result with Agent-declared passed verification but no successful test observation and assert blocked. Add valid writer and QA observations and assert orchestration progresses.

- [ ] **Step 2: Write failing crash-recovery tests**

Return `outcome:"recovered"` with an otherwise completed writer but missing observations; assert the recovered task becomes blocked and the Builder does not call merge. Add a valid recovered publication observation and assert recovery proceeds.

- [ ] **Step 3: Run focused headless tests and verify RED**

Run compiled `headlessBuilderExecutor.policy-test.js` and `headlessCrashRecovery.policy-test.js`.

Expected: FAIL because `applyTaskResult()` still trusts legacy `completed`.

- [ ] **Step 4: Wire the shared adapter into `applyTaskResult()`**

Derive dependency PRs from the current plan/taskRuns, preserve result metadata on rejection, set `lastError` to the adapter rejection, and let the existing readiness/blocked checks stop downstream work and integration.

- [ ] **Step 5: Run both focused tests GREEN**

Recompile policy tests, then run both focused files and require exit code 0.

- [ ] **Step 6: Commit**

`git add bloom-runtime/ts/headlessBuilderExecutor.ts bloom-runtime/ts/headlessBuilderExecutor.policy-test.ts bloom-runtime/ts/headlessCrashRecovery.policy-test.ts && git commit -m "feat : gate bloom headless completion"`### Task 6: Full regression, Linux parity, and implementation record

**Files:**
- Modify: `docs/superpowers/plans/2026-09-04-bloom-runtime-completion-adapter.md` execution notes only.

**Interfaces:**
- No new runtime API. This task proves the complete enforcement chain is stable.

- [ ] **Step 1: Run Windows policy regression with known baseline exclusions**

Compile policy tests, run all except `lunaServerRuntime.policy-test.js` and `lunaStaticRelease.policy-test.js`, and require zero failures.

- [ ] **Step 2: Run native Linux policy suite**

Using native Linux Node 22 under WSL, compile `bloom-runtime/tsconfig.policy-tests.json` and run `node bloom-runtime/run-policy-tests.cjs`; require the full suite to pass including both platform-sensitive Luna tests.

- [ ] **Step 3: Run worker/Rust/diff verification**

Run `pnpm run build:bloom-worker`, `cargo check --manifest-path bloom-runtime/Cargo.toml`, and `git diff --check`.

- [ ] **Step 4: Verify enforcement scenarios explicitly**

Confirm tests prove: free-form Agent claims cannot satisfy `file-change`/`test`; invalid review targets are blocked; rejected upstream completion does not unlock dependencies; normal and recovered results use the same Gate; merge is never called from a rejected headless run.

- [ ] **Step 5: Record execution evidence**

Append exact RED/GREEN commands, policy-test counts, known Windows baseline notes, Linux full-suite result, worker build result, Rust check result, and final commit list to this plan.

- [ ] **Step 6: Final commit and push**

`git add docs/superpowers/plans/2026-09-04-bloom-runtime-completion-adapter.md && git commit -m "docs : record bloom completion adapter verification" && git push -u origin feat/bloom-runtime-completion-adapter`