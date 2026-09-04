import * as assert from "node:assert/strict";

import { resolveHarnessPackBinding } from "./harnessPackBinding";
import {
  assertHarnessPackPlan,
  evaluateHarnessPackPlan,
  harnessPackPlanningContext,
} from "./harnessPackPlanPolicy";
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

function plan(tasks: ProjectTaskPlan[]): ProjectPlan {
  return {
    projectName: "Pack",
    repositoryName: "pack",
    productSummary: "pack",
    architectureSummary: "pack",
    needsAuth: false,
    technologyDecisions: [],
    tasks,
  };
}

const binding = resolveHarnessPackBinding({ intent: "Fix login crash" });
const governanceOnly = plan([
  task("DBG", "debug-router", []),
  task("MKT", "data-marketing", ["DBG"]),
  task("DOC", "documentation", ["MKT"]),
  task("CR", "code-review", ["DOC"]),
  task("REV", "reviewer", ["CR"]),
  task("QA", "qa", ["REV"]),
]);
assert.equal(evaluateHarnessPackPlan(binding, governanceOnly).ready, false);

const independentFix = plan([
  task("DBG", "debug-router", []),
  task("FE", "frontend", []),
  task("CR", "code-review", ["FE"]),
  task("REV", "reviewer", ["CR"]),
  task("QA", "qa", ["REV"]),
]);
assert.throws(
  () => assertHarnessPackPlan(binding, independentFix),
  /downstream|fix/i,
);
const valid = plan([
  task("DBG", "debug-router", []),
  task("FE", "frontend", ["DBG"]),
  task("CR", "code-review", ["FE"]),
  task("REV", "reviewer", ["CR"]),
  task("QA", "qa", ["REV"]),
]);
assert.equal(assertHarnessPackPlan(binding, valid), valid);
assert.match(harnessPackPlanningContext(binding), /bug-fix/);

const unbound = resolveHarnessPackBinding({ intent: "Add profile" });
assert.equal(harnessPackPlanningContext(unbound), "");
assert.equal(evaluateHarnessPackPlan(unbound, governanceOnly).ready, true);

const blocked = resolveHarnessPackBinding({ intent: "x", explicitPack: "unknown" });
const blockedGate = evaluateHarnessPackPlan(blocked, valid);
assert.equal(blockedGate.ready, false);
assert.match(blockedGate.reasons.join(" "), /unknown/i);

console.log("PASS  Bloom Harness pack plan policy scenarios passed.");
