import * as assert from "node:assert/strict";

import {
  adaptAgentDecision,
  adaptFailureRoute,
  adaptProjectReplan,
} from "./harnessHistoryAdapter";
import type {
  AgentDecision,
  FailureRouteRecord,
  ProjectReplanRecord,
} from "./types";

const identity = {
  projectId: "PROJECT-1",
  taskId: "TASK-1",
  runId: "TASK-1.attempt-2",
  agentId: "frontend-1",
};

const decision: AgentDecision = {
  id: "DECISION-1",
  projectId: "PROJECT-1",
  agentId: "frontend-1",
  action: "fix refresh lifecycle",
  rationaleSummary: "fix the auth source-of-truth race",
  evidence: ["refresh/reset overlap reproduced"],
  alternativesConsidered: ["block redirect", "extend token expiry"],
  sourceAgentIds: ["reviewer-1"],
  createdAt: "2026-09-07T00:00:00.000Z",
};
const adaptedDecision = adaptAgentDecision(decision, identity);
assert.equal(adaptedDecision.id, decision.id);
assert.deepEqual(adaptedDecision.identity, identity);
assert.equal(adaptedDecision.decision, decision.action);
assert.equal(adaptedDecision.reason, decision.rationaleSummary);
assert.deepEqual(adaptedDecision.options, decision.alternativesConsidered);
assert.deepEqual(adaptedDecision.observations, decision.evidence);

assert.throws(
  () => adaptAgentDecision(decision, { ...identity, projectId: "PROJECT-2" }),
  /project.*mismatch|mismatch.*project/i,
);

const route: FailureRouteRecord = {
  id: "ROUTE-1",
  failedTaskId: "TASK-1",
  failedRole: "frontend",
  routeAttempt: 2,
  routerAgentId: "debug-router-1",
  routerSessionId: "session-1",
  eventsPath: ".bloom/agents/debug-router-1/events.jsonl",
  outputPath: ".bloom/agents/debug-router-1/output.json",
  createdAt: "2026-09-07T00:01:00.000Z",
  route: "retry-owner",
  failureType: "test",
  severity: "high",
  ownerTaskId: "TASK-1",
  ownerRole: "frontend",
  summary: "E2E failed after first fix",
  rationaleSummary: "retry owner with corrected lifecycle",
  evidence: ["session E2E failed"],
  recommendedAction: "replan and retry owner",
};
const adaptedRoute = adaptFailureRoute(route, identity);
assert.equal(adaptedRoute.failure.id, "failure:ROUTE-1");
assert.equal(adaptedRoute.failure.failureType, "test");
assert.equal(adaptedRoute.failure.severity, "high");
assert.equal(adaptedRoute.recovery.id, "recovery:ROUTE-1");
assert.equal(adaptedRoute.recovery.failureId, adaptedRoute.failure.id);
assert.equal(adaptedRoute.recovery.actorAgentId, "debug-router-1");
assert.equal(adaptedRoute.recovery.action, route.recommendedAction);
assert.throws(
  () => adaptFailureRoute(route, { ...identity, taskId: "TASK-OTHER" }),
  /task.*mismatch|mismatch.*task/i,
);
const replan: ProjectReplanRecord = {
  id: "REPLAN-1",
  triggerRouteId: "ROUTE-1",
  replanAttempt: 1,
  summary: "reopen login task and retry",
  rationaleSummary: "first fix did not remove race",
  retiredTaskIds: [],
  reopenedTaskIds: ["TASK-1"],
  addedTaskIds: ["TASK-1-VERIFY"],
  pmSessionId: "pm-session-1",
  eventsPath: ".bloom/agents/pm/events.jsonl",
  outputPath: ".bloom/agents/pm/output.json",
  createdAt: "2026-09-07T00:02:00.000Z",
};
const adaptedReplan = adaptProjectReplan(replan, identity, adaptedRoute.failure.id);
assert.equal(adaptedReplan.id, "recovery:REPLAN-1");
assert.equal(adaptedReplan.failureId, adaptedRoute.failure.id);
assert.equal(adaptedReplan.actorAgentId, null);
assert.match(adaptedReplan.action, /reopen login task and retry/i);
assert.match(adaptedReplan.reason, /first fix did not remove race/i);
assert.equal(adaptedReplan.status, "succeeded");

console.log("PASS  Harness Bloom history adapter scenarios passed.");
