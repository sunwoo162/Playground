import { createInitialProjectTeamsState } from "./catalog";
import type { ProjectState, ProjectTeamsState, TeamId } from "./types";

const STORAGE_KEY = "luna.project-teams.v1";

export type StartProjectResult =
  | { ok: true; state: ProjectTeamsState; project: ProjectState }
  | { ok: false; state: ProjectTeamsState; message: string };

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadProjectTeamsState(): ProjectTeamsState {
  if (!canUseStorage()) {
    return createInitialProjectTeamsState();
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return createInitialProjectTeamsState();
  }

  try {
    const parsed = JSON.parse(stored) as ProjectTeamsState;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.teams) || !Array.isArray(parsed.projects)) {
      return createInitialProjectTeamsState();
    }
    return parsed;
  } catch {
    return createInitialProjectTeamsState();
  }
}

export function saveProjectTeamsState(state: ProjectTeamsState) {
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export function resetProjectTeamsState() {
  const state = createInitialProjectTeamsState();
  saveProjectTeamsState(state);
  return state;
}

function chooseIdleTeam(state: ProjectTeamsState) {
  return state.teams.find((team) => team.status === "idle") ?? null;
}

function createProjectId() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PROJECT-${time}-${random}`;
}

export function startProject(state: ProjectTeamsState, request: string): StartProjectResult {
  const normalizedRequest = request.trim();
  if (!normalizedRequest) {
    return { ok: false, state, message: "프로젝트 요구사항을 입력해 주세요." };
  }

  const team = chooseIdleTeam(state);
  if (!team) {
    return { ok: false, state, message: "현재 대기 중인 팀이 없습니다." };
  }

  const project: ProjectState = {
    id: createProjectId(),
    request: normalizedRequest,
    teamId: team.id,
    status: "queued",
    createdAt: new Date().toISOString(),
    authPolicyId: "bouquet",
    executionPolicyId: "iseol-workflow",
    runtimeMessage: "팀 배정 완료 · Codex 실행 Runtime 연결 대기",
  };

  const nextState: ProjectTeamsState = {
    ...state,
    projects: [project, ...state.projects],
    teams: state.teams.map((currentTeam) => {
      if (currentTeam.id !== team.id) {
        return currentTeam;
      }

      return {
        ...currentTeam,
        status: "reserved",
        activeProjectId: project.id,
        agents: currentTeam.agents.map((agent) => ({
          ...agent,
          status: agent.role === "pm" ? "ready" : "idle",
        })),
      };
    }),
  };

  saveProjectTeamsState(nextState);
  return { ok: true, state: nextState, project };
}

export function getTeamName(state: ProjectTeamsState, teamId: TeamId) {
  return state.teams.find((team) => team.id === teamId)?.name ?? teamId;
}
