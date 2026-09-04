import * as assert from "node:assert/strict";

import type { HarnessEvidence, HarnessEvidenceKind } from "./harnessContracts";
import { resolveHarnessPackBinding } from "./harnessPackBinding";
import { evaluateHarnessPackProjectCompletion } from "./harnessProjectCompletionGate";
import type { ProjectTaskRun } from "./types";

const ev = (id: string, kind: HarnessEvidenceKind): HarnessEvidence => ({
  version: 1,
  id,
  kind,
  summary: id,
});

function doneRun(
  taskId: string,
  role: ProjectTaskRun["role"],
  evidence: HarnessEvidence[],
): ProjectTaskRun {
  return {
    taskId,
    role,
    agentId: `rose:${role}`,
    status: "done",
    attempts: 1,
    branchName: null,
    worktreePath: null,
    threadId: null,
    sessionId: null,
    turnId: null,
    eventsPath: null,
    stderrPath: null,
    commitSha: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    reviewedPullRequests: [],
    summary: "done",
    rationaleSummary: "done",
    evidence: [],
    verification: [],
    blockers: [],
    lastError: null,
    startedAt: "2026-09-04T00:00:00Z",
    completedAt: "2026-09-04T00:01:00Z",
    harnessCompletion: {
      version: 1,
      accepted: true,
      evidence,
      requiredEvidence: [],
      rejectionReason: null,
    },
  };
}

const binding = resolveHarnessPackBinding({ intent: "Fix login crash" });
const gate = evaluateHarnessPackProjectCompletion({
  binding,
  taskRuns: [
    doneRun("FE", "frontend", [ev("file", "file-change")]),
    doneRun("REV", "reviewer", [ev("review", "review")]),
    doneRun("QA", "qa", [ev("test", "test")]),
  ],
});
assert.equal(gate.ready, true);
assert.deepEqual(gate.missingEvidenceKinds, []);

const legacy = {
  ...doneRun("LEGACY", "qa", []),
  harnessCompletion: null,
  evidence: ["test passed"],
};
const legacyGate = evaluateHarnessPackProjectCompletion({
  binding,
  taskRuns: [legacy],
});
assert.equal(legacyGate.ready, false);
assert(legacyGate.missingEvidenceKinds.includes("test"));

assert.throws(
  () => evaluateHarnessPackProjectCompletion({
    binding,
    taskRuns: [
      doneRun("FE", "frontend", [ev("duplicate", "file-change")]),
      doneRun("REV", "reviewer", [ev("duplicate", "review")]),
    ],
  }),
  /duplicate/i,
);
const malformed = {
  ...doneRun("BAD", "qa", []),
  harnessCompletion: {
    version: 1,
    accepted: true,
    evidence: [{ version: 1, id: "bad", kind: "fake", summary: "bad" }],
    requiredEvidence: [],
    rejectionReason: null,
  },
} as unknown as ProjectTaskRun;
assert.throws(
  () => evaluateHarnessPackProjectCompletion({ binding, taskRuns: [malformed] }),
  /evidence kind|invalid/i,
);

const unbound = evaluateHarnessPackProjectCompletion({
  binding: resolveHarnessPackBinding({ intent: "Add profile" }),
  taskRuns: [legacy],
});
assert.equal(unbound.ready, true);

const blocked = evaluateHarnessPackProjectCompletion({
  binding: resolveHarnessPackBinding({ intent: "x", explicitPack: "unknown" }),
  taskRuns: [],
});
assert.equal(blocked.ready, false);
assert.match(blocked.reasons.join(" "), /unknown/i);

console.log("PASS  Bloom Harness project pack completion scenarios passed.");
