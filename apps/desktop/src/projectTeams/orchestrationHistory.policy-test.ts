import {
  isDurableOrchestrationSnapshot,
  shouldRestoreDurableProjectState,
} from "./orchestrationHistoryPolicy";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const durable = {
  schemaVersion: 1 as const,
  projectTeamsState: {
    schemaVersion: 1 as const,
    teams: [{ id: "rose" }],
    projects: [{ id: "PROJECT-001" }],
  },
  executionControls: {},
};

assert(isDurableOrchestrationSnapshot(durable), "valid durable snapshot should be accepted");
assert(
  shouldRestoreDurableProjectState({ projects: [] }, durable),
  "empty local state should restore a durable project snapshot",
);
assert(
  !shouldRestoreDurableProjectState({ projects: [{ id: "LOCAL" }] }, durable),
  "existing local project state should not be overwritten by disk recovery",
);
assert(
  !isDurableOrchestrationSnapshot({ ...durable, schemaVersion: 2 }),
  "unsupported durable snapshot schema should be rejected",
);
assert(
  !isDurableOrchestrationSnapshot({ ...durable, executionControls: [] }),
  "execution control snapshot must be an object",
);

console.log("orchestrationHistory.policy-test: PASS");
