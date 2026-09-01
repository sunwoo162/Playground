const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}
function write(path, text) {
  fs.writeFileSync(path, text);
}
function replaceOnce(text, oldText, newText, label) {
  if (!text.includes(oldText)) throw new Error(`${label} anchor missing`);
  return text.replace(oldText, newText);
}

let path = 'bloom-runtime/ts/headlessCrashRecovery.policy-test.ts';
let text = read(path);
text = replaceOnce(text,
  'function persistentClient(crashPredicate: CrashPredicate) {',
  'function persistentClient(crashPredicate: CrashPredicate, crashAfterCommit = false) {',
  'persistentClient signature');
text = replaceOnce(text,
  '      if (crashArmed && crashPredicate(next, previous, write.phase)) {\n        crashArmed = false;\n        crashCount += 1;\n        throw new Error("[FAILURE-INJECTION] simulated worker crash before snapshot commit");\n      }',
  '      const shouldCrash = crashArmed && crashPredicate(next, previous, write.phase);\n      if (shouldCrash && !crashAfterCommit) {\n        crashArmed = false;\n        crashCount += 1;\n        throw new Error("[FAILURE-INJECTION] simulated worker crash before snapshot commit");\n      }',
  'pre-commit crash gate');
text = replaceOnce(text,
  '      stored = {\n        schemaVersion: write.schemaVersion,\n        version: currentVersion + 1,\n        phase: write.phase,\n        payloadJson: write.payloadJson,\n        updatedByWorkerId: workerId,\n        updatedAt: "2026-08-27T07:00:30Z",\n      };\n      return stored;',
  '      stored = {\n        schemaVersion: write.schemaVersion,\n        version: currentVersion + 1,\n        phase: write.phase,\n        payloadJson: write.payloadJson,\n        updatedByWorkerId: workerId,\n        updatedAt: "2026-08-27T07:00:30Z",\n      };\n      if (shouldCrash && crashAfterCommit) {\n        crashArmed = false;\n        crashCount += 1;\n        throw new Error("[FAILURE-INJECTION] simulated worker crash after snapshot commit");\n      }\n      return stored;',
  'post-commit crash gate');
text = replaceOnce(text,
  '      const result = evidenceByTask.get(input.taskId) ?? null;\n      return result\n        ? { outcome: "recovered" as const, reason: "durable repository/session evidence found", result }\n        : { outcome: "blocked" as const, reason: "durable evidence missing", result: null };',
  '      const result = evidenceByTask.get(input.taskId) ?? null;\n      if (result) {\n        return { outcome: "recovered" as const, reason: "durable repository/session evidence found", result };\n      }\n      return REPOSITORY_WRITER_ROLES.includes(input.role)\n        ? { outcome: "blocked" as const, reason: "durable evidence missing", result: null }\n        : { outcome: "retryable" as const, reason: "terminal evidence missing for interrupted non-writer", result: null };',
  'fake reconciliation outcome');
const interruptedTest = `\nasync function testInterruptedNonWriterTaskRedispatchesWhenNoTerminalEvidenceExists() {\n  const runtime = fakeRuntime();\n  const storage = persistentClient((next, previous, phase) => {\n    if (phase !== "building" || !previous) return false;\n    const nextReview = next.taskRuns.find((run) => run.role === "code-review");\n    const previousReview = previous.taskRuns.find((run) => run.role === "code-review");\n    return previousReview?.status !== "running" && nextReview?.status === "running";\n  }, true);\n  const executor = makeExecutor(runtime.runtime);\n  await expectCrash(executor, storage.client);\n  check(\n    ![...runtime.evidenceByTask.values()].some((result) => result.role === "code-review"),\n    "dispatch must not happen before injected process loss",\n  );\n  await resume(executor, storage.client);\n  const reconciledTaskIds = [...runtime.reconcileCount.entries()]\n    .filter(([, count]) => count === 1)\n    .map(([taskId]) => taskId);\n  checkEqual(reconciledTaskIds.length, 1, "restart must reconcile exactly one interrupted task");\n  const interruptedTaskId = reconciledTaskIds[0];\n  const reviewEvidence = runtime.evidenceByTask.get(interruptedTaskId);\n  check(reviewEvidence?.role === "code-review", "the reconciled interrupted task must be the code-review task");\n  checkEqual(runtime.reconcileCount.get(interruptedTaskId), 1, "restart must first attempt evidence reconciliation");\n  checkEqual(runtime.dispatchCount.get(interruptedTaskId), 1, "in-flight task without terminal evidence must be safely redispatched once");\n}\n\n`;
text = replaceOnce(text,
  'async function testIntegrationRecovery() {',
  interruptedTest + 'async function testIntegrationRecovery() {',
  'interrupted non-writer regression test insertion');
