import { assignTaskRunsToAgentPool } from "./agentPool";
import { ensureBouquetAuthPlan } from "./bouquetAuth";
import { ensureMarketingDocumentationPlan } from "./dataMarketing";
import { validateProjectPlanReviewTopology } from "./planTopology";
import { routeSpecialistAgentTasks } from "./specialistRouting";
import type {
  ExecutableAgentRole,
  ProjectPlan,
  ProjectStatus,
  ProjectTaskRun,
} from "./types";

export const ORCHESTRATION_MAX_PARALLEL_TASKS = 6;
export type OrchestrationConcurrencyTarget = 2 | 4 | 6;

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

type DagPriority = {
  unlockCount: number;
  criticalPathLength: number;
  downstreamCount: number;
  sourceIndex: number;
};

export function prepareOrchestrationPlan(plan: ProjectPlan): ProjectPlan {
  const authPlan = ensureBouquetAuthPlan(plan);
  const specialistPlan = routeSpecialistAgentTasks(authPlan);
  const prepared = ensureMarketingDocumentationPlan(specialistPlan);
  validateProjectPlanReviewTopology(prepared);
  return prepared;
}

export function refreshOrchestrationReadiness(
  plan: ProjectPlan | null,
  taskRuns: ProjectTaskRun[],
): ProjectTaskRun[] {
  if (!plan) return taskRuns;

  const pooledRuns = assignTaskRunsToAgentPool(plan, taskRuns);
  const completed = new Set(
    pooledRuns.filter((run) => run.status === "done").map((run) => run.taskId),
  );
  const tasks = new Map(plan.tasks.map((task) => [task.id, task]));

  return pooledRuns.map((run) => {
    if (run.status !== "pending") return run;
    const task = tasks.get(run.taskId);
    if (!task) return run;
    const ready = task.dependsOn.every((dependency) => completed.has(dependency));
    return ready ? { ...run, status: "ready" as const } : run;
  });
}

function runningTaskCount(taskRuns: ProjectTaskRun[]) {
  return taskRuns.filter((run) => run.status === "running").length;
}

function idleReadyAgentCount(taskRuns: ProjectTaskRun[]) {
  const busyAgentIds = new Set(
    taskRuns.filter((run) => run.status === "running").map((run) => run.agentId),
  );
  return new Set(
    taskRuns
      .filter((run) => run.status === "ready" && !busyAgentIds.has(run.agentId))
      .map((run) => run.agentId),
  ).size;
}

export function orchestrationConcurrencyTarget(
  taskRuns: ProjectTaskRun[],
): OrchestrationConcurrencyTarget {
  const demand = runningTaskCount(taskRuns) + idleReadyAgentCount(taskRuns);
  if (demand >= 5) return 6;
  if (demand >= 3) return 4;
  return 2;
}

function availableWaveSlots(taskRuns: ProjectTaskRun[], limit: number) {
  if (!Number.isInteger(limit) || limit <= 0) return 0;
  const boundedLimit = Math.min(limit, ORCHESTRATION_MAX_PARALLEL_TASKS);
  const dynamicTarget = Math.min(boundedLimit, orchestrationConcurrencyTarget(taskRuns));
  return Math.max(0, dynamicTarget - runningTaskCount(taskRuns));
}

function idleReadyRuns(taskRuns: ProjectTaskRun[]) {
  const busyAgentIds = new Set(
    taskRuns.filter((run) => run.status === "running").map((run) => run.agentId),
  );
  return taskRuns.filter((run) => run.status === "ready" && !busyAgentIds.has(run.agentId));
}

function takeDistinctAgentRuns(
  candidates: ProjectTaskRun[],
  slots: number,
  initiallyBusyAgentIds: Set<string> = new Set(),
) {
  const selected: ProjectTaskRun[] = [];
  const busyAgentIds = new Set(initiallyBusyAgentIds);
  for (const run of candidates) {
    if (busyAgentIds.has(run.agentId)) continue;
    selected.push(run);
    busyAgentIds.add(run.agentId);
    if (selected.length >= slots) break;
  }
  return selected;
}

export function selectOrchestrationWave(
  taskRuns: ProjectTaskRun[],
  limit = ORCHESTRATION_MAX_PARALLEL_TASKS,
): ProjectTaskRun[] {
  const slots = availableWaveSlots(taskRuns, limit);
  if (slots === 0) return [];
  return takeDistinctAgentRuns(idleReadyRuns(taskRuns), slots);
}

