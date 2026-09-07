import * as assert from "node:assert/strict";

import {
  applyIseolProjectControl,
  mapIseolControlToBloomAction,
} from "./iseolExecutionControlAdapter";
import {
  clearProjectExecutionControls,
  getProjectExecutionControl,
  getProjectExecutionControlsSnapshot,
} from "./executionControl";
import type { ProjectState } from "./types";

const identity = {
  projectId: "jobdam",
  taskId: "TASK-52",
  runId: "run-102",
  agentId: "frontend-1",
};
const requestedAt = "2026-09-07T01:00:00.000Z";
const command = (action: "pause" | "resume" | "cancel" | "retry" | "status") => ({
  version: 1 as const,
  commandId: `command-${action}`,
  identity,
  action,
  requestedAt,
  source: "discord:iseol",
});
const project = {
  id: "jobdam",
  createdAt: "2026-09-07T00:00:00.000Z",
  taskRuns: [],
} as unknown as ProjectState;

clearProjectExecutionControls();
assert.equal(mapIseolControlToBloomAction(command("pause"), project), "pause");
assert.equal(mapIseolControlToBloomAction(command("resume"), project), "resume");
assert.equal(mapIseolControlToBloomAction(command("cancel"), project), "stop");
assert.equal(mapIseolControlToBloomAction(command("status"), project), "status");
assert.equal(mapIseolControlToBloomAction(command("retry"), project), "retry");

const paused = applyIseolProjectControl(command("pause"), project);
assert.equal(paused.status, "applied");
assert.equal(paused.control.state, "paused");
assert.equal(paused.reason, null);

const resumed = applyIseolProjectControl(command("resume"), project);
assert.equal(resumed.status, "applied");
assert.equal(resumed.control.state, "running");
const runningProject = {
  ...project,
  taskRuns: [{ status: "running" }] as ProjectState["taskRuns"],
};
const cancelled = applyIseolProjectControl(command("cancel"), runningProject);
assert.equal(cancelled.status, "applied");
assert.equal(cancelled.control.state, "stop-requested");

clearProjectExecutionControls();
const observedBefore = getProjectExecutionControlsSnapshot();
const observed = applyIseolProjectControl(command("status"), project);
const observedAfter = getProjectExecutionControlsSnapshot();
assert.equal(observed.status, "observed");
assert.equal(observed.control.state, "running");
assert.deepEqual(observedAfter, observedBefore);

const retry = applyIseolProjectControl(command("retry"), project);
assert.equal(retry.status, "deferred");
assert.match(retry.reason ?? "", /reconciliation|idempot/i);
assert.equal(retry.control.state, "running");
assert.throws(
  () => applyIseolProjectControl(
    { ...command("pause"), identity: { ...identity, projectId: "other-project" } },
    project,
  ),
  /project.*mismatch|mismatch.*project/i,
);

clearProjectExecutionControls();
console.log("PASS  Iseol Harness execution control adapter scenarios passed.");
