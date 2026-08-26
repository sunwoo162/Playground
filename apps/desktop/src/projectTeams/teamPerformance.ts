import type {
  AgentRole,
  ProjectState,
  ProjectTeamsState,
  TeamId,
  TeamPerformanceProfile,
  TeamRolePerformance,
  TeamStrengthEvidence,
} from "./types";

type ExecutableRole = Exclude<AgentRole, "pm">;

const MIN_PEER_TEAMS = 2;
const MIN_PEER_TASKS = 3;
const MIN_EMERGING_PROJECTS = 2;
const MIN_EMERGING_TASKS = 4;
const MIN_ESTABLISHED_PROJECTS = 3;
const MIN_ESTABLISHED_TASKS = 6;
const MIN_ISSUE_RATE_ADVANTAGE = 0.15;

function completedProjectsForTeam(state: ProjectTeamsState, teamId: TeamId) {
  return state.projects.filter(
    (project) => project.teamId === teamId && project.status === "completed",
  );
}

function roundRate(value: number) {
  return Number(value.toFixed(4));
}

function aggregateRolePerformance(
  projects: ProjectState[],
  role: ExecutableRole,
): TeamRolePerformance | null {
  const relevantProjects = projects.filter((project) =>
    project.taskRuns.some((run) => run.role === role),
  );
  const runs = relevantProjects.flatMap((project) =>
    project.taskRuns.filter((run) => run.role === role),
  );
  if (runs.length === 0) return null;

  const retryCount = runs.reduce(
    (sum, run) => sum + Math.max(0, run.attempts - 1),
    0,
  );
  const routedFailureCount = relevantProjects.reduce(
    (sum, project) => sum + (project.failureRoutes ?? []).filter((route) => route.failedRole === role).length,
    0,
  );
  const verificationIssueCount = runs.reduce(
    (sum, run) => sum + run.verification.filter(
      (verification) => verification.status === "failed" || verification.status === "blocked",
    ).length,
    0,
  );
  const taskCount = runs.length;

  return {
    role,
    projectCount: relevantProjects.length,
    taskCount,
    retryCount,
    routedFailureCount,
    verificationIssueCount,
    retryRate: roundRate(retryCount / taskCount),
    failureRate: roundRate(routedFailureCount / taskCount),
    verificationIssueRate: roundRate(verificationIssueCount / taskCount),
    issueRate: roundRate((retryCount + routedFailureCount + verificationIssueCount) / taskCount),
  };
}

function allMeasuredRoles(projects: ProjectState[]) {
  return Array.from(new Set(
    projects.flatMap((project) => project.taskRuns.map((run) => run.role)),
  ));
}

function rawRoleProfiles(state: ProjectTeamsState) {
  return new Map(
    state.teams.map((team) => {
      const projects = completedProjectsForTeam(state, team.id);
      const roles = allMeasuredRoles(projects);
      const rolePerformance = roles.flatMap((role) => {
        const metrics = aggregateRolePerformance(projects, role);
        return metrics ? [metrics] : [];
      });
      return [team.id, { projects, rolePerformance }] as const;
    }),
  );
}

function peerIssueRate(
  state: ProjectTeamsState,
  profiles: ReturnType<typeof rawRoleProfiles>,
  teamId: TeamId,
  role: ExecutableRole,
) {
  const peers = state.teams.flatMap((team) => {
    if (team.id === teamId) return [];
    const metrics = profiles.get(team.id)?.rolePerformance.find((item) => item.role === role);
    if (!metrics || metrics.taskCount < MIN_PEER_TASKS) return [];
    return [metrics];
  });

  if (peers.length < MIN_PEER_TEAMS) return null;

  const taskCount = peers.reduce((sum, metrics) => sum + metrics.taskCount, 0);
  const issueCount = peers.reduce(
    (sum, metrics) => sum
      + metrics.retryCount
      + metrics.routedFailureCount
      + metrics.verificationIssueCount,
    0,
  );
  return {
    peerTeamCount: peers.length,
    issueRate: roundRate(issueCount / Math.max(1, taskCount)),
  };
}

