import type {
  ProjectState,
  ProjectTeamsState,
  TeamAllocationRecord,
  TeamState,
} from "./types";

type TeamAllocationCandidate = {
  team: TeamState;
  assignmentCount: number;
  lastAssignedAt: string | null;
  catalogIndex: number;
};

export type TeamAllocationSelection = {
  team: TeamState;
  record: TeamAllocationRecord;
};

function assignmentsForTeam(projects: ProjectState[], teamId: TeamState["id"]) {
  return projects
    .filter((project) => project.teamId === teamId)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function compareCandidates(left: TeamAllocationCandidate, right: TeamAllocationCandidate) {
  if (left.assignmentCount !== right.assignmentCount) {
    return left.assignmentCount - right.assignmentCount;
  }

  const leftTime = left.lastAssignedAt ? Date.parse(left.lastAssignedAt) : Number.NEGATIVE_INFINITY;
  const rightTime = right.lastAssignedAt ? Date.parse(right.lastAssignedAt) : Number.NEGATIVE_INFINITY;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  if (left.team.completedProjects !== right.team.completedProjects) {
    return left.team.completedProjects - right.team.completedProjects;
  }

  return left.catalogIndex - right.catalogIndex;
}

export function selectIdleTeamForProject(state: ProjectTeamsState): TeamAllocationSelection | null {
  const candidates = state.teams
    .map((team, catalogIndex): TeamAllocationCandidate | null => {
      if (team.status !== "idle" || team.activeProjectId) return null;
      const assignments = assignmentsForTeam(state.projects, team.id);
      return {
        team,
        assignmentCount: assignments.length,
        lastAssignedAt: assignments[0]?.createdAt ?? null,
        catalogIndex,
      };
    })
    .filter((candidate): candidate is TeamAllocationCandidate => candidate !== null)
    .sort(compareCandidates);

  const selected = candidates[0];
  if (!selected) return null;

  const lastAssigned = selected.lastAssignedAt
    ? `마지막 배정 ${selected.lastAssignedAt}`
    : "이전 배정 없음";

  return {
    team: selected.team,
    record: {
      strategy: "least-assigned-oldest-idle",
      assignmentCountBefore: selected.assignmentCount,
      completedProjectsBefore: selected.team.completedProjects,
      lastAssignedAt: selected.lastAssignedAt,
      reason: `대기 팀 중 누적 배정 횟수가 가장 적고, 동률이면 가장 오래 배정되지 않은 팀을 선택 · 기존 배정 ${selected.assignmentCount}회 · ${lastAssigned}`,
    },
  };
}
