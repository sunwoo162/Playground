import type {
  BuilderOrchestrationSnapshot,
  BuilderWorkerClient,
  BuilderWorkerExecutor,
} from "./builderWorkerAdapter";
import { buildBloomBouquetRegistrationUrl } from "./bloomBouquetRegistration";
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

export type LunaIntegratedMergeResult = {
  repositoryFullName: string;
  mergedPullRequests: Array<{
    number: number;
    url: string;
    headBranch: string;
    mergeCommitSha: string | null;
  }>;
};

export type LunaIntegratedDeliveryInput = {
  slug: string;
  projectName: string;
  description: string;
  repositoryFullName: string;
  workspacePath: string;
  mainSha: string;
  requiresAuth: boolean;
};

export type LunaIntegratedDeliveryHook = (
  input: LunaIntegratedDeliveryInput,
) => Promise<{ publicUrl: string; reviewPackagePath?: string }>;

export type ObservedHeadlessBuilderExecutorOptions = HeadlessBuilderExecutorOptions & {
  deliverIntegratedProject?: LunaIntegratedDeliveryHook;
};

const DEPLOYMENT_EVIDENCE_PREFIX = "deployment-url:";
const EXACT_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

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

function normalizedPreviewUrl(value: string, requireHttps: boolean) {
  const url = new URL(value.trim());
  if (requireHttps ? url.protocol !== "https:" : !["http:", "https:"].includes(url.protocol)) {
    throw new Error(requireHttps
      ? "검증된 배포 URL은 HTTPS여야 합니다."
      : "Builder preview URL은 HTTP(S)여야 합니다.");
  }
  if (url.username || url.password || url.hash) {
    throw new Error("Builder preview URL에 credential 또는 fragment를 포함할 수 없습니다.");
  }
  return url.toString();
}

export function resolveDeploymentPreviewUrl(
  existingPreviewUrl: string | null,
  taskRuns: ProjectTaskRun[],
): string | null {
  const existing = existingPreviewUrl?.trim() ?? "";
  if (existing) return normalizedPreviewUrl(existing, false);

  const deploymentUrls = new Set<string>();
  for (const run of taskRuns) {
    if (run.status !== "done" || run.role !== "devops") continue;
    for (const evidence of run.evidence) {
      const normalized = evidence.trim();
      if (!normalized.toLowerCase().startsWith(DEPLOYMENT_EVIDENCE_PREFIX)) continue;
      const value = normalized.slice(DEPLOYMENT_EVIDENCE_PREFIX.length).trim();
      if (!value || /\s/.test(value)) continue;
      deploymentUrls.add(normalizedPreviewUrl(value, true));
    }
  }

  if (deploymentUrls.size > 1) {
    throw new Error("완료된 DevOps Task에 서로 다른 deployment-url evidence가 있어 preview URL을 확정할 수 없습니다.");
  }
  return deploymentUrls.values().next().value ?? null;
}

export function resolveIntegratedMainSha(integration: LunaIntegratedMergeResult): string {
  if (!integration.mergedPullRequests.length) {
    throw new Error("자동 배포에 사용할 merged PR evidence가 없습니다.");
  }
  const lastMerge = integration.mergedPullRequests[integration.mergedPullRequests.length - 1];
  const mainSha = lastMerge?.mergeCommitSha ?? "";
  if (!EXACT_GIT_SHA_PATTERN.test(mainSha)) {
    throw new Error("자동 배포에는 마지막 integration PR의 정확한 40자리 merge commit SHA가 필요합니다.");
  }
  return mainSha;
}

export function resolveAutomaticDeliveryMainSha(input: {
  releaseSha: string | null | undefined;
  integration: LunaIntegratedMergeResult;
}): string {
  if (!input.integration.mergedPullRequests.length) {
    throw new Error("자동 배포 전에 develop integration merge evidence가 필요합니다.");
  }
  const releaseSha = input.releaseSha?.trim() ?? "";
  if (!EXACT_GIT_SHA_PATTERN.test(releaseSha)) {
    throw new Error("자동 배포에는 promotion이 반환한 정확한 40자리 lowercase main release SHA가 필요합니다.");
  }
  return releaseSha;
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
  options: ObservedHeadlessBuilderExecutorOptions,
): BuilderWorkerExecutor {
  const runtime = {
    ...options.runtime,
    async dispatchTask(input: Parameters<HeadlessBuilderExecutorOptions["runtime"]["dispatchTask"]>[0]) {
      const deploymentAwareInput = input.role === "devops"
        ? {
            ...input,
            summary: [
              input.summary,
              "[Deployment evidence contract] If this task publishes or verifies the live web release, verify the deployed endpoint first and include exactly one evidence entry in the form `deployment-url: https://...`. Never report a deployment URL that was inferred or not actually verified. If live deployment is required by this task but cannot be verified, return blocked instead of fabricating release evidence.",
            ].join("\n\n"),
          }
        : input;
      return options.runtime.dispatchTask(deploymentAwareInput);
    },
  };
  const execute = createHeadlessBuilderExecutor({ ...options, runtime });

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

    const result = await execute(claim, observedClient);
    const completedPayload = previousPayloadJson ? parsePayload(previousPayloadJson) : null;
    const plan = completedPayload?.plan;
    const repository = completedPayload?.repository;
    let previewUrl = resolveDeploymentPreviewUrl(
      result.previewUrl,
      completedPayload?.taskRuns ?? [],
    );
    let autoDelivered = false;

    if (options.deliverIntegratedProject) {
      if (!plan || !repository || !completedPayload?.integration) {
        throw new Error("자동 Luna delivery 전에 plan, repository, integration evidence가 모두 필요합니다.");
      }
      const mainSha = resolveAutomaticDeliveryMainSha({
        releaseSha: result.releaseSha,
        integration: completedPayload.integration,
      });
      const delivered = await options.deliverIntegratedProject({
        slug: plan.repositoryName,
        projectName: plan.projectName,
        description: plan.productSummary,
        repositoryFullName: result.repositoryFullName ?? repository.repository,
        workspacePath: repository.workspacePath,
        mainSha,
        requiresAuth: plan.needsAuth || claim.authRequired,
      });
      previewUrl = normalizedPreviewUrl(delivered.publicUrl, true);
      autoDelivered = true;
    }

    const bloomBouquetRegistrationUrl = !autoDelivered && plan && repository
      ? buildBloomBouquetRegistrationUrl({
          teamId: options.teamId,
          teamName: options.teamName,
          projectName: plan.projectName,
          projectSlug: plan.repositoryName,
          description: plan.productSummary,
          repositoryFullName: result.repositoryFullName ?? repository.repository,
          demoUrl: previewUrl,
          requiresAuth: plan.needsAuth || claim.authRequired,
        })
      : null;

    return {
      ...result,
      previewUrl,
      bloomBouquetRegistrationUrl,
    };
  };
}
