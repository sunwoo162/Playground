import { saveProjectTeamsState } from "./store";
import type { RunProjectRetrospectivesResult } from "./retrospective";
import type { ProjectTeamsState } from "./types";

export function completeProjectRetrospective(
  state: ProjectTeamsState,
  result: RunProjectRetrospectivesResult,
) {
  const project = state.projects.find((item) => item.id === result.projectId);
  if (!project) return state;

  const participantIds = new Set(result.retrospectives.map((item) => item.agentId));
  const proposalCount = result.evolution.playbookChanges.length
    + result.evolution.agentVersionChanges.length;

  const nextState: ProjectTeamsState = {
    ...state,
    projects: state.projects.map((item) =>
      item.id === result.projectId
        ? {
            ...item,
            status: "completed" as const,
            runtimeFailureSource: null,
            runtimeMessage: `Agent 회고 ${result.retrospectives.length}개 및 Team Evolution 제안 ${proposalCount}개 저장 완료 · 프로젝트 아카이브 완료`,
          }
        : item,
    ),
    teams: state.teams.map((team) =>
      team.id === project.teamId
        ? {
            ...team,
            status: "idle" as const,
            activeProjectId: null,
            completedProjects: team.completedProjects + 1,
            agents: team.agents.map((agent) => ({
              ...agent,
              status: "idle" as const,
              retrospectiveCount: participantIds.has(agent.id)
                ? agent.retrospectiveCount + 1
                : agent.retrospectiveCount,
            })),
          }
        : team,
    ),
  };

  saveProjectTeamsState(nextState);
  return nextState;
}
