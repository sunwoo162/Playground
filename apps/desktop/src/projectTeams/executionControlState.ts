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
  control: ProjectExecutionControlRecord,
) {
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === projectId
        ? { ...project, runtimeMessage: executionControlMessage(control) }
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
): ProjectExecutionControlResult {
  let nextState = updateProjectRuntimeMessage(state, project.id, control);
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
  return persistControlResult(state, project, requestProjectPause(project));
}

export function resumeProjectExecution(
  state: ProjectTeamsState,
  projectId: string,
): ProjectExecutionControlResult {
  const project = projectOrNull(state, projectId);
  if (!project) return { state, control: getProjectExecutionControl(projectId) };
  return persistControlResult(state, project, requestProjectResume(project));
}

export function stopProjectExecution(
  state: ProjectTeamsState,
  projectId: string,
): ProjectExecutionControlResult {
  const project = projectOrNull(state, projectId);
  if (!project) return { state, control: getProjectExecutionControl(projectId) };
  return persistControlResult(state, project, requestProjectStop(project));
}

export function reconcileProjectExecutionControl(
  state: ProjectTeamsState,
  projectId: string,
): ProjectExecutionControlResult {
  const project = projectOrNull(state, projectId);
  if (!project) return { state, control: getProjectExecutionControl(projectId) };
  return persistControlResult(state, project, settleProjectExecutionControl(project));
}

export function resetProjectExecutionControlState() {
  clearProjectExecutionControls();
}
