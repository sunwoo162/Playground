import * as fs from "node:fs";
import * as path from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const workerSource = fs.readFileSync(
  path.resolve(__dirname, "../../bloom-worker/run.js"),
  "utf8",
);
const pmPolicySource = fs.readFileSync(
  path.resolve(__dirname, "../../bloom-runtime/ts/pmPlanningPolicy.ts"),
  "utf8",
);
const runtimeSource = fs.readFileSync(
  path.resolve(__dirname, "../../bloom-runtime/src/project_runtime.rs"),
  "utf8",
);
const desktopRuntimeSource = fs.readFileSync(
  path.resolve(__dirname, "../../bloom-runtime/ts/runtime.ts"),
  "utf8",
);

assert(pmPolicySource.includes("Task IDs and taskSlug values must each be unique across the plan."), "shared PM request must require unique task IDs/slugs");
assert(pmPolicySource.includes("MAX_PM_PLAN_ATTEMPTS = 2"), "shared PM policy must allow exactly one repair attempt");
assert(pmPolicySource.includes("The previous PM plan failed Bloom semantic validation"), "shared PM repair must feed semantic failure back to PM");
assert(!workerSource.includes("const MAX_PM_PLAN_ATTEMPTS = 2;"), "worker must not duplicate PM retry count");
assert(!workerSource.includes("function isSemanticPmPlanError"), "worker must not duplicate PM semantic classifier");
assert(!workerSource.includes("function buildPmPlanningRequest"), "worker must not duplicate PM request builder");
assert(workerSource.includes("runPmPlanningWithRepair"), "worker must use shared PM repair policy");
assert(workerSource.includes("assertHarnessPackPlan(input.harnessPackBinding, result.plan)"), "worker must validate PM plans against immutable pack");
const workerRawPackIndex = workerSource.indexOf("assertHarnessPackPlan(input.harnessPackBinding, result.plan)");
const workerPrepareIndex = workerSource.indexOf("result.plan = prepareOrchestrationPlan(result.plan)");
const workerPreparedPackIndex = workerSource.lastIndexOf("assertHarnessPackPlan(input.harnessPackBinding, result.plan)");
assert(workerRawPackIndex >= 0 && workerRawPackIndex < workerPrepareIndex && workerPrepareIndex < workerPreparedPackIndex, "worker PM repair must validate raw pack -> prepare -> prepared pack");
assert(
  workerSource.includes("planProjectWithRepair"),
  "production Runtime bridge must route PM planning through the repair wrapper",
);
assert(
  workerSource.includes("prepareOrchestrationPlan"),
  "production PM repair wrapper must run the final orchestration-plan topology preparation before accepting a plan",
);
assert(
  pmPolicySource.includes("PM Task DAG"),
  "review-topology validation failures must be classified as repairable PM semantic errors",
);
assert(
  workerSource.includes("validateLiveE2EImplementationPlan"),
  "production PM repair wrapper must validate required Live E2E implementation roles",
);
assert(
  pmPolicySource.includes("필수 구현 Agent role"),
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
  !desktopRuntimeSource.includes('"start_project_runtime"'),
  "desktop runtime must not use the combined PM+repository side-effect command",
);
assert(
  desktopRuntimeSource.includes('"plan_project_runtime"'),
  "desktop runtime must use plan-only PM execution",
);
assert(
  desktopRuntimeSource.includes("runPmPlanningWithRepair"),
  "desktop runtime must use the shared PM repair policy",
);
assert(
  desktopRuntimeSource.includes("assertHarnessPackPlan(binding, value.plan)"),
  "desktop runtime must validate the raw PM plan against the bound pack",
);
assert(
  desktopRuntimeSource.includes("assertHarnessPackPlan(binding, plan)"),
  "desktop runtime must validate the prepared PM plan against the bound pack",
);
assert(
  desktopRuntimeSource.includes("const bindingResult = bindProjectHarnessPack"),
  "desktop runtime must persist the Harness pack binding before PM planning",
);
assert(
  desktopRuntimeSource.includes("const preflight = await checkProjectRuntime(input.organization)"),
  "desktop runtime must preserve Runtime preflight before PM planning",
);
const bindIndex = desktopRuntimeSource.indexOf("const bindingResult = bindProjectHarnessPack");
const preflightIndex = desktopRuntimeSource.indexOf("const preflight = await checkProjectRuntime(input.organization)");
const planInvokeIndex = desktopRuntimeSource.indexOf('"plan_project_runtime"');
const rawPackIndex = desktopRuntimeSource.indexOf("assertHarnessPackPlan(binding, value.plan)");
const prepareIndex = desktopRuntimeSource.indexOf("const plan = prepareOrchestrationPlan(value.plan)");
const preparedPackIndex = desktopRuntimeSource.indexOf("assertHarnessPackPlan(binding, plan)");
const bootstrapIndex = desktopRuntimeSource.indexOf("await bootstrapProjectRepository");
assert(
  bindIndex < preflightIndex && preflightIndex < planInvokeIndex && planInvokeIndex < rawPackIndex
    && rawPackIndex < prepareIndex && prepareIndex < preparedPackIndex && preparedPackIndex < bootstrapIndex,
  "desktop PM side effects must follow binding -> preflight -> plan -> raw pack -> prepare -> prepared pack -> bootstrap",
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
