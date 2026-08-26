import { loadRemoteRunnerSettings } from "./remoteRunnerSettings";

export type ProjectExecutionControlState = "running" | "paused" | "stopped";

export type ProjectExecutionControl = {
  projectId: string;
  state: ProjectExecutionControlState;
  updatedAt: string;
};

const CONTROL_KEY_PREFIX = "luna.project-execution-control.v1.";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function keyForProject(projectId: string) {
  return `${CONTROL_KEY_PREFIX}${projectId}`;
}

function createDefaultControl(projectId: string): ProjectExecutionControl {
  const remoteHandoff = loadRemoteRunnerSettings().mode === "remote";
  return {
    projectId,
    state: remoteHandoff ? "paused" : "running",
    updatedAt: new Date().toISOString(),
  };
}

export function loadProjectExecutionControl(projectId: string): ProjectExecutionControl {
  if (!canUseStorage()) {
    return createDefaultControl(projectId);
  }

  const stored = window.localStorage.getItem(keyForProject(projectId));
  if (!stored) {
    return createDefaultControl(projectId);
  }

  try {
    const parsed = JSON.parse(stored) as Partial<ProjectExecutionControl>;
    const state = parsed.state;
    if (state !== "running" && state !== "paused" && state !== "stopped") {
      return createDefaultControl(projectId);
    }

    return {
      projectId,
      state,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return createDefaultControl(projectId);
  }
}

export function setProjectExecutionControl(
  projectId: string,
  state: ProjectExecutionControlState,
): ProjectExecutionControl {
  const control: ProjectExecutionControl = {
    projectId,
    state,
    updatedAt: new Date().toISOString(),
  };

  if (canUseStorage()) {
    window.localStorage.setItem(keyForProject(projectId), JSON.stringify(control));
  }

  return control;
}

export function pauseProjectExecution(projectId: string) {
  return setProjectExecutionControl(projectId, "paused");
}

export function resumeProjectExecution(projectId: string) {
  return setProjectExecutionControl(projectId, "running");
}

export function stopProjectExecution(projectId: string) {
  return setProjectExecutionControl(projectId, "stopped");
}

export function clearProjectExecutionControls() {
  if (!canUseStorage()) return;

  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(CONTROL_KEY_PREFIX)) {
      keys.push(key);
    }
  }

  keys.forEach((key) => window.localStorage.removeItem(key));
}
