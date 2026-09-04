import * as assert from "node:assert/strict";

import { resolveHarnessPackBinding } from "./harnessPackBinding";
import { assertHarnessPackPlan } from "./harnessPackPlanPolicy";
import { prepareOrchestrationPlan } from "./orchestrationCore";
import {
  buildPmPlanningRequest,
  MAX_PM_PLAN_ATTEMPTS,
  runPmPlanningWithRepair,
} from "./pmPlanningPolicy";
import type { ProjectPlan, ProjectTaskPlan } from "./types";

function task(
  id: string,
  role: ProjectTaskPlan["role"],
  dependsOn: string[],
): ProjectTaskPlan {
  return {
    id,
    title: id,
    role,
    taskSlug: id.toLowerCase(),
    summary: id,
    dependsOn,
    acceptanceCriteria: ["done"],
  };
}
type PmResult = {
  plan: ProjectPlan;
  sessionId: string;
  eventsPath: string;
  outputPath: string;
};

function pm(tasks: ProjectTaskPlan[]): PmResult {
  return {
    plan: {
      projectName: "Bug",
      repositoryName: "bug",
      productSummary: "bug",
      architectureSummary: "bug",
      needsAuth: false,
      technologyDecisions: [],
      tasks,
    } satisfies ProjectPlan,
    sessionId: "pm-session",
    eventsPath: "/tmp/pm.jsonl",
    outputPath: "/tmp/pm.json",
  };
}

const binding = resolveHarnessPackBinding({ intent: "로그인 버그 고쳐" });
const invalid = pm([
  task("DBG", "debug-router", []),
  task("CR", "code-review", ["DBG"]),
  task("REV", "reviewer", ["CR"]),
  task("QA", "qa", ["REV"]),
]);
const valid = pm([
  task("DBG", "debug-router", []),
  task("FE", "frontend", ["DBG"]),
  task("CR", "code-review", ["DBG", "FE"]),
  task("REV", "reviewer", ["CR"]),
  task("QA", "qa", ["REV"]),
]);

async function run() {
  const capturedRequests: string[] = [];
  let calls = 0;
  const repaired = await runPmPlanningWithRepair({
    request: "로그인 버그 고쳐",
    binding,
    async planOnce(request) {
      calls += 1;
      capturedRequests.push(request);
      return calls === 1 ? invalid : valid;
    },
    prepareAndValidate(value) {
      assertHarnessPackPlan(binding, value.plan);
      const plan = prepareOrchestrationPlan(value.plan);
      assertHarnessPackPlan(binding, plan);
      return { ...value, plan };
    },
  });
  assert.equal(repaired.plan.repositoryName, "bug");
  assert.equal(calls, MAX_PM_PLAN_ATTEMPTS);
  assert.match(capturedRequests[0] ?? "", /bug-fix/);
  assert.match(capturedRequests[1] ?? "", /previous PM plan failed/i);

  let networkCalls = 0;
  await assert.rejects(
    () => runPmPlanningWithRepair({
      request: "로그인 버그 고쳐",
      binding,
      async planOnce() {
        networkCalls += 1;
        throw new Error("network unavailable");
      },
      prepareAndValidate(value: never) { return value; },
    }),
    /network unavailable/,
  );
  assert.equal(networkCalls, 1);

  const unbound = resolveHarnessPackBinding({ intent: "Add profile page" });
  const unboundRequest = buildPmPlanningRequest("Add profile page", unbound);
  assert.doesNotMatch(unboundRequest, /Bloom Harness pack/);
  assert.match(unboundRequest, /Task IDs and taskSlug values must each be unique/);

  console.log("PM planning policy tests passed");
}

void run();