function strengthEvidence(
  state: ProjectTeamsState,
  profiles: ReturnType<typeof rawRoleProfiles>,
  teamId: TeamId,
  metrics: TeamRolePerformance,
): TeamStrengthEvidence | null {
  const peer = peerIssueRate(state, profiles, teamId, metrics.role);
  if (!peer) return null;

  const established = metrics.projectCount >= MIN_ESTABLISHED_PROJECTS
    && metrics.taskCount >= MIN_ESTABLISHED_TASKS;
  const emerging = metrics.projectCount >= MIN_EMERGING_PROJECTS
    && metrics.taskCount >= MIN_EMERGING_TASKS;
  if (!established && !emerging) return null;

  const advantage = roundRate(peer.issueRate - metrics.issueRate);
  if (advantage < MIN_ISSUE_RATE_ADVANTAGE) return null;

  const confidence = established ? "established" as const : "emerging" as const;
  return {
    role: metrics.role,
    confidence,
    projectCount: metrics.projectCount,
    taskCount: metrics.taskCount,
    teamIssueRate: metrics.issueRate,
    peerIssueRate: peer.issueRate,
    advantage,
    reason: `${metrics.role} 실행에서 ${metrics.projectCount}개 프로젝트 / ${metrics.taskCount}개 Task 근거가 있고, 동일 역할을 수행한 ${peer.peerTeamCount}개 동급 팀보다 issue rate가 ${advantage.toFixed(2)} 낮음`,
  };
}

export function buildTeamPerformanceProfiles(
  state: ProjectTeamsState,
  updatedAt = new Date().toISOString(),
) {
  const profiles = rawRoleProfiles(state);
  return new Map<TeamId, TeamPerformanceProfile>(
    state.teams.map((team) => {
      const raw = profiles.get(team.id) ?? { projects: [], rolePerformance: [] };
      const strengths = raw.rolePerformance
        .flatMap((metrics) => {
          const evidence = strengthEvidence(state, profiles, team.id, metrics);
          return evidence ? [evidence] : [];
        })
        .sort((left, right) => right.advantage - left.advantage || right.taskCount - left.taskCount);

      return [team.id, {
        measuredProjectCount: raw.projects.length,
        rolePerformance: raw.rolePerformance,
        strengths,
        updatedAt,
      }];
    }),
  );
}

export function refreshTeamPerformanceProfiles(
  state: ProjectTeamsState,
  updatedAt = new Date().toISOString(),
): ProjectTeamsState {
  const profiles = buildTeamPerformanceProfiles(state, updatedAt);
  return {
    ...state,
    teams: state.teams.map((team) => ({
      ...team,
      performanceProfile: profiles.get(team.id) ?? null,
    })),
  };
}

export function ensureTeamPerformanceProfiles(state: ProjectTeamsState) {
  const completedProjects = state.projects.filter((project) => project.status === "completed");
  if (completedProjects.length === 0) return state;

  const needsRefresh = state.teams.some((team) => {
    const measuredProjectCount = completedProjects.filter((project) => project.teamId === team.id).length;
    return !team.performanceProfile
      || team.performanceProfile.measuredProjectCount !== measuredProjectCount
      || !Array.isArray(team.performanceProfile.rolePerformance)
      || !Array.isArray(team.performanceProfile.strengths);
  });
  if (!needsRefresh) return state;

  const latestEvidenceAt = completedProjects.reduce((latest, project) => {
    const candidate = project.completedAt ?? project.createdAt;
    if (!latest) return candidate;
    return Date.parse(candidate) > Date.parse(latest) ? candidate : latest;
  }, "");

  return refreshTeamPerformanceProfiles(
    state,
    latestEvidenceAt || new Date().toISOString(),
  );
}
