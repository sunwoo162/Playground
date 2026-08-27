import {
  transitionProjectExecutionControl,
  type ProjectExecutionControlRecord,
} from "./executionControl";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function control(state: ProjectExecutionControlRecord["state"]): ProjectExecutionControlRecord {
  return {
    projectId: "PROJECT-CONTROL-FIXTURE",
    state,
    requestedAt: null,
    updatedAt: "2026-08-26T00:00:00.000Z",
  };
}

const pauseRequested = transitionProjectExecutionControl(
  control("running"),
  "pause",
  true,
  "2026-08-26T00:01:00.000Z",
);
assert(pauseRequested.state === "pause-requested", "running wave should become pause-requested");

const stillWaiting = transitionProjectExecutionControl(
  pauseRequested,
  "settle",
  true,
  "2026-08-26T00:02:00.000Z",
);
assert(stillWaiting.state === "pause-requested", "pause must wait for active wave to finish");

const paused = transitionProjectExecutionControl(
  stillWaiting,
  "settle",
  false,
  "2026-08-26T00:03:00.000Z",
);
assert(paused.state === "paused", "pause request should settle after active wave finishes");

const resumed = transitionProjectExecutionControl(
  paused,
  "resume",
  false,
  "2026-08-26T00:04:00.000Z",
);
assert(resumed.state === "running", "paused execution should resume");
assert(resumed.requestedAt === null, "resume should clear the control request timestamp");

const immediatePause = transitionProjectExecutionControl(
  control("running"),
  "pause",
  false,
  "2026-08-26T00:05:00.000Z",
);
assert(immediatePause.state === "paused", "idle execution should pause immediately");

const stopRequested = transitionProjectExecutionControl(
  control("running"),
  "stop",
  true,
  "2026-08-26T00:06:00.000Z",
);
assert(stopRequested.state === "stop-requested", "running wave should become stop-requested");

const stopped = transitionProjectExecutionControl(
  stopRequested,
  "settle",
  false,
  "2026-08-26T00:07:00.000Z",
);
assert(stopped.state === "stopped", "stop request should settle after active wave finishes");

const cannotResumeStopped = transitionProjectExecutionControl(
  stopped,
  "resume",
  false,
  "2026-08-26T00:08:00.000Z",
);
assert(cannotResumeStopped.state === "stopped", "stopped execution must remain terminal");

const cancelPendingPause = transitionProjectExecutionControl(
  pauseRequested,
  "resume",
  true,
  "2026-08-26T00:09:00.000Z",
);
assert(cancelPendingPause.state === "running", "resume should cancel a pending cooperative pause");

console.log("executionControl.policy-test: PASS");