text = replaceOnce(text,
  '  await testReviewEvidenceRecovery();\n  await testIntegrationRecovery();',
  '  await testReviewEvidenceRecovery();\n  await testInterruptedNonWriterTaskRedispatchesWhenNoTerminalEvidenceExists();\n  await testIntegrationRecovery();',
  'regression test runner');
write(path, text);

path = 'bloom-runtime/ts/agentRuntimeOwnedPublishing.policy-test.ts';
text = read(path);
const promptAssertions = `assert(\n  source.includes("reuse or update your existing prefixed top-level comment instead of creating a duplicate"),\n  "review retries must make GitHub comment publication idempotent",\n);\nassert(\n  source.includes("Do not merge, close, label, retarget, or otherwise mutate pull requests"),\n  "review agents must not perform non-idempotent GitHub mutations outside their review comment",\n);\n\n`;
text = replaceOnce(text,
  'console.log("PASS  Luna Runtime owns publishing and cleans task-scoped tool state.");',
  promptAssertions + 'console.log("PASS  Luna Runtime owns publishing and cleans task-scoped tool state.");',
  'review retry prompt assertions');
write(path, text);

path = 'bloom-runtime/ts/headlessBuilderExecutor.ts';
text = read(path);
text = replaceOnce(text,
  'outcome: "recovered" | "blocked";',
  'outcome: "recovered" | "retryable" | "blocked";',
  'reconciliation outcome type');
const helperMarker = 'function ensureTaskRunsMatchPlan(';
const helperIndex = text.indexOf(helperMarker);
if (helperIndex < 0) throw new Error('retry helper insertion marker missing');
const helper = `function retryInterruptedTask(run: ProjectTaskRun, reason: string): ProjectTaskRun {\n  return {\n    ...run,\n    status: "pending",\n    branchName: null,\n    worktreePath: null,\n    threadId: null,\n    sessionId: null,\n    turnId: null,\n    eventsPath: null,\n    stderrPath: null,\n    commitSha: null,\n    pullRequestNumber: null,\n    pullRequestUrl: null,\n    reviewedPullRequests: [],\n    summary: null,\n    rationaleSummary: null,\n    evidence: [],\n    verification: [],\n    blockers: [],\n    lastError: reason,\n    startedAt: null,\n    completedAt: null,\n  };\n}\n\n`;
text = text.slice(0, helperIndex) + helper + text.slice(helperIndex);
text = replaceOnce(text,
  '        if (reconciliation.outcome === "recovered" && reconciliation.result) {\n          payload.taskRuns[index] = applyTaskResult(interrupted, reconciliation.result, now());\n        } else {\n          payload.taskRuns[index] = blockedTask(',
  '        if (reconciliation.outcome === "recovered" && reconciliation.result) {\n          payload.taskRuns[index] = applyTaskResult(interrupted, reconciliation.result, now());\n        } else if (reconciliation.outcome === "retryable") {\n          payload.taskRuns[index] = retryInterruptedTask(\n            interrupted,\n            `Interrupted task is safe to retry without terminal evidence: ${reconciliation.reason}`,\n          );\n        } else {\n          payload.taskRuns[index] = blockedTask(',
  'executor retry branch');
write(path, text);

