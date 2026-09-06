import * as assert from "node:assert/strict";

import {
  validateHarnessArtifactRecord,
  validateHarnessDecisionRecord,
  validateHarnessFailureRecord,
  validateHarnessRecoveryRecord,
  validateHarnessRunResultRecord,
} from "./harnessHistoryValidation";

const identity = {
  projectId: "jobdam",
  taskId: "TASK-52",
  runId: "run-102",
  agentId: "frontend-1",
};
const at = "2026-09-07T00:00:00.000Z";
const decision = validateHarnessDecisionRecord({
  version: 1,
  id: "decision-1",
  identity,
  problem: "Session expires unexpectedly",
  observations: ["refresh and reset overlap"],
  options: ["block redirect", "fix refresh lifecycle"],
  decision: "fix refresh lifecycle",
  reason: "solve the source-of-truth race",
  outcome: null,
  evidenceIds: ["test-1"],
  at,
});
assert.deepEqual(decision.identity, identity);
assert.equal(decision.decision, "fix refresh lifecycle");

const failure = validateHarnessFailureRecord({
  version: 1,
  id: "failure-1",
  identity,
  failureType: "test",
  severity: "high",
  summary: "E2E regression failed",
  cause: "refresh/reset race",
  evidenceIds: ["test-1"],
  at,
});
assert.equal(failure.severity, "high");
const recovery = validateHarnessRecoveryRecord({
  version: 1,
  id: "recovery-1",
  identity,
  failureId: "failure-1",
  action: "replan and retry owner",
  reason: "first fix did not remove the race",
  status: "planned",
  result: null,
  actorAgentId: "debug-router-1",
  evidenceIds: [],
  at,
});
assert.equal(recovery.actorAgentId, "debug-router-1");

const artifact = validateHarnessArtifactRecord({
  version: 1,
  id: "artifact-1",
  identity,
  kind: "pull-request",
  summary: "PR #52",
  reference: "https://github.com/example/repo/pull/52",
  digest: null,
  at,
});
assert.equal(artifact.kind, "pull-request");
const runResult = validateHarnessRunResultRecord({
  version: 1,
  identity,
  status: "done",
  summary: "Session fix completed",
  decisionIds: ["decision-1"],
  failureIds: ["failure-1"],
  recoveryIds: ["recovery-1"],
  evidenceIds: ["test-1"],
  artifactIds: ["artifact-1"],
  startedAt: at,
  completedAt: "2026-09-07T00:10:00.000Z",
});
assert.equal(runResult.status, "done");

for (const invalid of [
  { ...decision, id: "" },
  { ...decision, decision: "" },
  { ...decision, at: "not-a-time" },
  { ...decision, identity: { ...identity, runId: "run/escape" } },
]) {
  assert.throws(() => validateHarnessDecisionRecord(invalid));
}
assert.throws(() => validateHarnessFailureRecord({ ...failure, severity: "urgent" }), /severity/i);
assert.throws(() => validateHarnessRecoveryRecord({ ...recovery, status: "looping" }), /status/i);
assert.throws(() => validateHarnessArtifactRecord({ ...artifact, kind: "secret" }), /kind/i);
assert.throws(
  () => validateHarnessArtifactRecord({ ...artifact, reference: "line1\nline2" }),
  /reference/i,
);
assert.throws(
  () => validateHarnessRunResultRecord({
    ...runResult,
    completedAt: "2026-09-06T23:59:59.000Z",
  }),
  /completedAt|startedAt|chronolog/i,
);
assert.throws(
  () => validateHarnessRunResultRecord({
    ...runResult,
    evidenceIds: ["test-1", "test-1"],
  }),
  /duplicate|evidenceIds/i,
);

console.log("PASS  Harness structured history validation scenarios passed.");
