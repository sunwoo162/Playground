import {
  validateHarnessPackBinding,
  type HarnessPackBinding,
} from "./harnessPackBinding";
import {
  BUG_FIX_PACK, CODE_REVIEW_PACK, DEPLOYMENT_PACK, DOCUMENTATION_PACK,
  FEATURE_DEVELOPMENT_PACK,
} from "./harnessPackRegistry";
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

function requiredRoleReasons(binding: HarnessPackBinding, plan: ProjectPlan): string[] {
  if (!binding.pack) return ["Harness pack binding is missing its pack snapshot."];
  const roles = new Set(plan.tasks.map((task) => task.role));
  return binding.pack.requiredRoles
    .filter((role) => !roles.has(role))
    .map((role) => `${binding.pack?.id ?? "pack"} requires PM role ${role}.`);
}

function hasDownstreamRole(
  plan: ProjectPlan,
  sourceTaskId: string,
  role: ProjectTaskPlan["role"],
): boolean {
  return downstreamByRole(plan, sourceTaskId, role).length > 0;
}

function evaluateFeaturePlan(binding: HarnessPackBinding, plan: ProjectPlan): HarnessPackPlanEvaluation {
  const reasons = requiredRoleReasons(binding, plan);
  const writers = plan.tasks.filter((task) =>
    REPOSITORY_WRITER_ROLES.includes(task.role) && !NON_FIX_WRITER_ROLES.has(task.role),
  );
  if (writers.length === 0) {
    reasons.push("feature-development requires a repository implementation writer.");
  } else if (!writers.some((writer) => hasReviewQaChain(plan, writer.id))) {
    reasons.push("feature-development writer requires downstream code-review -> reviewer -> qa validation.");
  }
  return { ready: reasons.length === 0, reasons };
}

function evaluateLinearRoleChain(
  binding: HarnessPackBinding,
  plan: ProjectPlan,
  sourceRole: ProjectTaskPlan["role"],
  targetRole: ProjectTaskPlan["role"],
): HarnessPackPlanEvaluation {
  const reasons = requiredRoleReasons(binding, plan);
  const sources = plan.tasks.filter((task) => task.role === sourceRole);
  if (sources.length > 0 && !sources.some((task) => hasDownstreamRole(plan, task.id, targetRole))) {
    reasons.push(`${binding.pack?.id ?? "pack"} requires downstream ${sourceRole} -> ${targetRole} topology.`);
  }
  return { ready: reasons.length === 0, reasons };
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
  switch (validated.pack?.id) {
    case BUG_FIX_PACK.id:
      return evaluateBugFixPlan(validated, plan);
    case FEATURE_DEVELOPMENT_PACK.id:
      return evaluateFeaturePlan(validated, plan);
    case CODE_REVIEW_PACK.id:
      return evaluateLinearRoleChain(validated, plan, "code-review", "reviewer");
    case DOCUMENTATION_PACK.id:
      return evaluateLinearRoleChain(validated, plan, "documentation", "reviewer");
    case DEPLOYMENT_PACK.id:
      return evaluateLinearRoleChain(validated, plan, "devops", "qa");
    default:
      return {
        ready: false,
        reasons: [`Unsupported live Bloom Harness pack plan policy: ${validated.pack?.id ?? "missing"}.`],
      };
  }
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
