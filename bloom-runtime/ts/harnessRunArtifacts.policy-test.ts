import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { createHarnessRunArtifactStore } from "./harnessRunArtifacts";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bloom-run-artifacts-"));
}

const root = makeRoot();
const store = createHarnessRunArtifactStore(root, "run-001");
assert.equal(store.readRun().identity, null);

const boundIdentity = {
  projectId: "jobdam",
  taskId: "TASK-52",
  runId: "run-bound",
  agentId: "frontend-1",
};
const boundStore = createHarnessRunArtifactStore(root, "run-bound", boundIdentity);
const identityPath = path.join(boundStore.runDir, "identity.json");
assert.deepEqual(JSON.parse(fs.readFileSync(identityPath, "utf8")), boundIdentity);
assert.deepEqual(boundStore.readRun().identity, boundIdentity);

const publicEvent1 = {
  version: 1 as const, eventId: "public-event-1", identity: boundIdentity, seq: 1,
  type: "RUN_STATE_CHANGED" as const, state: "RUNNING" as const,
  at: "2026-09-07T00:00:00.000Z", summary: "run started", evidenceIds: [],
};
const publicEvent2 = {
  version: 1 as const, eventId: "public-event-2", identity: boundIdentity, seq: 2,
  type: "EVIDENCE_RECORDED" as const, state: "TESTING" as const,
  at: "2026-09-07T00:00:01.000Z", summary: "test evidence recorded", evidenceIds: ["bound-test"],
};
boundStore.appendPublicEvent(publicEvent1);
boundStore.appendPublicEvent(publicEvent1);
assert.deepEqual(boundStore.readRun().publicEvents, [publicEvent1]);
boundStore.appendPublicEvent(publicEvent2);
assert.deepEqual(boundStore.readRun().publicEvents, [publicEvent1, publicEvent2]);
assert.throws(() => boundStore.appendPublicEvent({ ...publicEvent1, summary: "conflicting replay" }), /eventId|conflict|duplicate/i);
assert.throws(() => boundStore.appendPublicEvent({ ...publicEvent2, eventId: "public-event-gap", seq: 4 }), /seq|sequence/i);
assert.throws(() => boundStore.appendPublicEvent({ ...publicEvent2, eventId: "public-event-foreign", seq: 3, identity: { ...boundIdentity, runId: "run-other" } }), /identity.*mismatch|mismatch.*identity/i);
assert.throws(() => store.appendPublicEvent({ ...publicEvent1, identity: { ...boundIdentity, runId: "run-001" } }), /identity-bound|unbound|identity/i);

store.writeSnapshot("request", { objective: "Fix login" });
const requestPath = path.join(root, ".bloom", "runs", "run-001", "request.json");
assert.deepEqual(JSON.parse(fs.readFileSync(requestPath, "utf8")), {
  objective: "Fix login",
});
assert.equal(fs.readFileSync(requestPath, "utf8").endsWith("\n"), true);
assert.throws(
  () => store.writeSnapshot("request", { objective: "replace" }),
  /already exists/,
);
assert.throws(
  () => createHarnessRunArtifactStore(root, "run-bound", {
    ...boundIdentity,
    projectId: "other-project",
  }),
  /identity.*mismatch|mismatch.*identity|conflict/i,
);
boundStore.appendEvidence({
  version: 1,
  identity: boundIdentity,
  id: "bound-test",
  kind: "test",
  summary: "bound evidence",
});
assert.throws(
  () => boundStore.appendEvidence({
    version: 1,
    identity: { ...boundIdentity, runId: "run-other" },
    id: "foreign-test",
    kind: "test",
    summary: "foreign evidence",
  }),
  /identity.*mismatch|mismatch.*identity/i,
);

const historyAt = "2026-09-07T00:00:00.000Z";
const decisionRecord = {
  version: 1 as const, id: "decision-1", identity: boundIdentity,
  problem: "session expires", observations: ["refresh/reset overlap"],
  options: ["redirect guard", "refresh lifecycle"], decision: "refresh lifecycle",
  reason: "fix the source race", outcome: null, evidenceIds: ["bound-test"], at: historyAt,
};
const failureRecord = {
  version: 1 as const, id: "failure-1", identity: boundIdentity, failureType: "test",
  severity: "high" as const, summary: "E2E failed", cause: "race", evidenceIds: ["bound-test"], at: historyAt,
};
const recoveryRecord = {
  version: 1 as const, id: "recovery-1", identity: boundIdentity, failureId: "failure-1",
  action: "replan", reason: "remove race", status: "succeeded" as const, result: "green",
  actorAgentId: "debug-router-1", evidenceIds: ["bound-test"], at: historyAt,
};
const artifactRecord = {
  version: 1 as const, id: "artifact-1", identity: boundIdentity, kind: "pull-request" as const,
  summary: "PR #52", reference: "https://github.com/example/repo/pull/52", digest: null, at: historyAt,
};
const runResultRecord = {
  version: 1 as const, identity: boundIdentity, status: "done" as const, summary: "completed",
  decisionIds: ["decision-1"], failureIds: ["failure-1"], recoveryIds: ["recovery-1"],
  evidenceIds: ["bound-test"], artifactIds: ["artifact-1"],
  startedAt: historyAt, completedAt: "2026-09-07T00:10:00.000Z",
};
boundStore.appendDecision(decisionRecord);
boundStore.appendFailure(failureRecord);
boundStore.appendRecovery(recoveryRecord);
boundStore.appendArtifact(artifactRecord);
boundStore.writeRunResult(runResultRecord);
const structured = boundStore.readRun();
assert.deepEqual(structured.decisions, [decisionRecord]);
assert.deepEqual(structured.failures, [failureRecord]);
assert.deepEqual(structured.recoveries, [recoveryRecord]);
assert.deepEqual(structured.artifacts, [artifactRecord]);
assert.deepEqual(structured.runResult, runResultRecord);
assert.throws(() => boundStore.appendDecision(decisionRecord), /decision.*exists|duplicate/i);
assert.throws(() => boundStore.appendArtifact({ ...artifactRecord, identity: { ...boundIdentity, runId: "run-other" }, id: "artifact-foreign" }), /identity.*mismatch|mismatch.*identity/i);
assert.throws(() => store.appendDecision(decisionRecord), /identity-bound|unbound|identity/i);
assert.throws(() => boundStore.appendRecovery({ ...recoveryRecord, id: "recovery-unknown", failureId: "failure-unknown" }), /unknown failure|failure.*unknown/i);
assert.throws(() => boundStore.writeRunResult(runResultRecord), /already exists/i);

