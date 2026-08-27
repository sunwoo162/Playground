import type { ProjectState } from "./types";

export type ProjectExecutionControlState =
  | "running"
  | "pause-requested"
  | "paused"
  | "stop-requested"
  | "stopped";

export type ProjectExecutionControlAction = "pause" | "resume" | "stop" | "settle";

export type ProjectExecutionControlRecord = {
  projectId: string;
  state: ProjectExecutionControlState;
  requestedAt: string | null;
  updatedAt: string;
};

const STORAGE_KEY = "luna.project-execution-control.v1";
const CONTROL_STATES: ProjectExecutionControlState[] = [
  "running",
  "pause-requested",
  "paused",
  "stop-requested",
  "stopped",
];
let memoryControls: Record<string, ProjectExecutionControlRecord> = {};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadControlMap() {
  if (!canUseStorage()) return memoryControls;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    return normalizeProjectExecutionControlsSnapshot(JSON.parse(stored));
  } catch {
    return {};
  }
}

function saveControlMap(controls: Record<string, ProjectExecutionControlRecord>) {
  memoryControls = controls;
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(controls));
  }
}

function initialControl(projectId: string, now: string): ProjectExecutionControlRecord {
  return {
    projectId,
    state: "running",
    requestedAt: null,
    updatedAt: now,
  };
}

export function normalizeProjectExecutionControlsSnapshot(
  value: unknown,
): Record<string, ProjectExecutionControlRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const normalized: Record<string, ProjectExecutionControlRecord> = {};
  Object.entries(value as Record<string, unknown>).forEach(([projectId, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const record = raw as Partial<ProjectExecutionControlRecord>;
    if (record.projectId !== projectId) return;
    if (!CONTROL_STATES.includes(record.state as ProjectExecutionControlState)) return;
    if (typeof record.updatedAt !== "string" || !record.updatedAt.trim()) return;
    if (record.requestedAt !== null && typeof record.requestedAt !== "string") return;

    normalized[projectId] = {
      projectId,
      state: record.state as ProjectExecutionControlState,
      requestedAt: record.requestedAt ?? null,
      updatedAt: record.updatedAt,
    };
  });
  return normalized;
}

export function getProjectExecutionControlsSnapshot() {
  return { ...loadControlMap() };
}

export function hasStoredProjectExecutionControls() {
  return Object.keys(loadControlMap()).length > 0;
}

export function restoreProjectExecutionControlsSnapshot(value: unknown) {
  const normalized = normalizeProjectExecutionControlsSnapshot(value);
  saveControlMap(normalized);
  return normalized;
}

export function transitionProjectExecutionControl(
  current: ProjectExecutionControlRecord,
  action: ProjectExecutionControlAction,
  hasRunningTasks: boolean,
  now: string,
): ProjectExecutionControlRecord {
  if (action === "pause") {
    if (current.state === "stopped" || current.state === "stop-requested") return current;
    if (current.state === "paused" || current.state === "pause-requested") return current;
    return {
      ...current,
      state: hasRunningTasks ? "pause-requested" : "paused",
      requestedAt: now,
      updatedAt: now,
    };
  }

  if (action === "resume") {
    if (current.state !== "paused" && current.state !== "pause-requested") return current;
    return {
      ...current,
      state: "running",
      requestedAt: null,
      updatedAt: now,
    };
  }

  if (action === "stop") {
    if (current.state === "stopped" || current.state === "stop-requested") return current;
    return {
      ...current,
      state: hasRunningTasks ? "stop-requested" : "stopped",
      requestedAt: now,
      updatedAt: now,
    };
  }

  if (current.state === "pause-requested" && !hasRunningTasks) {
    return {
      ...current,
      state: "paused",
      updatedAt: now,
    };
  }

  if (current.state === "stop-requested" && !hasRunningTasks) {
    return {
      ...current,
      state: "stopped",
      updatedAt: now,
    };
  }

  return current;
}

export function projectHasRunningTasks(project: ProjectState) {
  return project.taskRuns.some((run) => run.status === "running");
}

export function getProjectExecutionControl(projectId: string) {
  const controls = loadControlMap();
  return controls[projectId] ?? initialControl(projectId, new Date().toISOString());
}

function persistTransition(
  project: ProjectState,
  action: ProjectExecutionControlAction,
  now = new Date().toISOString(),
) {
  const controls = loadControlMap();
  const current = controls[project.id] ?? initialControl(project.id, project.createdAt || now);
  const next = transitionProjectExecutionControl(
    current,
    action,
    projectHasRunningTasks(project),
    now,
  );

  if (next !== current || !controls[project.id]) {
    saveControlMap({ ...controls, [project.id]: next });
  }
  return next;
}

export function requestProjectPause(project: ProjectState, now?: string) {
  return persistTransition(project, "pause", now);
}

export function requestProjectResume(project: ProjectState, now?: string) {
  return persistTransition(project, "resume", now);
}

export function requestProjectStop(project: ProjectState, now?: string) {
  return persistTransition(project, "stop", now);
}

export function settleProjectExecutionControl(project: ProjectState, now?: string) {
  return persistTransition(project, "settle", now);
}

export function projectExecutionAllowsDispatch(projectId: string) {
  return getProjectExecutionControl(projectId).state === "running";
}

export function executionControlMessage(control: ProjectExecutionControlRecord) {
  switch (control.state) {
    case "pause-requested":
      return "일시정지 요청됨 · 현재 실행 중인 Agent wave가 끝난 뒤 새 Task 배정을 멈춥니다.";
    case "paused":
      return "일시정지됨 · /resume 으로 dependency-ready Agent Task 실행을 다시 시작할 수 있습니다.";
    case "stop-requested":
      return "중지 요청됨 · 현재 실행 중인 Agent wave가 끝난 뒤 프로젝트 실행을 종료합니다.";
    case "stopped":
      return "중지됨 · 새 Agent Task를 실행하지 않으며 팀은 다음 프로젝트를 받을 수 있습니다.";
    case "running":
    default:
      return "실행 중";
  }
}

export function clearProjectExecutionControls() {
  saveControlMap({});
  if (canUseStorage()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
