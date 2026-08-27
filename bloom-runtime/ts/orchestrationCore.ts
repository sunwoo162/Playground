import { ensureBouquetAuthPlan } from "./bouquetAuth";
import { ensureMarketingDocumentationPlan } from "./dataMarketing";
import { validateProjectPlanReviewTopology } from "./planTopology";
import { ensureSpecialistAgentPlan } from "./specialistPlanning";
import type {
  ExecutableAgentRole,
  ProjectPlan,
  ProjectStatus,
  ProjectTaskRun,
} from "./types";

export const ORCHESTRATION_MAX_PARALLEL_TASKS = 2;

export type TaskRunSummary = {
  allDone: boolean;
  hasBlocked: boolean;
  hasRunning: boolean;
  pendingCount: number;
  readyCount: number;
  runningCount: number;
  blockedCount: number;
  doneCount: number;
};

export function prepareOrchestrationPlan(plan: ProjectPlan): ProjectPlan {
  const authPlan = ensureBouquetAuthPlan(plan);
  const specialistPlan = ensureSpecialistAgentPlan(authPlan);
  const prepared = ensureMarketingDocumentationPlan(specialistPlan);
  validateProjectPlanReviewTopology(prepared);
  return prepared;
}

export function refreshOrchestrationReadiness(
  plan: ProjectPlan | null,
  taskRuns: ProjectTaskRun[],
): ProjectTaskRun[] {
  if (!plan) return taskRuns;

  const completed = new Set(
    taskRuns.filter((run) => run.status === "done").map((run) => run.taskId),
  );
  const tasks = new Map(plan.tasks.map((task) => [task.id, task]));

  return taskRuns.map((run) => {
    if (run.status !== "pending") return run;
    const task = tasks.get(run.taskId);
    if (!task) return run;
    const ready = task.dependsOn.every((dependency) => completed.has(dependency));
    return ready ? { ...run, status: "ready" as const } : run;
  });
}

export function selectOrchestrationWave(
  taskRuns: ProjectTaskRun[],
  limit = ORCHESTRATION_MAX_PARALLEL_TASKS,
): ProjectTaskRun[] {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  const boundedLimit = Math.min(limit, ORCHESTRATION_MAX_PARALLEL_TASKS);

  const selected: ProjectTaskRun[] = [];
  const busyRoles = new Set<ExecutableAgentRole>(
    taskRuns
      .filter((run) => run.status === "running")
      .map((run) => run.role),
  );

  for (const run of taskRuns) {
    if (run.status !== "ready" || busyRoles.has(run.role)) continue;
    selected.push(run);
    busyRoles.add(run.role);
    if (selected.length >= boundedLimit) break;
  }

  return selected;
}

export function summarizeTaskRuns(taskRuns: ProjectTaskRun[]): TaskRunSummary {
  let pendingCount = 0;
  let readyCount = 0;
  let runningCount = 0;
  let blockedCount = 0;
  let doneCount = 0;

  for (const run of taskRuns) {
    switch (run.status) {
      case "pending":
        pendingCount += 1;
        break;
      case "ready":
        readyCount += 1;
        break;
      case "running":
        runningCount += 1;
        break;
      case "blocked":
        blockedCount += 1;
        break;
      case "done":
        doneCount += 1;
        break;
    }
  }

  return {
    allDone: taskRuns.length > 0 && doneCount === taskRuns.length,
    hasBlocked: blockedCount > 0,
    hasRunning: runningCount > 0,
    pendingCount,
    readyCount,
    runningCount,
    blockedCount,
    doneCount,
  };
}

export function projectStatusForActiveRoles(
  roles: ExecutableAgentRole[],
): ProjectStatus {
  const priority: Array<{ roles: ExecutableAgentRole[]; status: ProjectStatus }> = [
    { roles: ["process-evaluator"], status: "evaluation" },
    { roles: ["user-a", "user-b"], status: "user-test" },
    { roles: ["qa"], status: "qa" },
    { roles: ["code-review", "reviewer", "documentation", "data-marketing"], status: "review" },
    { roles: ["frontend", "backend", "database", "security", "devops", "accessibility", "debug-router"], status: "development" },
    { roles: ["design-system", "designer"], status: "design" },
    { roles: ["idea"], status: "planning" },
  ];

  return priority.find((group) => roles.some((role) => group.roles.includes(role)))?.status
    ?? "development";
}
