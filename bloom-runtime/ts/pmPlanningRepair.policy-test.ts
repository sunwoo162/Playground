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
  workerSource.includes("data-marketing -> documentation -> code-review -> reviewer -> qa"),
  "PM request must explicitly state the mandatory marketing review dependency chain",
);
assert(
  workerSource.includes('"after" means a transitive dependsOn path, not task array order'),
  "PM request must define governance ordering as a dependency path instead of array order",
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
  workerSource.includes("prepareOrchestrationPlan"),
  "production PM repair wrapper must run the final orchestration-plan topology preparation before accepting a plan",
);
assert(
  workerSource.includes("PM Task DAG"),
  "review-topology validation failures must be classified as repairable PM semantic errors",
);
assert(
  workerSource.includes("validateLiveE2EImplementationPlan"),
  "production PM repair wrapper must validate required Live E2E implementation roles",
);
assert(
  workerSource.includes("필수 구현 Agent role"),
  "missing Live E2E implementation roles must be classified as a repairable PM semantic error",
);
assert(
  workerSource.includes("validateLiveE2EImplementationPlan(input.request, result.plan);"),
  "Live E2E implementation-role validation must run inside the PM repair retry boundary",
);
assert(
  workerSource.includes("result.plan = enforceLiveE2ERepositoryName(input.request, result.plan);"),
  "Live E2E repository identity must be deterministically enforced before strict validation",
);
assert(
  workerSource.indexOf("result.plan = enforceLiveE2ERepositoryName(input.request, result.plan);") < workerSource.indexOf("validateLiveE2EImplementationPlan(input.request, result.plan);"),
  "Live E2E repository enforcement must run before strict validation so repo identity does not consume PM repair budget",
);
assert(
  workerSource.includes("result.plan = prepareOrchestrationPlan(result.plan);"),
  "PM repair wrapper must validate the prepared review topology inside its retry boundary",
);
assert(
  runtimeSource.includes("normalize_task_slug_collisions(&mut plan);"),
  "PM runtime must deterministically disambiguate duplicate task slugs before strict validation",
);
assert(
  runtimeSource.indexOf("normalize_task_slug_collisions(&mut plan);") < runtimeSource.indexOf("validate_project_plan(&plan)?;"),
  "task slug collision normalization must happen before authoritative Rust plan validation",
);
assert(
  runtimeSource.includes("validate_project_plan(&plan)"),
  "repaired PM plans must still pass authoritative Rust runtime validation",
);

console.log("PASS  PM planning repairs structured, review-topology, and Live E2E implementation-role semantic failures before failing the run.");
