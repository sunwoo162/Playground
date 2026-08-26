import {
  clearProjectExecutionControls,
  executionControlMessage,
  getProjectExecutionControl,
  requestProjectPause,
  requestProjectResume,
  requestProjectStop,
  settleProjectExecutionControl,
  type ProjectExecutionControlRecord,
} from "./executionControl";
import { saveProjectTeamsState } from "./store";
import type { ProjectState, ProjectTeamsState } from "./types";

export type ProjectExecutionControlResult = {
  state: ProjectTeamsState;
  control: ProjectExecutionControlRecord;
};

function updateProjectRuntimeMessage(
  state: ProjectTeamsState,
  projectId: string,
  message: string,
) {
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === projectId
        ? { ...project, runtimeMessage: message }
        : project,
    ),
  };
}

function releaseStoppedProjectTeam(state: ProjectTeamsState, project: ProjectState) {
  return {
    ...state,
    teams: state.teams.map((team) => {
      if (team.id !== project.teamId || team.activeProjectId !== project.id) return team;

      return {
        ...team,
        status: "idle" as const,
        activeProjectId: null,
        agents: team.agents.map((agent) => ({ ...agent, status: "idle" as const })),
      };
    }),
  };
}

function persistControlResult(
  state: ProjectTeamsState,
  project: ProjectState,
  control: ProjectExecutionControlRecord,
  message: string | null,
): ProjectExecutionControlResult {
  let nextState = message
    ? updateProjectRuntimeMessage(state, project.id, message)
    : state;
  if (control.state === "stopped") {
    nextState = releaseStoppedProjectTeam(nextState, project);
  }
  saveProjectTeamsState(nextState);
  return { state: nextState, control };
}

function projectOrNull(state: ProjectTeamsState, projectId: string) {
  return state.projects.find((project) => project.id === projectId) ?? null;
}

export function getProjectExecutionControlState(projectId: string) {
  return getProjectExecutionControl(projectId);
}

export function pauseProjectExecution(
  state: ProjectTeamsState,
  projectId: string,
): ProjectExecutionControlResult {
  const project = projectOrNull(state, projectId);
  if (!project) return { state, control: getProjectExecutionControl(projectId) };
  const control = requestProjectPause(project);
  return persistControlResult(state, project, control, executionControlMessage(control));
}

export function resumeProjectExecution(
  state: ProjectTeamsState,
  projectId: string,
): ProjectExecutionControlResult {
  const project = projectOrNull(state, projectId);
  if (!project) return { state, control: getProjectExecutionControl(projectId) };
  const control = requestProjectResume(project);
  const message = project.status === "blocked"
    ? "재개 요청됨 · 프로젝트가 blocked 상태이므로 Debug Router 또는 PM 복구를 먼저 완료해야 합니다."
    : "Agent 실행 재개 · dependency-ready Task부터 계속 실행합니다.";
  return persistControlResult(state, project, control, message);
}

export function stopProjectExecution(
  state: ProjectTeamsState,
  projectId: string,
): ProjectExecutionControlResult {
  const project = projectOrNull(state, projectId);
  if (!project) return { state, control: getProjectExecutionControl(projectId) };
  const control = requestProjectStop(project);
  return persistControlResult(state, project, control, executionControlMessage(control));
}

export function reconcileProjectExecutionControl(
  state: ProjectTeamsState,
  projectId: string,
): ProjectExecutionControlResult {
  const project = projectOrNull(state, projectId);
  if (!project) return { state, control: getProjectExecutionControl(projectId) };
  const control = settleProjectExecutionControl(project);
  return persistControlResult(
    state,
    project,
    control,
    control.state === "running" ? null : executionControlMessage(control),
  );
}

export function resetProjectExecutionControlState() {
  clearProjectExecutionControls();
}
