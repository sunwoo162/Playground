import { saveProjectTeamsState } from "./store";
import { selectIdleTeamForProject } from "./teamAllocation";
import { ensureTeamPerformanceProfiles } from "./teamPerformance";
import type {
  ProjectIntakeRecord,
  ProjectState,
  ProjectTeamsState,
} from "./types";

export type StartProjectWithIntakeResult =
  | { ok: true; state: ProjectTeamsState; project: ProjectState }
  | { ok: false; state: ProjectTeamsState; message: string };

function createProjectId() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PROJECT-${time}-${random}`;
}

export function startProjectWithIntake(
  state: ProjectTeamsState,
  request: string,
  intake: ProjectIntakeRecord,
): StartProjectWithIntakeResult {
  const normalizedRequest = request.trim();
  if (!normalizedRequest) {
    return { ok: false, state, message: "프로젝트 요구사항을 입력해 주세요." };
  }

  const profiledState = ensureTeamPerformanceProfiles(state);
  const allocation = selectIdleTeamForProject(profiledState, intake);
  if (!allocation) {
    return { ok: false, state: profiledState, message: "현재 대기 중인 팀이 없습니다." };
  }

  const { team } = allocation;
  const project: ProjectState = {
    id: createProjectId(),
    request: normalizedRequest,
    teamId: team.id,
    status: "queued",
    createdAt: new Date().toISOString(),
    intake,
    teamAllocation: allocation.record,
    authPolicyId: "bouquet",
    executionPolicyId: "iseol-workflow",
    autonomyPolicyId: "independent-agent",
    decisionPolicyId: "reasoned-agent-decisions",
    documentationPolicyId: "documentation-evidence",
    qualityPolicyId: "production-service",
    deploymentPolicyId: "luna-apps-portal",
    plan: null,
    taskRuns: [],
    repositoryFullName: null,
    workspacePath: null,
    pmSessionId: null,
    runtimeFailureSource: null,
    runtimeMessage: `Organization Intake 완료 · ${intake.complexity} · 팀 배정 완료 · ${allocation.record.reason} · PM Codex 실행 준비`,
  };

  const nextState: ProjectTeamsState = {
    ...profiledState,
    intakeAgentVersion: intake.agentVersion,
    projects: [project, ...profiledState.projects],
    teams: profiledState.teams.map((currentTeam) => {
      if (currentTeam.id !== team.id) return currentTeam;
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
