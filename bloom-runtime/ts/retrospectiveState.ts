import {
  createEvolutionExperimentCandidate,
  finalizeActiveEvolutionExperiment,
} from "./evolutionExperiments";
import { saveProjectTeamsState } from "./store";
import { refreshTeamPerformanceProfiles } from "./teamPerformance";
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
  const completedAt = new Date().toISOString();

  let nextState: ProjectTeamsState = {
    ...state,
    projects: state.projects.map((item) =>
      item.id === result.projectId
        ? {
            ...item,
            status: "completed" as const,
            completedAt,
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

  nextState = finalizeActiveEvolutionExperiment(nextState, result.projectId);
  nextState = createEvolutionExperimentCandidate(nextState, result);
  nextState = refreshTeamPerformanceProfiles(nextState, completedAt);

  const stagedExperiment = (nextState.evolutionExperiments ?? []).find(
    (experiment) => experiment.sourceProjectId === result.projectId && experiment.status === "proposed",
  );
  if (stagedExperiment) {
    nextState = {
      ...nextState,
      projects: nextState.projects.map((item) =>
        item.id === result.projectId
          ? {
              ...item,
              runtimeMessage: `${item.runtimeMessage} · 다음 프로젝트 Team Evolution 실험 ${stagedExperiment.id} 준비 완료`,
            }
          : item,
      ),
    };
  }

  saveProjectTeamsState(nextState);
  return nextState;
}
