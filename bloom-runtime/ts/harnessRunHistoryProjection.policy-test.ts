import * as assert from "node:assert/strict";

import type { HarnessRunArtifactBundle } from "./harnessRunArtifacts";
import { projectHarnessRunHistory } from "./harnessRunHistoryProjection";

const identity = {
  projectId: "jobdam",
  taskId: "TASK-52",
  runId: "run-102",
  agentId: "frontend-1",
};

function bundle(): HarnessRunArtifactBundle {
  return {
    runId: identity.runId,
    runDir: "/tmp/run-102",
    identity,
    snapshots: {},
    events: [],
    publicEvents: [
      {
        version: 1,
        eventId: "event-1",
        identity,
        seq: 1,
        type: "RUN_STATE_CHANGED",
        state: "RUNNING",
        at: "2026-09-07T00:00:00.000Z",
        summary: "run started",
        evidenceIds: [],
      },
      {
        version: 1,
        eventId: "event-2",
        identity,
        seq: 2,
        type: "RUN_COMPLETED",
        state: "COMPLETE",
        at: "2026-09-07T00:10:00.000Z",
        summary: "run completed",
        evidenceIds: ["test-1"],
      },
    ],
    evidence: [
      {
        version: 1,
        identity,
        id: "test-1",
        kind: "test",
        summary: "42/42 passed",
      },
    ],
    decisions: [
      {
        version: 1,
        id: "decision-1",
        identity,
        problem: "session reset race",
        observations: ["refresh and reset overlap"],
        options: ["redirect guard", "refresh lifecycle"],
        decision: "refresh lifecycle",
        reason: "fix source-of-truth",
        outcome: "race removed",
        evidenceIds: ["test-1"],
        at: "2026-09-07T00:03:00.000Z",
      },
    ],
    failures: [
      {
        version: 1,
        id: "failure-1",
        identity,
        failureType: "test",
        severity: "high",
        summary: "first E2E failed",
        cause: "refresh/reset race",
        evidenceIds: ["test-1"],
        at: "2026-09-07T00:04:00.000Z",
      },
    ],
    recoveries: [
      {
        version: 1,
        id: "recovery-1",
        identity,
        failureId: "failure-1",
        action: "replan and retry",
        reason: "remove race",
        status: "succeeded",
        result: "green",
        actorAgentId: "debug-router-1",
        evidenceIds: ["test-1"],
        at: "2026-09-07T00:05:00.000Z",
      },
    ],
    artifacts: [
      {
        version: 1,
        id: "artifact-1",
        identity,
        kind: "pull-request",
        summary: "PR #52",
        reference: "https://github.com/example/repo/pull/52",
        digest: null,
        at: "2026-09-07T00:09:00.000Z",
      },
    ],
    runResult: {
      version: 1,
      identity,
      status: "done",
      summary: "completed",
      decisionIds: ["decision-1"],
      failureIds: ["failure-1"],
      recoveryIds: ["recovery-1"],
      evidenceIds: ["test-1"],
      artifactIds: ["artifact-1"],
      startedAt: "2026-09-07T00:00:00.000Z",
      completedAt: "2026-09-07T00:10:00.000Z",
    },
    retrospective: undefined,
  };
}
const projection = projectHarnessRunHistory(bundle());
assert.deepEqual(projection.identity, identity);
assert.equal(projection.state, "COMPLETE");
assert.equal(projection.status, "done");
assert.equal(projection.startedAt, "2026-09-07T00:00:00.000Z");
assert.equal(projection.completedAt, "2026-09-07T00:10:00.000Z");
assert.deepEqual(projection.timeline.map((entry) => entry.seq), [1, 2]);
assert.equal(projection.decisions[0]?.id, "decision-1");
assert.equal(projection.failures[0]?.recoveries[0]?.id, "recovery-1");
assert.equal(projection.evidence[0]?.id, "test-1");
assert.equal(projection.artifacts[0]?.id, "artifact-1");

const noIdentity = bundle();
noIdentity.identity = null;
assert.throws(() => projectHarnessRunHistory(noIdentity), /identity-bound|identity/i);

const foreignEvent = bundle();
foreignEvent.publicEvents[1] = {
  ...foreignEvent.publicEvents[1]!,
  identity: { ...identity, runId: "run-other" },
};
assert.throws(() => projectHarnessRunHistory(foreignEvent), /identity.*mismatch|mismatch.*identity/i);
const missingEvidence = bundle();
missingEvidence.decisions[0] = {
  ...missingEvidence.decisions[0]!,
  evidenceIds: ["missing-evidence"],
};
assert.throws(() => projectHarnessRunHistory(missingEvidence), /unknown evidence|evidence.*unknown/i);

const unknownFailure = bundle();
unknownFailure.recoveries[0] = {
  ...unknownFailure.recoveries[0]!,
  failureId: "failure-missing",
};
assert.throws(() => projectHarnessRunHistory(unknownFailure), /unknown failure|failure.*unknown/i);

const badResultReference = bundle();
badResultReference.runResult = {
  ...badResultReference.runResult!,
  artifactIds: ["artifact-missing"],
};
assert.throws(() => projectHarnessRunHistory(badResultReference), /unknown artifact|artifact.*unknown/i);

const badSeq = bundle();
badSeq.publicEvents[1] = { ...badSeq.publicEvents[1]!, seq: 3 };
assert.throws(() => projectHarnessRunHistory(badSeq), /seq|sequence/i);

console.log("PASS  Harness run history projection scenarios passed.");
