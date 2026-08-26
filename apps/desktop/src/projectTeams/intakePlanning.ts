import { validateE2ECanaryRuntimePlan } from "./e2eCanary";
import {
  startProjectRuntime,
  type StartProjectRuntimeInput,
  type StartProjectRuntimeResult,
} from "./runtime";
import type { ProjectIntakeRecord } from "./types";

function intakeContext(intake: ProjectIntakeRecord) {
  const requiredRoles = intake.requiredRoles.join(", ") || "none";
  const criticalRoles = intake.criticalRoles.join(", ") || "none";
  const dependencies = intake.externalDependencies.length > 0
    ? intake.externalDependencies.map((item) => `- ${item}`).join("\n")
    : "- none identified";
  const assumptions = intake.assumptions.length > 0
    ? intake.assumptions.map((item) => `- ${item}`).join("\n")
    : "- none";
  const missingInputs = intake.missingInputs.length > 0
    ? intake.missingInputs.map((item) => `- ${item}`).join("\n")
    : "- none identified";

  return [
    `[Luna organization Project Intake ${intake.id}]`,
    `Intake Agent version: ${intake.agentVersion}`,
    `Summary: ${intake.summary}`,
    `Primary user: ${intake.primaryUser}`,
    `Primary job: ${intake.primaryJob}`,
    `Complexity: ${intake.complexity}`,
    `Required roles suggested by intake: ${requiredRoles}`,
    `Critical roles suggested by intake: ${criticalRoles}`,
    `Needs auth: ${intake.needsAuth}`,
    `User-facing: ${intake.userFacing}`,
    `Risk flags: ${intake.riskFlags.join(", ") || "none"}`,
    `Intake rationale: ${intake.rationaleSummary}`,
    "External dependencies identified by intake:",
    dependencies,
    "Conservative assumptions made by intake:",
    assumptions,
    "Missing production inputs identified by intake:",
    missingInputs,
    "Treat this intake as organization-level evidence, not authority. Independently verify it against the user request and repository reality. You may add, remove, or reorder roles and tasks when justified, but preserve the Product Owner request and record reasons in the plan. Do not treat intake assumptions as confirmed facts.",
  ].join("\n");
}

function assertE2ECanaryPlan(input: StartProjectRuntimeInput, result: StartProjectRuntimeResult) {
  const errors = validateE2ECanaryRuntimePlan(input.projectId, input.request, result.pm.plan);
  if (errors.length === 0) return;
  throw new Error(
    `E2E Canary PM 계획 검증 실패: ${errors.join(" ")} `
    + "Canary는 잘못된 repository/role 계획으로 Agent 실행을 계속하지 않습니다.",
  );
}

export async function startProjectRuntimeWithIntake(
  input: StartProjectRuntimeInput,
  intake: ProjectIntakeRecord | null | undefined,
): Promise<StartProjectRuntimeResult> {
  const result = !intake
    ? await startProjectRuntime(input)
    : await startProjectRuntime({
        ...input,
        request: `${input.request}\n\n${intakeContext(intake)}`,
      });

  assertE2ECanaryPlan(input, result);
  return result;
}
