import {
  ORCHESTRATION_MAX_PARALLEL_TASKS,
  orchestrationConcurrencyTarget,
  type OrchestrationConcurrencyTarget,
} from "./orchestrationCore";
import type { ProjectPlan, ProjectTaskRun } from "./types";

export const MAX_SCHEDULER_WAVE_TELEMETRY = 200;

export type SchedulerPriorityTelemetry = {
  unlockCount: number;
  criticalPathLength: number;
  downstreamCount: number;
  sourceIndex: number;
};

export type SchedulerSelectedTaskTelemetry = {
  taskId: string;
  role: string;
  agentId: string;
  fairnessSlot: boolean;
  priority: SchedulerPriorityTelemetry;
  selectionReason: string;
};

export type SchedulerWaveTelemetry = {
  sequence: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  status: "running" | "completed" | "blocked";
  targetConcurrency: OrchestrationConcurrencyTarget;
  runningBefore: number;
  readyBefore: number;
  eligibleAgentCount: number;
  availableSlots: number;
  selectedTaskCount: number;
  selectedTasks: SchedulerSelectedTaskTelemetry[];
};

export type SchedulerAggregateTelemetry = {
  waveCount: number;
  completedWaveCount: number;
  blockedWaveCount: number;
  averageWaveDurationMs: number;
  maxWaveDurationMs: number;
  averageWaveWidth: number;
  maxObservedWaveWidth: number;
  averageTargetConcurrency: number;
  totalAgentRuntimeMs: number;
  wallClockExecutionMs: number;
  estimatedCriticalPathRuntimeMs: number;
  parallelismFactor: number;
  observedAgentCount: number;
  observedAgentActiveMs: number;
  observedAgentIdleMs: number;
  hardCapUtilization: number;
};

type PriorityMap = Map<string, SchedulerPriorityTelemetry>;