function dagPriorities(plan: ProjectPlan, taskRuns: ProjectTaskRun[]) {
  const runByTaskId = new Map(taskRuns.map((run) => [run.taskId, run]));
  const completed = new Set(
    taskRuns.filter((run) => run.status === "done").map((run) => run.taskId),
  );
  const dependents = new Map<string, string[]>();
  const sourceIndex = new Map(taskRuns.map((run, index) => [run.taskId, index]));

  for (const task of plan.tasks) {
    for (const dependency of task.dependsOn) {
      const current = dependents.get(dependency) ?? [];
      current.push(task.id);
      dependents.set(dependency, current);
    }
  }

  const criticalPathMemo = new Map<string, number>();
  const criticalPathLength = (taskId: string, visiting = new Set<string>()): number => {
    const cached = criticalPathMemo.get(taskId);
    if (cached !== undefined) return cached;
    if (visiting.has(taskId)) return 0;
    const nextVisiting = new Set(visiting).add(taskId);
    const children = (dependents.get(taskId) ?? []).filter((child) => !completed.has(child));
    const value = children.length === 0
      ? 0
      : 1 + Math.max(...children.map((child) => criticalPathLength(child, nextVisiting)));
    criticalPathMemo.set(taskId, value);
    return value;
  };

  const downstreamCount = (taskId: string) => {
    const seen = new Set<string>();
    const stack = [...(dependents.get(taskId) ?? [])];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || seen.has(current) || completed.has(current)) continue;
      seen.add(current);
      stack.push(...(dependents.get(current) ?? []));
    }
    return seen.size;
  };

  const unlockCount = (taskId: string) => (dependents.get(taskId) ?? []).filter((dependentId) => {
    const dependentTask = plan.tasks.find((task) => task.id === dependentId);
    const dependentRun = runByTaskId.get(dependentId);
    if (!dependentTask || !dependentRun || dependentRun.status !== "pending") return false;
    return dependentTask.dependsOn.every((dependency) => dependency === taskId || completed.has(dependency));
  }).length;

  return new Map<string, DagPriority>(taskRuns.map((run, index) => [
    run.taskId,
    {
      unlockCount: unlockCount(run.taskId),
      criticalPathLength: criticalPathLength(run.taskId),
      downstreamCount: downstreamCount(run.taskId),
      sourceIndex: sourceIndex.get(run.taskId) ?? index,
    },
  ]));
}

function compareDagPriority(
  left: ProjectTaskRun,
  right: ProjectTaskRun,
  priorities: Map<string, DagPriority>,
) {
  const leftPriority = priorities.get(left.taskId) ?? {
    unlockCount: 0,
    criticalPathLength: 0,
    downstreamCount: 0,
    sourceIndex: Number.MAX_SAFE_INTEGER,
  };
  const rightPriority = priorities.get(right.taskId) ?? {
    unlockCount: 0,
    criticalPathLength: 0,
    downstreamCount: 0,
    sourceIndex: Number.MAX_SAFE_INTEGER,
  };

  return rightPriority.unlockCount - leftPriority.unlockCount
    || rightPriority.criticalPathLength - leftPriority.criticalPathLength
    || rightPriority.downstreamCount - leftPriority.downstreamCount
    || leftPriority.sourceIndex - rightPriority.sourceIndex;
}

export function selectAdaptiveOrchestrationWave(
  plan: ProjectPlan,
  taskRuns: ProjectTaskRun[],
  limit = ORCHESTRATION_MAX_PARALLEL_TASKS,
): ProjectTaskRun[] {
  const slots = availableWaveSlots(taskRuns, limit);
  if (slots === 0) return [];

  const eligible = idleReadyRuns(taskRuns);
  if (eligible.length === 0) return [];

  const priorities = dagPriorities(plan, taskRuns);
  const ranked = [...eligible].sort((left, right) => compareDagPriority(left, right, priorities));

  if (slots < 4 || eligible.length <= slots) {
    return takeDistinctAgentRuns(ranked, slots);
  }

  const prioritySelection = takeDistinctAgentRuns(ranked, Math.max(0, slots - 1));
  const selectedTaskIds = new Set(prioritySelection.map((run) => run.taskId));
  const selectedAgentIds = new Set(prioritySelection.map((run) => run.agentId));
  const fairnessCandidate = eligible.find((run) =>
    !selectedTaskIds.has(run.taskId) && !selectedAgentIds.has(run.agentId));

  const selected = fairnessCandidate
    ? [...prioritySelection, fairnessCandidate]
    : prioritySelection;
  if (selected.length >= slots) return selected.slice(0, slots);

  const remaining = ranked.filter((run) =>
    !selected.some((current) => current.taskId === run.taskId));
  return [
    ...selected,
    ...takeDistinctAgentRuns(remaining, slots - selected.length, new Set(selected.map((run) => run.agentId))),
  ];
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
    { roles: ["test-automation"], status: "qa" },
    { roles: ["code-review", "reviewer", "documentation", "data-marketing"], status: "review" },
    { roles: ["frontend", "backend", "database", "security", "devops", "accessibility", "performance", "api-integration", "debug-router"], status: "development" },
    { roles: ["design-system", "designer", "ux-research"], status: "design" },
    { roles: ["idea"], status: "planning" },
  ];

  return priority.find((group) => roles.some((role) => group.roles.includes(role)))?.status
    ?? "development";
}
