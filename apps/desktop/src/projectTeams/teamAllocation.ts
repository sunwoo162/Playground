import type {
  ExecutableAgentRole,
  ProjectIntakeRecord,
  ProjectState,
  ProjectTeamsState,
  TeamAllocationEvidence,
  TeamAllocationRecord,
  TeamState,
} from "./types";

const MAX_ASSIGNMENT_GAP_FOR_EVIDENCE = 1;

type TeamAllocationCandidate = {
  team: TeamState;
  assignmentCount: number;
  lastAssignedAt: string | null;
  catalogIndex: number;
  establishedStrengthMatches: TeamAllocationEvidence[];
};

export type TeamAllocationSelection = {
  team: TeamState;
  record: TeamAllocationRecord;
};

function timestampOrNever(value: string | null | undefined) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function assignmentsForTeam(projects: ProjectState[], teamId: TeamState["id"]) {
  return projects
    .filter((project) => project.teamId === teamId)
    .sort((left, right) => timestampOrNever(right.createdAt) - timestampOrNever(left.createdAt));
}

function compareFairness(left: TeamAllocationCandidate, right: TeamAllocationCandidate) {
  if (left.assignmentCount !== right.assignmentCount) {
    return left.assignmentCount - right.assignmentCount;
  }

  const leftTime = timestampOrNever(left.lastAssignedAt);
  const rightTime = timestampOrNever(right.lastAssignedAt);
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.catalogIndex - right.catalogIndex;
}

function totalAdvantage(candidate: TeamAllocationCandidate) {
  return candidate.establishedStrengthMatches.reduce((sum, evidence) => sum + evidence.advantage, 0);
}

function compareEvidenceThenFairness(
  left: TeamAllocationCandidate,
  right: TeamAllocationCandidate,
) {
  if (left.establishedStrengthMatches.length !== right.establishedStrengthMatches.length) {
    return right.establishedStrengthMatches.length - left.establishedStrengthMatches.length;
  }

  const advantageDelta = totalAdvantage(right) - totalAdvantage(left);
  if (Math.abs(advantageDelta) > Number.EPSILON) {
    return advantageDelta;
  }

  return compareFairness(left, right);
}

function consideredRolesForIntake(intake: ProjectIntakeRecord | null | undefined) {
  if (!intake) return [];
  const source = intake.criticalRoles.length > 0 ? intake.criticalRoles : intake.requiredRoles;
  return Array.from(new Set(source)) as ExecutableAgentRole[];
}

function establishedStrengthMatches(team: TeamState, roles: ExecutableAgentRole[]) {
  if (roles.length === 0) return [];
  const roleSet = new Set(roles);
  return (team.performanceProfile?.strengths ?? [])
    .filter((strength) => strength.confidence === "established" && roleSet.has(strength.role))
    .map((strength) => ({
      role: strength.role,
      advantage: strength.advantage,
      taskCount: strength.taskCount,
    }))
    .sort((left, right) => right.advantage - left.advantage || right.taskCount - left.taskCount);
}

function idleCandidates(state: ProjectTeamsState, roles: ExecutableAgentRole[]) {
  return state.teams
    .map((team, catalogIndex): TeamAllocationCandidate | null => {
      if (team.status !== "idle" || team.activeProjectId) return null;
      const assignments = assignmentsForTeam(state.projects, team.id);
      return {
        team,
        assignmentCount: assignments.length,
        lastAssignedAt: assignments[0]?.createdAt ?? null,
        catalogIndex,
        establishedStrengthMatches: establishedStrengthMatches(team, roles),
      };
    })
    .filter((candidate): candidate is TeamAllocationCandidate => candidate !== null);
}

function legacyFairSelection(candidates: TeamAllocationCandidate[]) {
  return [...candidates].sort(compareFairness)[0] ?? null;
}

export function selectIdleTeamForProject(
  state: ProjectTeamsState,
  intake?: ProjectIntakeRecord | null,
): TeamAllocationSelection | null {
  const consideredRoles = consideredRolesForIntake(intake);
  const candidates = idleCandidates(state, consideredRoles);
  if (candidates.length === 0) return null;

  if (!intake) {
    const selected = legacyFairSelection(candidates);
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

  const minimumAssignments = Math.min(...candidates.map((candidate) => candidate.assignmentCount));
  const fairnessPool = candidates.filter(
    (candidate) => candidate.assignmentCount <= minimumAssignments + MAX_ASSIGNMENT_GAP_FOR_EVIDENCE,
  );
  const hasEstablishedEvidence = fairnessPool.some(
    (candidate) => candidate.establishedStrengthMatches.length > 0,
  );
  const selected = hasEstablishedEvidence
    ? [...fairnessPool].sort(compareEvidenceThenFairness)[0]
    : legacyFairSelection(fairnessPool);
  if (!selected) return null;

  const lastAssigned = selected.lastAssignedAt
    ? `마지막 배정 ${selected.lastAssignedAt}`
    : "이전 배정 없음";
  const evidenceSummary = selected.establishedStrengthMatches.length > 0
    ? selected.establishedStrengthMatches
      .map((evidence) => `${evidence.role}(우위 ${evidence.advantage.toFixed(2)}, ${evidence.taskCount} tasks)`)
      .join(", ")
    : "관련 established 강점 없음";
  const allocationBasis = hasEstablishedEvidence
    ? `공정성 허용 범위 안에서 Intake 핵심 역할의 검증된 성과 evidence를 우선 비교`
    : `검증된 관련 강점 evidence가 없어 기존 공정 배정 기준을 적용`;

  return {
    team: selected.team,
    record: {
      strategy: "fairness-guarded-evidence",
      assignmentCountBefore: selected.assignmentCount,
      completedProjectsBefore: selected.team.completedProjects,
      lastAssignedAt: selected.lastAssignedAt,
      intakeId: intake.id,
      consideredRoles,
      establishedStrengthMatches: selected.establishedStrengthMatches,
      fairnessPoolSize: fairnessPool.length,
      maxAssignmentGap: MAX_ASSIGNMENT_GAP_FOR_EVIDENCE,
      reason: `${allocationBasis} · 고려 역할 ${consideredRoles.join(", ") || "없음"} · ${evidenceSummary} · 기존 배정 ${selected.assignmentCount}회 · ${lastAssigned} · evidence 때문에 최소 배정 팀보다 ${MAX_ASSIGNMENT_GAP_FOR_EVIDENCE}회를 초과해 앞선 팀은 선택하지 않음`,
    },
  };
}
