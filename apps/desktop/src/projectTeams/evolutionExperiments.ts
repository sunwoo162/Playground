import type { RunProjectRetrospectivesResult } from "./retrospective";
import type {
  EvolutionExperiment,
  EvolutionMetrics,
  EvolutionVersionSnapshot,
  ProjectState,
  ProjectTeamsState,
  TeamState,
} from "./types";

const REWORK_RATE_TOLERANCE = 0.15;
const FAILURE_RATE_TOLERANCE = 0.1;
const VERIFICATION_RATE_TOLERANCE = 0.1;
const REPLAN_RATE_TOLERANCE = 0.1;

function experimentId() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EVOLUTION-${time}-${random}`;
}

function parseSemver(version: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  return match.slice(1).map(Number) as [number, number, number];
}

function compareSemver(left: string, right: string) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function bumpMinor(version: string) {
  const parsed = parseSemver(version);
  if (!parsed) return version;
  return `${parsed[0]}.${parsed[1] + 1}.0`;
}

export function snapshotTeamVersions(team: TeamState): EvolutionVersionSnapshot {
  return {
    playbookVersion: team.playbookVersion,
    agentVersions: Object.fromEntries(team.agents.map((agent) => [agent.id, agent.version])),
  };
}

export function collectEvolutionMetrics(project: ProjectState): EvolutionMetrics {
  const totalAttempts = project.taskRuns.reduce((sum, run) => sum + run.attempts, 0);
  const retryCount = project.taskRuns.reduce(
    (sum, run) => sum + Math.max(0, run.attempts - 1),
    0,
  );
  const failedVerificationCount = project.taskRuns.reduce(
    (sum, run) => sum + run.verification.filter((item) => item.status === "failed").length,
    0,
  );
  const blockedVerificationCount = project.taskRuns.reduce(
    (sum, run) => sum + run.verification.filter((item) => item.status === "blocked").length,
    0,
  );

  return {
    taskCount: project.taskRuns.length,
    totalAttempts,
    retryCount,
    failureRouteCount: project.failureRoutes?.length ?? 0,
    replanCount: project.replans?.length ?? 0,
    failedVerificationCount,
    blockedVerificationCount,
  };
}

function rate(value: number, taskCount: number) {
  return value / Math.max(1, taskCount);
}

function metricSummary(metrics: EvolutionMetrics) {
  return [
    `tasks=${metrics.taskCount}`,
    `retryRate=${rate(metrics.retryCount, metrics.taskCount).toFixed(2)}`,
    `failureRate=${rate(metrics.failureRouteCount, metrics.taskCount).toFixed(2)}`,
    `verificationIssueRate=${rate(
      metrics.failedVerificationCount + metrics.blockedVerificationCount,
      metrics.taskCount,
    ).toFixed(2)}`,
    `replanRate=${rate(metrics.replanCount, metrics.taskCount).toFixed(2)}`,
  ].join(", ");
}

function experimentRegressions(baseline: EvolutionMetrics, current: EvolutionMetrics) {
  const regressions: string[] = [];
  const baselineTasks = Math.max(1, baseline.taskCount);
  const currentTasks = Math.max(1, current.taskCount);

  const reworkDelta = rate(current.retryCount, currentTasks) - rate(baseline.retryCount, baselineTasks);
  if (reworkDelta > REWORK_RATE_TOLERANCE) {
    regressions.push(`retry rate +${reworkDelta.toFixed(2)}`);
  }

  const failureDelta = rate(current.failureRouteCount, currentTasks)
    - rate(baseline.failureRouteCount, baselineTasks);
  if (failureDelta > FAILURE_RATE_TOLERANCE) {
    regressions.push(`failure route rate +${failureDelta.toFixed(2)}`);
  }

  const baselineVerificationIssues = baseline.failedVerificationCount + baseline.blockedVerificationCount;
  const currentVerificationIssues = current.failedVerificationCount + current.blockedVerificationCount;
  const verificationDelta = rate(currentVerificationIssues, currentTasks)
    - rate(baselineVerificationIssues, baselineTasks);
  if (verificationDelta > VERIFICATION_RATE_TOLERANCE) {
    regressions.push(`verification issue rate +${verificationDelta.toFixed(2)}`);
  }

  const replanDelta = rate(current.replanCount, currentTasks) - rate(baseline.replanCount, baselineTasks);
  if (replanDelta > REPLAN_RATE_TOLERANCE) {
    regressions.push(`replan rate +${replanDelta.toFixed(2)}`);
  }

  return regressions;
}

export function createEvolutionExperimentCandidate(
  state: ProjectTeamsState,
  result: RunProjectRetrospectivesResult,
) {
  const project = state.projects.find((item) => item.id === result.projectId);
  const team = state.teams.find((item) => item.id === result.teamId);
  if (!project || !team) return state;

  const existingPending = (state.evolutionExperiments ?? []).some(
    (experiment) => experiment.teamId === team.id && experiment.status === "proposed",
  );
  if (existingPending) return state;

  const sourceSnapshot = project.versionSnapshot ?? snapshotTeamVersions(team);
  const baseline = snapshotTeamVersions(team);
  const candidateAgentVersions = { ...baseline.agentVersions };
  const agentChanges = result.evolution.agentVersionChanges.flatMap((proposal) => {
    const agent = team.agents.find((item) => item.id === proposal.agentId);
    if (!agent) return [];

    const projectVersion = sourceSnapshot.agentVersions[agent.id] ?? agent.version;
    if (proposal.currentVersion !== projectVersion) return [];

    const recommendedComparison = compareSemver(proposal.recommendedVersion, agent.version);
    const toVersion = recommendedComparison !== null && recommendedComparison > 0
      ? proposal.recommendedVersion
      : bumpMinor(agent.version);
    if (toVersion === agent.version) return [];

    const instructionChanges = (proposal.instructionChanges ?? [])
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 8);
    if (instructionChanges.length === 0) return [];

    candidateAgentVersions[agent.id] = toVersion;
    return [{
      agentId: agent.id,
      fromVersion: agent.version,
      toVersion,
      reason: proposal.reason,
      instructionChanges,
    }];
  });

  const playbookChanges = result.evolution.playbookChanges
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (playbookChanges.length === 0 && agentChanges.length === 0) return state;

  const experiment: EvolutionExperiment = {
    id: experimentId(),
    teamId: team.id,
    sourceProjectId: project.id,
    targetProjectId: null,
    status: "proposed",
    playbookChanges,
    agentChanges,
    baseline,
    candidate: {
      playbookVersion: playbookChanges.length > 0
        ? bumpMinor(baseline.playbookVersion)
        : baseline.playbookVersion,
      agentVersions: candidateAgentVersions,
    },
    baselineMetrics: collectEvolutionMetrics(project),
    experimentMetrics: null,
    verdictReason: null,
    createdAt: new Date().toISOString(),
    activatedAt: null,
    completedAt: null,
  };

  return {
    ...state,
    evolutionExperiments: [experiment, ...(state.evolutionExperiments ?? [])],
  };
}

export function activatePendingEvolutionExperiment(
  state: ProjectTeamsState,
  teamId: TeamState["id"],
  projectId: string,
) {
  const experiment = (state.evolutionExperiments ?? []).find(
    (item) => item.teamId === teamId && item.status === "proposed",
  );
  if (!experiment) {
    const team = state.teams.find((item) => item.id === teamId);
    if (!team) return state;
    const snapshot = snapshotTeamVersions(team);
    return {
      ...state,
      projects: state.projects.map((project) =>
        project.id === projectId
          ? { ...project, evolutionExperimentId: null, versionSnapshot: snapshot }
          : project,
      ),
    };
  }

  const activatedAt = new Date().toISOString();
  return {
    ...state,
    evolutionExperiments: (state.evolutionExperiments ?? []).map((item) =>
      item.id === experiment.id
        ? { ...item, status: "active" as const, targetProjectId: projectId, activatedAt }
        : item,
    ),
    teams: state.teams.map((team) =>
      team.id === teamId
        ? {
            ...team,
            playbookVersion: experiment.candidate.playbookVersion,
            agents: team.agents.map((agent) => ({
              ...agent,
              version: experiment.candidate.agentVersions[agent.id] ?? agent.version,
            })),
          }
        : team,
    ),
    projects: state.projects.map((project) =>
      project.id === projectId
        ? {
            ...project,
            evolutionExperimentId: experiment.id,
            versionSnapshot: experiment.candidate,
            runtimeMessage: `팀 배정 완료 · Team Evolution 실험 ${experiment.id} 적용 · PM Codex 실행 준비`,
          }
        : project,
    ),
  };
}

export function getProjectEvolutionInstructions(
  state: ProjectTeamsState,
  project: ProjectState,
  agentId: string,
) {
  if (!project.evolutionExperimentId) return null;
  const experiment = (state.evolutionExperiments ?? []).find(
    (item) => item.id === project.evolutionExperimentId
      && item.status === "active"
      && item.targetProjectId === project.id,
  );
  if (!experiment) return null;

  const agentChange = experiment.agentChanges.find((item) => item.agentId === agentId) ?? null;
  return {
    experimentId: experiment.id,
    playbookVersion: experiment.candidate.playbookVersion,
    playbookChanges: experiment.playbookChanges,
    agentInstructions: agentChange?.instructionChanges ?? [],
  };
}

export function finalizeActiveEvolutionExperiment(
  state: ProjectTeamsState,
  projectId: string,
) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project?.evolutionExperimentId) return state;
  const experiment = (state.evolutionExperiments ?? []).find(
    (item) => item.id === project.evolutionExperimentId
      && item.status === "active"
      && item.targetProjectId === project.id,
  );
  if (!experiment) return state;

  const metrics = collectEvolutionMetrics(project);
  const regressions = experimentRegressions(experiment.baselineMetrics, metrics);
  const keep = regressions.length === 0;
  const verdictReason = keep
    ? `비열등성 기준 통과 · baseline(${metricSummary(experiment.baselineMetrics)}) · experiment(${metricSummary(metrics)})`
    : `허용 범위를 넘는 회귀 감지: ${regressions.join(", ")} · baseline(${metricSummary(experiment.baselineMetrics)}) · experiment(${metricSummary(metrics)})`;
  const completedAt = new Date().toISOString();

  return {
    ...state,
    evolutionExperiments: (state.evolutionExperiments ?? []).map((item) =>
      item.id === experiment.id
        ? {
            ...item,
            status: keep ? "kept" as const : "rolled-back" as const,
            experimentMetrics: metrics,
            verdictReason,
            completedAt,
          }
        : item,
    ),
    teams: state.teams.map((team) => {
      if (team.id !== experiment.teamId) return team;
      const snapshot = keep ? experiment.candidate : experiment.baseline;
      return {
        ...team,
        playbookVersion: snapshot.playbookVersion,
        agents: team.agents.map((agent) => ({
          ...agent,
          version: snapshot.agentVersions[agent.id] ?? agent.version,
        })),
      };
    }),
    projects: state.projects.map((item) =>
      item.id === project.id
        ? {
            ...item,
            runtimeMessage: `${item.runtimeMessage} · Team Evolution 실험 ${keep ? "유지" : "롤백"}: ${verdictReason}`,
          }
        : item,
    ),
  };
}
