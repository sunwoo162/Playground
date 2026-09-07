import * as assert from "node:assert/strict";

import {
  validateIseolHarnessControlCommand,
  validateIseolHarnessEvent,
} from "./iseolHarnessProtocol";

const identity = {
  projectId: "jobdam",
  taskId: "TASK-52",
  runId: "run-102",
  agentId: "frontend-1",
};
const at = "2026-09-07T00:00:00.000Z";

const event = validateIseolHarnessEvent({
  version: 1,
  eventId: "event-1",
  identity,
  seq: 1,
  type: "RUN_STATE_CHANGED",
  state: "RUNNING",
  at,
  summary: "Builder started",
  evidenceIds: ["evidence-1"],
});
assert.equal(event.seq, 1);
assert.equal(event.state, "RUNNING");
assert.deepEqual(event.identity, identity);
const command = validateIseolHarnessControlCommand({
  version: 1,
  commandId: "command-1",
  identity,
  action: "pause",
  requestedAt: at,
  source: "discord:iseol",
});
assert.equal(command.action, "pause");
assert.equal(command.source, "discord:iseol");
assert.deepEqual(command.identity, identity);

for (const invalid of [
  { ...event, seq: 0 },
  { ...event, seq: -1 },
  { ...event, eventId: "bad/id" },
  { ...event, at: "not-a-time" },
  { ...event, type: "UNKNOWN_EVENT" },
  { ...event, state: "SLEEPING" },
  { ...event, summary: "line1\nline2" },
  { ...event, identity: { ...identity, runId: "run/escape" } },
  { ...event, evidenceIds: ["evidence-1", "evidence-1"] },
]) {
  assert.throws(() => validateIseolHarnessEvent(invalid));
}
for (const invalid of [
  { ...command, commandId: "" },
  { ...command, action: "force-kill" },
  { ...command, requestedAt: "yesterday" },
  { ...command, source: "discord\nbutton" },
  { ...command, identity: { ...identity, projectId: "bad/project" } },
]) {
  assert.throws(() => validateIseolHarnessControlCommand(invalid));
}

for (const action of ["pause", "resume", "cancel", "retry", "status"] as const) {
  assert.equal(validateIseolHarnessControlCommand({ ...command, action }).action, action);
}

for (const state of [
  "QUEUED", "PLANNING", "RUNNING", "TESTING", "REVIEWING", "DEPLOYING",
  "BLOCKED", "FAILED", "RECOVERING", "COMPLETE", "CANCELLED",
] as const) {
  assert.equal(validateIseolHarnessEvent({ ...event, state }).state, state);
}

console.log("PASS  Iseol Harness public protocol validation scenarios passed.");
