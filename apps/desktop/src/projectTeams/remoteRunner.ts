import type { OrganizationRuntimeSettings } from "./organization";
import type { AgentTaskRunResult } from "./runtime";
import { buildRemoteAgentTaskRuntimeInput } from "./taskScheduler";
import type { ProjectTeamsState } from "./types";

const SETTINGS_KEY = "luna.remote-runner-settings.v1";

export type RemoteExecutionMode = "local" | "remote";

export type RemoteRunnerSettings = {
  mode: RemoteExecutionMode;
  baseUrl: string;
};

export type RemoteRunnerHealth = {
  ok: boolean;
  service: string;
  protocolVersion: number;
  workerConfigured: boolean;
  activeJobId: string | null;
  queuedJobs: number;
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

export const DEFAULT_REMOTE_RUNNER_SETTINGS: RemoteRunnerSettings = {
  mode: "local",
  baseUrl: "http://127.0.0.1:4781",
};

let sessionToken = "";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  const url = new URL(normalized || DEFAULT_REMOTE_RUNNER_SETTINGS.baseUrl);
  if (!matchesHttpProtocol(url.protocol)) {
    throw new Error("Remote Runner URL은 http 또는 https만 사용할 수 있습니다.");
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !loopback) {
    throw new Error("원격 Runner는 HTTPS를 사용해야 합니다. HTTP는 localhost에서만 허용됩니다.");
  }
  return url.toString().replace(/\/+$/, "");
}

function matchesHttpProtocol(protocol: string) {
  return protocol === "http:" || protocol === "https:";
}

export function loadRemoteRunnerSettings(): RemoteRunnerSettings {
  if (!canUseStorage()) return DEFAULT_REMOTE_RUNNER_SETTINGS;
  const stored = window.localStorage.getItem(SETTINGS_KEY);
  if (!stored) return DEFAULT_REMOTE_RUNNER_SETTINGS;

  try {
    const parsed = JSON.parse(stored) as Partial<RemoteRunnerSettings>;
    return {
      mode: parsed.mode === "remote" ? "remote" : "local",
      baseUrl: normalizeBaseUrl(parsed.baseUrl ?? DEFAULT_REMOTE_RUNNER_SETTINGS.baseUrl),
    };
  } catch {
    return DEFAULT_REMOTE_RUNNER_SETTINGS;
  }
}

export function saveRemoteRunnerSettings(settings: RemoteRunnerSettings) {
  const normalized: RemoteRunnerSettings = {
    mode: settings.mode === "remote" ? "remote" : "local",
    baseUrl: normalizeBaseUrl(settings.baseUrl),
  };
  if (canUseStorage()) {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function setRemoteRunnerSessionToken(token: string) {
  sessionToken = token.trim();
}

export function hasRemoteRunnerSessionToken() {
  return sessionToken.length > 0;
}

function requireSessionToken() {
  if (!sessionToken) {
    throw new Error("Remote Runner 토큰을 이 앱 세션에 입력해 주세요.");
  }
  return sessionToken;
}

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
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
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
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const token = requireSessionToken();
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