store.writeSnapshot("manifest", { version: 1 });
store.writeSnapshot("pack", { id: "bug-fix" });
store.writeSnapshot("plan", { tasks: [] });
store.writeSnapshot("dag", { edges: [] });
store.writeSnapshot("review", { status: "approved" });
store.writeSnapshot("qa", { status: "passed" });
store.writeSnapshot("result", { status: "done" });
store.writeRetrospective("# Retrospective\n\nNo regressions.\n");
assert.throws(() => store.writeRetrospective("replace"), /already exists/);

for (const invalidRunId of ["../escape", "..", ".", "run/escape", "run\\escape", "", " run-001"]) {
  assert.throws(
    () => createHarnessRunArtifactStore(root, invalidRunId),
    /run id/i,
  );
}

const symlinkRoot = makeRoot();
const externalRoot = makeRoot();
fs.symlinkSync(
  externalRoot,
  path.join(symlinkRoot, ".bloom"),
  process.platform === "win32" ? "junction" : "dir",
);
assert.throws(
  () => createHarnessRunArtifactStore(symlinkRoot, "run-symlink"),
  /symbolic link|symlink|runs root/i,
);
fs.rmSync(symlinkRoot, { recursive: true, force: true });
fs.rmSync(externalRoot, { recursive: true, force: true });

if (process.platform !== "win32") {
  const fileLinkStore = createHarnessRunArtifactStore(root, "run-file-link");
  const externalEvents = path.join(makeRoot(), "outside-events.jsonl");
  fs.writeFileSync(externalEvents, "sentinel\n", "utf8");
  fs.symlinkSync(externalEvents, path.join(fileLinkStore.runDir, "events.jsonl"), "file");
  assert.throws(
    () => fileLinkStore.appendEvent({ type: "escape", at: "2026-09-04T00:00:00Z" }),
    /symbolic link|symlink/i,
  );
  assert.equal(fs.readFileSync(externalEvents, "utf8"), "sentinel\n");
  fs.rmSync(path.dirname(externalEvents), { recursive: true, force: true });
}

store.appendEvent({ type: "run.started", at: "2026-09-04T00:00:00Z" });
store.appendEvent({ type: "plan.created", at: "2026-09-04T00:00:01Z" });
const eventsPath = path.join(root, ".bloom", "runs", "run-001", "events.jsonl");
const eventLines = fs.readFileSync(eventsPath, "utf8").trim().split("\n");
assert.equal(eventLines.length, 2);
assert.equal(JSON.parse(eventLines[0]).type, "run.started");
assert.equal(JSON.parse(eventLines[1]).type, "plan.created");
store.appendEvidence({
  version: 1,
  id: "test-1",
  kind: "test",
  summary: "passed",
});
const evidencePath = path.join(root, ".bloom", "runs", "run-001", "evidence.json");
store.appendEvidence({
  version: 1,
  id: "review-1",
  kind: "review",
  summary: "approved",
});
assert.deepEqual(JSON.parse(fs.readFileSync(evidencePath, "utf8")), [
  { version: 1, id: "test-1", kind: "test", summary: "passed" },
  { version: 1, id: "review-1", kind: "review", summary: "approved" },
]);
assert.throws(
  () => store.appendEvidence({ version: 1, id: "test-1", kind: "test", summary: "replace" }),
  /evidence id already exists/,
);
assert.throws(
  () => store.appendEvidence({ version: 1, id: "bad", kind: "unknown" as "test", summary: "x" }),
  /evidence kind/,
);

const restored = store.readRun();
assert.equal(restored.runId, "run-001");
assert.deepEqual(restored.snapshots.request, { objective: "Fix login" });
assert.equal(restored.events[0]?.type, "run.started");
assert.equal(restored.evidence[0]?.id, "test-1");
assert.match(restored.retrospective ?? "", /Retrospective/);

const emptyStore = createHarnessRunArtifactStore(root, "run-empty");
const empty = emptyStore.readRun();
assert.equal(empty.identity, null);
assert.deepEqual(empty.snapshots, {});
assert.deepEqual(empty.events, []);
assert.deepEqual(empty.evidence, []);
assert.equal(empty.retrospective, undefined);

const corruptStore = createHarnessRunArtifactStore(root, "run-corrupt");
fs.writeFileSync(path.join(corruptStore.runDir, "request.json"), "{bad json", "utf8");
assert.throws(() => corruptStore.readRun(), /request\.json/);

fs.rmSync(root, { recursive: true, force: true });
console.log("PASS  Bloom Harness run artifact scenarios passed.");
