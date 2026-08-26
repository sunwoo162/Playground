import { createInitialProjectTeamsState } from "./catalog";
import { createAgentRuntimeIdentity } from "./permissions";
import type {
  AgentDecision,
  ProjectPlan,
  ProjectState,
  ProjectTeamsState,
  TeamId,
} from "./types";

const STORAGE_KEY = "luna.project-teams.v1";

export type StartProjectResult =
  | { ok: true; state: ProjectTeamsState; project: ProjectState }
  | { ok: false; state: ProjectTeamsState; message: string };

export type RecordDecisionInput = Omit<AgentDecision, "id" | "createdAt">;

export type CompleteProjectPlanningInput = {
  projectId: string;
  plan: ProjectPlan;
  repositoryFullName: string;
  workspacePath: string;
  pmSessionId: string | null;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function hydrateState(state: ProjectTeamsState): ProjectTeamsState {
  const initialState = createInitialProjectTeamsState();

  return {
    ...state,
    teams: initialState.teams.map((templateTeam) => {
      const storedTeam = state.teams.find((team) => team.id === templateTeam.id);
      if (!storedTeam) {
        return templateTeam;
      }

      const storedAgents = new Map(storedTeam.agents.map((agent) => [agent.role, agent]));

      return {
        ...templateTeam,
        ...storedTeam,
        agents: templateTeam.agents.map((templateAgent) => {
          const storedAgent = storedAgents.get(templateAgent.role) ?? templateAgent;
          const identity = createAgentRuntimeIdentity(templateAgent.id, templateAgent.role);

          return {
            ...templateAgent,
            ...storedAgent,
            id: templateAgent.id,
            role: templateAgent.role,
            autonomy: identity.autonomy,
            permissions: identity.permissions,
          };
        }),
      };
    }),
    projects: state.projects.map((project) => ({
      ...project,
      autonomyPolicyId: project.autonomyPolicyId ?? "independent-agent",
      decisionPolicyId: project.decisionPolicyId ?? "reasoned-agent-decisions",
      documentationPolicyId: project.documentationPolicyId ?? "documentation-evidence",
      qualityPolicyId: project.qualityPolicyId ?? "production-service",
      deploymentPolicyId: project.deploymentPolicyId ?? "luna-apps-portal",
      plan: project.plan ?? null,
      repositoryFullName: project.repositoryFullName ?? null,
      workspacePath: project.workspacePath ?? null,
      pmSessionId: project.pmSessionId ?? null,
    })),
    decisions: Array.isArray(state.decisions) ? state.decisions : [],
  };
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
    return hydrateState(parsed);
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

function createDecisionId() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DECISION-${time}-${random}`;
}

function updateProject(state: ProjectTeamsState, projectId: string, updater: (project: ProjectState) => ProjectState) {
  return {
    ...state,
    projects: state.projects.map((project) => (project.id === projectId ? updater(project) : project)),
  };
}

export function recordAgentDecision(state: ProjectTeamsState, input: RecordDecisionInput) {
  const decision: AgentDecision = {
    ...input,
    id: createDecisionId(),
    createdAt: new Date().toISOString(),
  };

  const nextState: ProjectTeamsState = {
    ...state,
    decisions: [decision, ...state.decisions],
  };

  saveProjectTeamsState(nextState);
  return { state: nextState, decision };
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
    autonomyPolicyId: "independent-agent",
    decisionPolicyId: "reasoned-agent-decisions",
    documentationPolicyId: "documentation-evidence",
    qualityPolicyId: "production-service",
    deploymentPolicyId: "luna-apps-portal",
    plan: null,
    repositoryFullName: null,
    workspacePath: null,
    pmSessionId: null,
    runtimeMessage: "팀 배정 완료 · PM Codex 실행 준비",
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

export function beginProjectPlanning(state: ProjectTeamsState, projectId: string) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return state;

  let nextState = updateProject(state, projectId, (currentProject) => ({
    ...currentProject,
    status: "planning",
    runtimeMessage: "PM Codex가 프로젝트를 분석하고 실제 서비스 계획을 작성 중",
  }));

  nextState = {
    ...nextState,
    teams: nextState.teams.map((team) =>
      team.id === project.teamId
        ? {
            ...team,
            status: "working",
            agents: team.agents.map((agent) => ({
              ...agent,
              status: agent.role === "pm" ? "working" : "idle",
            })),
          }
        : team,
    ),
  };

  saveProjectTeamsState(nextState);
  return nextState;
}

export function completeProjectPlanning(state: ProjectTeamsState, input: CompleteProjectPlanningInput) {
  const project = state.projects.find((item) => item.id === input.projectId);
  if (!project) return state;

  const requiredRoles = new Set(input.plan.tasks.map((task) => task.role));
  let nextState = updateProject(state, input.projectId, (currentProject) => ({
    ...currentProject,
    status: "planning",
    plan: input.plan,
    repositoryFullName: input.repositoryFullName,
    workspacePath: input.workspacePath,
    pmSessionId: input.pmSessionId,
    runtimeMessage: "PM 계획 및 repository 준비 완료 · 독립 Agent worker dispatch 대기",
  }));

  nextState = {
    ...nextState,
    teams: nextState.teams.map((team) =>
      team.id === project.teamId
        ? {
            ...team,
            status: "working",
            agents: team.agents.map((agent) => ({
              ...agent,
              status:
                agent.role === "pm"
                  ? "done"
                  : requiredRoles.has(agent.role)
                    ? "ready"
                    : "idle",
            })),
          }
        : team,
    ),
  };

  saveProjectTeamsState(nextState);
  return nextState;
}

export function failProjectRuntime(state: ProjectTeamsState, projectId: string, reason: string) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return state;

  let nextState = updateProject(state, projectId, (currentProject) => ({
    ...currentProject,
    status: "blocked",
    runtimeMessage: reason,
  }));

  nextState = {
    ...nextState,
    teams: nextState.teams.map((team) =>
      team.id === project.teamId
        ? {
            ...team,
            status: "working",
            agents: team.agents.map((agent) => ({
              ...agent,
              status: agent.role === "pm" ? "blocked" : agent.status,
            })),
          }
        : team,
    ),
  };

  saveProjectTeamsState(nextState);
  return nextState;
}

export function getTeamName(state: ProjectTeamsState, teamId: TeamId) {
  return state.teams.find((team) => team.id === teamId)?.name ?? teamId;
}
