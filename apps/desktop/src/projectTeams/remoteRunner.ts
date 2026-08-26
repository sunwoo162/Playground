import type { OrganizationRuntimeSettings } from "./organization";
import {
  loadRemoteRunnerSettings,
  normalizeRemoteRunnerBaseUrl,
  requireRemoteRunnerSessionToken,
  type RemoteRunnerSettings,
} from "./remoteRunnerSettings";
import type { AgentTaskRunResult } from "./runtime";
import { buildRemoteAgentTaskRuntimeInput } from "./taskScheduler";
import type { ProjectTeamsState } from "./types";

export {
  DEFAULT_REMOTE_RUNNER_SETTINGS,
  hasRemoteRunnerSessionToken,
  loadRemoteRunnerSettings,
  saveRemoteRunnerSettings,
  setRemoteRunnerSessionToken,
  type RemoteExecutionMode,
  type RemoteRunnerSettings,
} from "./remoteRunnerSettings";

export type RemoteRunnerHealth = {
  ok: boolean;
  service: string;
  protocolVersion: number;
  workerConfigured: boolean;
  activeJobId: string | null;
  queuedJobs: number;
};

export type RemoteFailureRoute = {
  projectId: string;
  failedTaskId: string;
  routerAgentId: string;
  sessionId: string | null;
  eventsPath: string;
  outputPath: string;
  decision: {
    route: "retry-owner" | "escalate-pm" | "needs-human";
    failureType: string;
    severity: string;
    ownerTaskId: string | null;
    ownerRole: string | null;
    summary: string;
    rationaleSummary: string;
    evidence: string[];
    recommendedAction: string;
  };
};

export type RemoteWorkerResult = {
  protocolVersion: number;
  jobId: string;
  projectId: string;
  status: "completed" | "blocked";
  message: string;
  repositoryFullName: string;
  workspacePath: string;
  blockedTaskId: string | null;
  taskResults: AgentTaskRunResult[];
  failureRoutes?: RemoteFailureRoute[];
  mergedPullRequestNumbers?: number[];
};

export type RemoteRunnerJob = {
  id: string;
  idempotencyKey: string;
  projectId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  attempt: number;
  error: string | null;
  result: RemoteWorkerResult | null;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "message" in body
      ? String((body as { message: unknown }).message)
      : typeof body === "string" && body
        ? body
        : `HTTP ${response.status}`;
    throw new Error(`Remote Runner 요청 실패: ${message}`);
  }
  return body as T;
}

export async function checkRemoteRunner(settings = loadRemoteRunnerSettings()) {
  const baseUrl = normalizeRemoteRunnerBaseUrl(settings.baseUrl);
  const response = await fetch(`${baseUrl}/health`, {
    method: "GET",
    cache: "no-store",
  });
  return parseResponse<RemoteRunnerHealth>(response);
}

async function authenticatedRequest<T>(
  settings: RemoteRunnerSettings,
  path: string,
  init: RequestInit,
) {
  const baseUrl = normalizeRemoteRunnerBaseUrl(settings.baseUrl);
  const token = requireRemoteRunnerSessionToken();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  return parseResponse<T>(response);
}

export function buildRemoteProjectJob(
  state: ProjectTeamsState,
  projectId: string,
  runtimeSettings: OrganizationRuntimeSettings,
) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project?.plan || !project.repositoryFullName || !project.workspacePath) {
    throw new Error("Remote Runner에 넘길 PM 계획 또는 repository 정보가 없습니다.");
  }

  const taskRuns = new Map(project.taskRuns.map((run) => [run.taskId, run]));
  const tasks = project.plan.tasks.map((task) => {
    const run = taskRuns.get(task.id);
    if (!run) {
      throw new Error(`Remote Runner task state를 찾을 수 없습니다: ${task.id}`);
    }
    return {
      dependsOn: task.dependsOn,
      runtimeInput: buildRemoteAgentTaskRuntimeInput(
        state,
        project.id,
        run,
        runtimeSettings,
      ),
    };
  });

  const idempotencyKey = [
    project.id,
    project.pmSessionId ?? project.createdAt,
    "agent-dag-v1",
  ].join(":");

  return {
    projectId: project.id,
    idempotencyKey,
    payload: {
      protocolVersion: 1,
      kind: "project-execution",
      organization: runtimeSettings.organization,
      repositoryName: project.plan.repositoryName,
      tasks,
    },
  };
}

export async function submitRemoteProject(
  state: ProjectTeamsState,
  projectId: string,
  runtimeSettings: OrganizationRuntimeSettings,
  runnerSettings = loadRemoteRunnerSettings(),
) {
  const job = buildRemoteProjectJob(state, projectId, runtimeSettings);
  return authenticatedRequest<RemoteRunnerJob>(runnerSettings, "/v1/jobs", {
    method: "POST",
    body: JSON.stringify(job),
  });
}

export async function getRemoteRunnerJob(
  jobId: string,
  runnerSettings = loadRemoteRunnerSettings(),
) {
  if (!/^[0-9a-f-]+$/i.test(jobId)) {
    throw new Error("Remote Runner job ID 형식이 올바르지 않습니다.");
  }
  return authenticatedRequest<RemoteRunnerJob>(
    runnerSettings,
    `/v1/jobs/${jobId}`,
    { method: "GET" },
  );
}

export async function cancelRemoteRunnerJob(
  jobId: string,
  runnerSettings = loadRemoteRunnerSettings(),
) {
  if (!/^[0-9a-f-]+$/i.test(jobId)) {
    throw new Error("Remote Runner job ID 형식이 올바르지 않습니다.");
  }
  return authenticatedRequest<RemoteRunnerJob>(
    runnerSettings,
    `/v1/jobs/${jobId}/cancel`,
    { method: "POST" },
  );
}
