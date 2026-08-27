import { saveProjectTeamsState } from "./store";
import type { ProjectTeamsState } from "./types";

export function markProjectIntegrated(
  state: ProjectTeamsState,
  projectId: string,
  mergedPullRequestNumbers: number[],
) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return state;

  const mergedLabel = mergedPullRequestNumbers.length > 0
    ? mergedPullRequestNumbers.map((number) => `#${number}`).join(", ")
    : "없음";

  const nextState: ProjectTeamsState = {
    ...state,
    projects: state.projects.map((item) =>
      item.id === projectId
        ? {
            ...item,
            status: "retrospective" as const,
            runtimeFailureSource: null,
            runtimeMessage: `develop PR 통합 완료 (${mergedLabel}) · Agent 회고/Team Evolution Runtime 연결 대기`,
          }
        : item,
    ),
    teams: state.teams.map((team) =>
      team.id === project.teamId
        ? {
            ...team,
            status: "retrospective" as const,
          }
        : team,
    ),
  };

  saveProjectTeamsState(nextState);
  return nextState;
}
