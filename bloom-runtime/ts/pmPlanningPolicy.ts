import type { HarnessPackBinding } from "./harnessPackBinding";
import { harnessPackPlanningContext } from "./harnessPackPlanPolicy";

export const MAX_PM_PLAN_ATTEMPTS = 2;
export const PM_PLAN_UNIQUENESS_CONTRACT =
  "Task IDs and taskSlug values must each be unique across the plan.";

const SEMANTIC_PM_ERROR_MARKERS = [
  "PM repository",
  "PM 계획",
  "PM Task DAG",
  "필수 구현 Agent role",
  "제품 마케팅/문서화 DAG",
  "Task ID",
  "taskSlug",
  "허용되지 않은 Agent role",
  "acceptance criteria",
  "dependency",
  "자기 자신",
  "Bloom Harness pack plan rejected:",
] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isSemanticPmPlanError(error: unknown): boolean {
  const message = errorMessage(error);
  return SEMANTIC_PM_ERROR_MARKERS.some((marker) => message.includes(marker));
}
export function buildPmPlanningRequest(
  request: string,
  binding: HarnessPackBinding,
  validationError = "",
): string {
  const sections = [
    request,
    `Bloom PM planning invariant:\n- ${PM_PLAN_UNIQUENESS_CONTRACT}`,
  ];
  const packContext = harnessPackPlanningContext(binding);
  if (packContext) {
    sections.push(`Bloom Harness pack policy (internal):\n${packContext}`);
  }
  if (validationError) {
    sections.push(
      "The previous PM plan failed Bloom semantic validation:\n"
      + `${validationError}\n`
      + "Return a corrected complete project plan. Preserve the original product requirements and review topology, fix the reported semantic violation, and return only schema-valid planning JSON.",
    );
  }
  return sections.join("\n\n");
}

export type RunPmPlanningWithRepairInput<T> = {
  request: string;
  binding: HarnessPackBinding;
  planOnce: (request: string, attempt: number) => Promise<T>;
  prepareAndValidate: (value: T) => T;
};
export async function runPmPlanningWithRepair<T>(
  input: RunPmPlanningWithRepairInput<T>,
): Promise<T> {
  let validationError = "";
  for (let attempt = 1; attempt <= MAX_PM_PLAN_ATTEMPTS; attempt += 1) {
    try {
      const request = buildPmPlanningRequest(
        input.request,
        input.binding,
        validationError,
      );
      const result = await input.planOnce(request, attempt);
      return input.prepareAndValidate(result);
    } catch (error) {
      if (attempt >= MAX_PM_PLAN_ATTEMPTS || !isSemanticPmPlanError(error)) {
        throw error;
      }
      validationError = errorMessage(error);
    }
  }
  throw new Error("PM planning repair exhausted unexpectedly.");
}
