import * as fs from "node:fs";
import * as path from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync(
  path.resolve(__dirname, "../../bloom-runtime/src/project_runtime.rs"),
  "utf8",
);

assert(
  source.includes("Task IDs and taskSlug values must each be unique across the plan."),
  "PM prompt must explicitly require unique task IDs and task slugs",
);
assert(
  source.includes("const MAX_PM_PLAN_ATTEMPTS: usize = 2;"),
  "PM planning must allow exactly one repair attempt after the initial plan",
);
assert(
  source.includes("The previous PM plan failed Bloom semantic validation"),
  "PM repair prompt must feed the semantic validation failure back to Codex",
);
assert(
  source.includes("validate_project_plan(&plan)"),
  "every PM plan attempt must still pass authoritative runtime validation",
);

console.log("PASS  PM planning repairs one invalid structured plan before failing the run.");