path = 'bloom-runtime/src/agent_reconciliation.rs';
text = read(path);
const reconcileMarker = 'fn reconcile_interrupted_agent_task_blocking(';
const reconcileIndex = text.indexOf(reconcileMarker);
if (reconcileIndex < 0) throw new Error('reconciliation helper marker missing');
const rustHelpers = `fn retryable(reason: impl Into<String>) -> ReconcileInterruptedAgentTaskResult {\n    ReconcileInterruptedAgentTaskResult {\n        outcome: "retryable".to_string(),\n        reason: reason.into(),\n        result: None,\n    }\n}\n\nfn retryable_or_blocked_before_terminal(\n    input: &ReconcileInterruptedAgentTaskInput,\n    reason: impl Into<String>,\n) -> ReconcileInterruptedAgentTaskResult {\n    let reason = reason.into();\n    if writer_role(input.role.trim()) {\n        unrecoverable(reason)\n    } else {\n        retryable(reason)\n    }\n}\n\n`;
text = text.slice(0, reconcileIndex) + rustHelpers + text.slice(reconcileIndex);
text = text.replace(
  /    if !events_path\.exists\(\) \{[\s\S]*?\n    \}\n\n    let evidence = read_event_evidence/,
  `    if !events_path.exists() {\n        return Ok(retryable_or_blocked_before_terminal(\n            &input,\n            "Interrupted Agent has no App Server event log, so no terminal result can be proven.",\n        ));\n    }\n\n    let evidence = read_event_evidence`);
text = text.replace(
  /    let Some\(thread_id\) = evidence\.thread_id else \{[\s\S]*?\n    \};\n    let Some\(turn_id\)/,
  `    let Some(thread_id) = evidence.thread_id else {\n        return Ok(retryable_or_blocked_before_terminal(\n            &input,\n            "Interrupted Agent has no completed thread/start evidence.",\n        ));\n    };\n    let Some(turn_id)`);
text = text.replace(
  /    let Some\(turn_id\) = evidence\.turn_id else \{[\s\S]*?\n    \};\n    if evidence\.turn_status/,
  `    let Some(turn_id) = evidence.turn_id else {\n        return Ok(retryable_or_blocked_before_terminal(\n            &input,\n            "Interrupted Agent has no completed turn/start evidence.",\n        ));\n    };\n    if evidence.turn_status`);
text = text.replace(
  /    if evidence\.turn_status\.as_deref\(\) != Some\("completed"\) \{[\s\S]*?\n    \}\n    let Some\(final_message\)/,
  `    if evidence.turn_status.as_deref() != Some("completed") {\n        let detail = evidence\n            .turn_error\n            .clone()\n            .unwrap_or_else(|| "turn/completed evidence missing".to_string());\n        if evidence.turn_status.is_none() && !writer_role(input.role.trim()) {\n            return Ok(retryable(format!(\n                "Interrupted non-writer Agent turn has no terminal evidence and may be retried: {detail}"\n            )));\n        }\n        return Ok(unrecoverable(format!(\n            "Interrupted Agent turn did not complete successfully: {detail}"\n        )));\n    }\n    let Some(final_message)`);
write(path, text);

path = 'bloom-runtime/src/agent_runtime.rs';
text = read(path);
text = replaceOnce(text,
  'When reviewing a PR, leave a concise top-level PR comment prefixed with your Luna Agent ID and an evidence-based verdict. Do not pretend GitHub native self-approval is an independent approval when all agents share one GitHub credential.',
  'Before writing a review comment, search the PR for a top-level comment prefixed with your Luna Agent ID; if one exists, reuse or update your existing prefixed top-level comment instead of creating a duplicate. When reviewing a PR, leave a concise top-level PR comment prefixed with your Luna Agent ID and an evidence-based verdict. Do not merge, close, label, retarget, or otherwise mutate pull requests; the review comment is the only GitHub write this role owns. Do not pretend GitHub native self-approval is an independent approval when all agents share one GitHub credential.',
  'review prompt idempotency');
write(path, text);