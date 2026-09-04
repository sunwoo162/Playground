import {
  validateHarnessPackBinding,
  type HarnessPackBinding,
} from "./harnessPackBinding";
import { BUG_FIX_PACK } from "./harnessPackRegistry";
import {
  REPOSITORY_WRITER_ROLES,
  taskTransitivelyDependsOn,
} from "./planTopology";
import type { ProjectPlan, ProjectTaskPlan } from "./types";

export type HarnessPackPlanEvaluation = {
  ready: boolean;
  reasons: string[];
};

const NON_FIX_WRITER_ROLES = new Set([
  "debug-router",
  "data-marketing",
  "documentation",
]);

function downstreamByRole(
  plan: ProjectPlan,
  sourceTaskId: string,
  role: ProjectTaskPlan["role"],
) {
  return plan.tasks.filter(
    (task) => task.role === role
      && taskTransitivelyDependsOn(plan, task.id, sourceTaskId),
  );
}
function hasReviewQaChain(plan: ProjectPlan, writerTaskId: string) {
  const codeReviews = downstreamByRole(plan, writerTaskId, "code-review");
  for (const codeReview of codeReviews) {
    const reviewers = downstreamByRole(plan, codeReview.id, "reviewer");
    for (const reviewer of reviewers) {
      if (downstreamByRole(plan, reviewer.id, "qa").length > 0) {
        return true;
      }
    }
  }
  return false;
}

function evaluateBugFixPlan(
  binding: HarnessPackBinding,
  plan: ProjectPlan,
): HarnessPackPlanEvaluation {
  const pack = binding.pack;
  if (!pack) {
    return { ready: false, reasons: ["bug-fix binding is missing its pack snapshot."] };
  }

  const reasons: string[] = [];
  const roles = new Set(plan.tasks.map((task) => task.role));
  for (const role of pack.requiredRoles) {
    if (!roles.has(role)) {
      reasons.push(`bug-fix requires PM role ${role}.`);
    }
  }
  const debugTasks = plan.tasks.filter((task) => task.role === "debug-router");
  const implementationWriters = plan.tasks.filter((task) =>
    REPOSITORY_WRITER_ROLES.includes(task.role)
      && !NON_FIX_WRITER_ROLES.has(task.role)
      && debugTasks.some((debug) =>
        taskTransitivelyDependsOn(plan, task.id, debug.id),
      ),
  );

  if (implementationWriters.length === 0) {
    reasons.push(
      "bug-fix fix stage requires a repository implementation writer downstream of debug-router.",
    );
  } else if (!implementationWriters.some((writer) => hasReviewQaChain(plan, writer.id))) {
    reasons.push(
      "bug-fix fix writer requires downstream code-review -> reviewer -> qa validation.",
    );
  }

  return { ready: reasons.length === 0, reasons };
}

export function harnessPackPlanningContext(binding: HarnessPackBinding): string {
  const validated = validateHarnessPackBinding(binding);
  if (validated.status !== "bound" || !validated.pack) return "";
  return [
    `[Bloom Harness pack ${validated.pack.id}@${validated.pack.version}]`,
    `Required PM roles: ${validated.pack.requiredRoles.join(", ")}`,
    `Required workflow stages: ${validated.pack.stages.join(" -> ")}`,
    `Required project evidence: ${validated.pack.requiredEvidence.join(", ")}`,
    "PM must explicitly plan these responsibilities. Runtime will validate the raw PM plan before deterministic task injection.",
  ].join("\n");
}

export function evaluateHarnessPackPlan(
  binding: HarnessPackBinding,
  plan: ProjectPlan,
): HarnessPackPlanEvaluation {
  const validated = validateHarnessPackBinding(binding);
  if (validated.status === "unbound") {
    return { ready: true, reasons: [] };
  }
  if (validated.status === "blocked") {
    return { ready: false, reasons: [validated.reason] };
  }
  if (validated.pack?.id !== BUG_FIX_PACK.id) {
    return {
      ready: false,
      reasons: [`Unsupported live Bloom Harness pack plan policy: ${validated.pack?.id ?? "missing"}.`],
    };
  }
  return evaluateBugFixPlan(validated, plan);
}

export function assertHarnessPackPlan(
  binding: HarnessPackBinding,
  plan: ProjectPlan,
): ProjectPlan {
  const evaluation = evaluateHarnessPackPlan(binding, plan);
  if (!evaluation.ready) {
    throw new Error(
      `Bloom Harness pack plan rejected: ${evaluation.reasons.join(" ")}`,
    );
  }
  return plan;
}
