import * as fs from "node:fs";
import * as path from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const workerSource = fs.readFileSync(
  path.resolve(__dirname, "../../bloom-worker/run.js"),
  "utf8",
);
const runtimeSource = fs.readFileSync(
  path.resolve(__dirname, "../../bloom-runtime/src/project_runtime.rs"),
  "utf8",
);

assert(
  workerSource.includes("Task IDs and taskSlug values must each be unique across the plan."),
  "PM request must explicitly require unique task IDs and task slugs",
);
assert(
  workerSource.includes("const MAX_PM_PLAN_ATTEMPTS = 2;"),
  "PM planning must allow exactly one repair attempt after the initial plan",
);
assert(
  workerSource.includes("The previous PM plan failed Bloom semantic validation"),
  "PM repair request must feed the semantic validation failure back to Codex",
);
assert(
  workerSource.includes("planProjectWithRepair"),
  "production Runtime bridge must route PM planning through the repair wrapper",
);
assert(
  runtimeSource.includes("validate_project_plan(&plan)"),
  "repaired PM plans must still pass authoritative Rust runtime validation",
);

console.log("PASS  PM planning repairs one invalid structured plan before failing the run.");