function safeDurationMs(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return 0;
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

function runningCount(taskRuns: ProjectTaskRun[]) {
  return taskRuns.filter((run) => run.status === "running").length;
}

function readyRuns(taskRuns: ProjectTaskRun[]) {
  return taskRuns.filter((run) => run.status === "ready");
}

function idleEligibleRuns(taskRuns: ProjectTaskRun[]) {
  const busyAgentIds = new Set(
    taskRuns.filter((run) => run.status === "running").map((run) => run.agentId),
  );
  return taskRuns.filter((run) => run.status === "ready" && !busyAgentIds.has(run.agentId));
}

function priorityMap(plan: ProjectPlan, taskRuns: ProjectTaskRun[]): PriorityMap {
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

  return new Map(taskRuns.map((run, index) => [
    run.taskId,
    {
      unlockCount: unlockCount(run.taskId),
      criticalPathLength: criticalPathLength(run.taskId),
      downstreamCount: downstreamCount(run.taskId),
      sourceIndex: sourceIndex.get(run.taskId) ?? index,
    },
  ]));
}

function comparePriority(
  left: ProjectTaskRun,
  right: ProjectTaskRun,
  priorities: PriorityMap,
) {
  const fallback: SchedulerPriorityTelemetry = {
    unlockCount: 0,
    criticalPathLength: 0,
    downstreamCount: 0,
    sourceIndex: Number.MAX_SAFE_INTEGER,
  };
  const leftPriority = priorities.get(left.taskId) ?? fallback;
  const rightPriority = priorities.get(right.taskId) ?? fallback;
  return rightPriority.unlockCount - leftPriority.unlockCount
    || rightPriority.criticalPathLength - leftPriority.criticalPathLength
    || rightPriority.downstreamCount - leftPriority.downstreamCount
    || leftPriority.sourceIndex - rightPriority.sourceIndex;
}

function distinctPrioritySelection(
  candidates: ProjectTaskRun[],
  slots: number,
) {
  const selected: ProjectTaskRun[] = [];
  const agentIds = new Set<string>();
  for (const run of candidates) {
    if (agentIds.has(run.agentId)) continue;
    selected.push(run);
    agentIds.add(run.agentId);
    if (selected.length >= slots) break;
  }
  return selected;
}

function selectionReason(priority: SchedulerPriorityTelemetry, fairnessSlot: boolean) {
  if (fairnessSlot) return "fifo-fairness";
  if (priority.unlockCount > 0) return "unlocks-ready-tasks";
  if (priority.criticalPathLength > 0) return "critical-path";
  if (priority.downstreamCount > 0) return "downstream-impact";
  return "stable-fifo";
}

export function createSchedulerWaveTelemetry(
  plan: ProjectPlan,
  taskRuns: ProjectTaskRun[],
  selectedRuns: ProjectTaskRun[],
  sequence: number,
  startedAt: string,
): SchedulerWaveTelemetry {
  const targetConcurrency = orchestrationConcurrencyTarget(taskRuns);
  const runningBefore = runningCount(taskRuns);
  const eligible = idleEligibleRuns(taskRuns);
  const eligibleAgentCount = new Set(eligible.map((run) => run.agentId)).size;
  const availableSlots = Math.max(
    0,
    Math.min(ORCHESTRATION_MAX_PARALLEL_TASKS, targetConcurrency) - runningBefore,
  );
  const priorities = priorityMap(plan, taskRuns);
  const ranked = [...eligible].sort((left, right) => comparePriority(left, right, priorities));
  const fairnessEnabled = availableSlots >= 4 && eligible.length > availableSlots;
  const prioritySlots = fairnessEnabled ? Math.max(0, availableSlots - 1) : availableSlots;
  const priorityTaskIds = new Set(
    distinctPrioritySelection(ranked, prioritySlots).map((run) => run.taskId),
  );

  return {
    sequence,
    startedAt,
    completedAt: null,
    durationMs: null,
    status: "running",
    targetConcurrency,
    runningBefore,
    readyBefore: readyRuns(taskRuns).length,
    eligibleAgentCount,
    availableSlots,
    selectedTaskCount: selectedRuns.length,
    selectedTasks: selectedRuns.map((run) => {
      const priority = priorities.get(run.taskId) ?? {
        unlockCount: 0,
        criticalPathLength: 0,
        downstreamCount: 0,
        sourceIndex: Number.MAX_SAFE_INTEGER,
      };
      const fairnessSlot = fairnessEnabled && !priorityTaskIds.has(run.taskId);
      return {
        taskId: run.taskId,
        role: run.role,
        agentId: run.agentId,
        fairnessSlot,
        priority,
        selectionReason: selectionReason(priority, fairnessSlot),
      };
    }),
  };
}

export function completeSchedulerWaveTelemetry(
  wave: SchedulerWaveTelemetry,
  taskRuns: ProjectTaskRun[],
  completedAt: string,
): SchedulerWaveTelemetry {
  const selectedTaskIds = new Set(wave.selectedTasks.map((task) => task.taskId));
  const selectedRuns = taskRuns.filter((run) => selectedTaskIds.has(run.taskId));
  const blocked = selectedRuns.some((run) => run.status === "blocked");
  const completed = selectedRuns.length === wave.selectedTasks.length
    && selectedRuns.every((run) => run.status === "done" || run.status === "blocked");

  return {
    ...wave,
    completedAt,
    durationMs: safeDurationMs(wave.startedAt, completedAt),
    status: blocked ? "blocked" : completed ? "completed" : "running",
  };
}

function taskRuntimeMap(taskRuns: ProjectTaskRun[]) {
  return new Map(taskRuns.map((run) => [
    run.taskId,
    safeDurationMs(run.startedAt, run.completedAt),
  ]));
}

function estimatedCriticalPathRuntimeMs(plan: ProjectPlan, taskRuns: ProjectTaskRun[]) {
  const durations = taskRuntimeMap(taskRuns);
  const tasks = new Map(plan.tasks.map((task) => [task.id, task]));
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const visit = (taskId: string): number => {
    const cached = memo.get(taskId);
    if (cached !== undefined) return cached;
    if (visiting.has(taskId)) return 0;
    const task = tasks.get(taskId);
    if (!task) return 0;
    visiting.add(taskId);
    const dependencyRuntime = task.dependsOn.length === 0
      ? 0
      : Math.max(...task.dependsOn.map(visit));
    visiting.delete(taskId);
    const total = dependencyRuntime + (durations.get(taskId) ?? 0);
    memo.set(taskId, total);
    return total;
  };

  return plan.tasks.length === 0 ? 0 : Math.max(...plan.tasks.map((task) => visit(task.id)));
}

export function summarizeSchedulerTelemetry(
  plan: ProjectPlan,
  waves: SchedulerWaveTelemetry[],
  taskRuns: ProjectTaskRun[],
): SchedulerAggregateTelemetry {
  const completedWaves = waves.filter((wave) => wave.completedAt !== null);
  const waveDurations = completedWaves.map((wave) => wave.durationMs ?? 0);
  const waveWidths = waves.map((wave) => wave.selectedTaskCount);
  const targetConcurrency = waves.map((wave) => wave.targetConcurrency);
  const taskDurations = taskRuns.map((run) => safeDurationMs(run.startedAt, run.completedAt));
  const totalAgentRuntimeMs = taskDurations.reduce((sum, duration) => sum + duration, 0);

  const starts = taskRuns
    .map((run) => run.startedAt ? Date.parse(run.startedAt) : Number.NaN)
    .filter(Number.isFinite);
  const ends = taskRuns
    .map((run) => run.completedAt ? Date.parse(run.completedAt) : Number.NaN)
    .filter(Number.isFinite);
  const wallClockExecutionMs = starts.length > 0 && ends.length > 0
    ? Math.max(0, Math.max(...ends) - Math.min(...starts))
    : 0;

  const observedAgentIds = new Set(
    taskRuns.filter((run) => run.startedAt !== null).map((run) => run.agentId),
  );
  const observedAgentCount = observedAgentIds.size;
  const observedAgentActiveMs = totalAgentRuntimeMs;
  const observedAgentIdleMs = Math.max(
    0,
    wallClockExecutionMs * observedAgentCount - observedAgentActiveMs,
  );
  const hardCapCapacityMs = wallClockExecutionMs * ORCHESTRATION_MAX_PARALLEL_TASKS;

  return {
    waveCount: waves.length,
    completedWaveCount: completedWaves.filter((wave) => wave.status === "completed").length,
    blockedWaveCount: completedWaves.filter((wave) => wave.status === "blocked").length,
    averageWaveDurationMs: waveDurations.length === 0
      ? 0
      : Math.round(waveDurations.reduce((sum, duration) => sum + duration, 0) / waveDurations.length),
    maxWaveDurationMs: waveDurations.length === 0 ? 0 : Math.max(...waveDurations),
    averageWaveWidth: waveWidths.length === 0
      ? 0
      : Number((waveWidths.reduce((sum, width) => sum + width, 0) / waveWidths.length).toFixed(2)),
    maxObservedWaveWidth: waveWidths.length === 0 ? 0 : Math.max(...waveWidths),
    averageTargetConcurrency: targetConcurrency.length === 0
      ? 0
      : Number((targetConcurrency.reduce((sum, value) => sum + value, 0) / targetConcurrency.length).toFixed(2)),
    totalAgentRuntimeMs,
    wallClockExecutionMs,
    estimatedCriticalPathRuntimeMs: estimatedCriticalPathRuntimeMs(plan, taskRuns),
    parallelismFactor: wallClockExecutionMs === 0
      ? 0
      : Number((totalAgentRuntimeMs / wallClockExecutionMs).toFixed(2)),
    observedAgentCount,
    observedAgentActiveMs,
    observedAgentIdleMs,
    hardCapUtilization: hardCapCapacityMs === 0
      ? 0
      : Number((totalAgentRuntimeMs / hardCapCapacityMs).toFixed(4)),
  };
}

export function trimSchedulerWaveTelemetry(waves: SchedulerWaveTelemetry[]) {
  if (waves.length <= MAX_SCHEDULER_WAVE_TELEMETRY) return waves;
  return waves.slice(waves.length - MAX_SCHEDULER_WAVE_TELEMETRY);
}
