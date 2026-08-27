import type {
  BuilderOrchestrationSnapshot,
  BuilderWorkerClient,
  BuilderWorkerExecutor,
} from "./builderWorkerAdapter";
import {
  createHeadlessBuilderExecutor,
  type HeadlessBuilderExecutorOptions,
  type HeadlessBuilderSnapshotPayload,
} from "./headlessBuilderExecutor";
import {
  completeSchedulerWaveTelemetry,
  createSchedulerWaveTelemetry,
  summarizeSchedulerTelemetry,
  trimSchedulerWaveTelemetry,
  type SchedulerAggregateTelemetry,
  type SchedulerWaveTelemetry,
} from "./schedulerObservability";
import type { ProjectTaskRun } from "./types";

export type SchedulerObservabilitySnapshot = {
  waves: SchedulerWaveTelemetry[];
  metrics: SchedulerAggregateTelemetry | null;
};

type ObservedHeadlessBuilderSnapshotPayload = HeadlessBuilderSnapshotPayload & {
  schedulerObservability?: SchedulerObservabilitySnapshot;
};

function parsePayload(payloadJson: string): ObservedHeadlessBuilderSnapshotPayload | null {
  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ObservedHeadlessBuilderSnapshotPayload;
  } catch {
    return null;
  }
}

function normalizedObservability(
  payload: ObservedHeadlessBuilderSnapshotPayload | null,
): SchedulerObservabilitySnapshot {
  const waves = payload?.schedulerObservability?.waves;
  const metrics = payload?.schedulerObservability?.metrics;
  return {
    waves: Array.isArray(waves) ? waves : [],
    metrics: metrics ?? null,
  };
}

function reconstructPreWaveRuns(
  currentRuns: ProjectTaskRun[],
  previousRuns: ProjectTaskRun[] | undefined,
  startedTaskIds: Set<string>,
) {
  const previousByTaskId = new Map((previousRuns ?? []).map((run) => [run.taskId, run]));
  return currentRuns.map((run) => {
    const previous = previousByTaskId.get(run.taskId);
    if (previous) return previous;
    if (startedTaskIds.has(run.taskId) && run.status === "running") {
      return {
        ...run,
        status: "ready" as const,
        attempts: Math.max(0, run.attempts - 1),
        startedAt: null,
      };
    }
    return run;
  });
}

function detectStartedRuns(
  previousRuns: ProjectTaskRun[] | undefined,
  currentRuns: ProjectTaskRun[],
) {
  const previousByTaskId = new Map((previousRuns ?? []).map((run) => [run.taskId, run]));
  return currentRuns.filter((run) => {
    if (run.status !== "running") return false;
    const previous = previousByTaskId.get(run.taskId);
    return !previous || previous.status !== "running";
  });
}

function waveCompletionTimestamp(
  wave: SchedulerWaveTelemetry,
  taskRuns: ProjectTaskRun[],
) {
  const selectedTaskIds = new Set(wave.selectedTasks.map((task) => task.taskId));
  const timestamps = taskRuns
    .filter((run) => selectedTaskIds.has(run.taskId) && run.completedAt !== null)
    .map((run) => run.completedAt as string)
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  return timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;
}

export function decorateSchedulerObservability(
  previousPayloadJson: string | null,
  currentPayloadJson: string,
) {
  const current = parsePayload(currentPayloadJson);
  if (!current || !current.plan || !Array.isArray(current.taskRuns)) {
    return currentPayloadJson;
  }

  const previous = previousPayloadJson ? parsePayload(previousPayloadJson) : null;
  const observability = normalizedObservability(previous ?? current);
  let waves = [...observability.waves];

  const startedRuns = detectStartedRuns(previous?.taskRuns, current.taskRuns);
  if (startedRuns.length > 0) {
    const startedTaskIds = new Set(startedRuns.map((run) => run.taskId));
    const preWaveRuns = reconstructPreWaveRuns(
      current.taskRuns,
      previous?.taskRuns,
      startedTaskIds,
    );
    const selectedRuns = preWaveRuns.filter((run) => startedTaskIds.has(run.taskId));
    const startedAt = startedRuns
      .map((run) => run.startedAt)
      .filter((value): value is string => value !== null)
      .sort((left, right) => Date.parse(left) - Date.parse(right))[0]
      ?? new Date().toISOString();

    waves.push(createSchedulerWaveTelemetry(
      current.plan,
      preWaveRuns,
      selectedRuns,
      waves.length + 1,
      startedAt,
    ));
    waves = trimSchedulerWaveTelemetry(waves);
  }

  waves = waves.map((wave) => {
    if (wave.status !== "running") return wave;
    const completedAt = waveCompletionTimestamp(wave, current.taskRuns);
    if (!completedAt) return wave;
    return completeSchedulerWaveTelemetry(wave, current.taskRuns, completedAt);
  });

  current.schedulerObservability = {
    waves,
    metrics: summarizeSchedulerTelemetry(current.plan, waves, current.taskRuns),
  };
  return JSON.stringify(current);
}

function initialPayloadJson(snapshot: BuilderOrchestrationSnapshot | null | undefined) {
  return snapshot?.payloadJson ?? null;
}

export function createObservedHeadlessBuilderExecutor(
  options: HeadlessBuilderExecutorOptions,
): BuilderWorkerExecutor {
  const execute = createHeadlessBuilderExecutor(options);

  return async (claim, client) => {
    let previousPayloadJson = initialPayloadJson(claim.orchestrationSnapshot);
    const observedClient: BuilderWorkerClient = {
      ...client,
      async loadSnapshot(runId, workerId) {
        const snapshot = await client.loadSnapshot(runId, workerId);
        previousPayloadJson = initialPayloadJson(snapshot);
        return snapshot;
      },
      async saveSnapshot(runId, workerId, write) {
        const payloadJson = decorateSchedulerObservability(
          previousPayloadJson,
          write.payloadJson,
        );
        const saved = await client.saveSnapshot(runId, workerId, {
          ...write,
          payloadJson,
        });
        previousPayloadJson = payloadJson;
        return {
          ...saved,
          payloadJson,
        };
      },
    };

    return execute(claim, observedClient);
  };
}
