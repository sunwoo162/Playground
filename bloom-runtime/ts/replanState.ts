import { taskTransitivelyDependsOn } from "./planTopology";
import {
  getPmRecoveryTrigger,
  type ProjectFailureReplanOutcome,
} from "./replanning";
import { saveProjectTeamsState } from "./store";
import type {
  AgentRole,
  ProjectReplanRecord,
  ProjectTaskPlan,
  ProjectTaskRun,
  ProjectTeamsState,
} from "./types";

function emptyRun(task: ProjectTaskPlan, teamId: string): ProjectTaskRun {
  return {
    taskId: task.id,
    role: task.role,
    agentId: `${teamId}:${task.role}`,
    status: "pending",
    attempts: 0,
    branchName: null,
    worktreePath: null,
    threadId: null,
    sessionId: null,
    turnId: null,
    eventsPath: null,
    stderrPath: null,
    commitSha: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    reviewedPullRequests: [],
    summary: null,
    rationaleSummary: null,
    evidence: [],
    verification: [],
    blockers: [],
    lastError: null,
    startedAt: null,
    completedAt: null,
  };
}

function resetRun(run: ProjectTaskRun, task: ProjectTaskPlan, teamId: string): ProjectTaskRun {
  return {
    ...run,
    role: task.role,
    agentId: `${teamId}:${task.role}`,
    status: "pending",
    threadId: null,
    sessionId: null,
    turnId: null,
    eventsPath: null,
    stderrPath: null,
    commitSha: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    reviewedPullRequests: [],
    summary: null,
    rationaleSummary: null,
    evidence: [],
    verification: [],
    blockers: [],
    lastError: null,
    startedAt: null,
    completedAt: null,
  };
}

function roleStatus(role: AgentRole, runs: ProjectTaskRun[]) {
  const roleRuns = runs.filter((run) => run.role === role);
  if (roleRuns.length === 0) return "idle" as const;
  if (roleRuns.some((run) => run.status === "running")) return "working" as const;
  if (roleRuns.some((run) => run.status === "blocked")) return "blocked" as const;
  if (roleRuns.some((run) => run.status === "ready")) return "ready" as const;
  if (roleRuns.every((run) => run.status === "done")) return "done" as const;
  return "idle" as const;
}

function makeReadyWhenDependenciesDone(
  tasks: ProjectTaskPlan[],
  runs: ProjectTaskRun[],
) {
  const runById = new Map(runs.map((run) => [run.taskId, run]));
  const nextRuns = runs.map((run) => ({ ...run }));
  const nextById = new Map(nextRuns.map((run) => [run.taskId, run]));

  for (const task of tasks) {
    const run = nextById.get(task.id);
    if (!run || run.status !== "pending") continue;
    const dependenciesDone = task.dependsOn.every(
      (dependencyId) => runById.get(dependencyId)?.status === "done",
    );
    if (dependenciesDone) run.status = "ready";
  }
  return nextRuns;
}

function syncTeam(
  state: ProjectTeamsState,
  projectId: string,
  pmStatus: "working" | "done" | "blocked",
) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return state;

  return {
    ...state,
    teams: state.teams.map((team) => {
      if (team.id !== project.teamId) return team;
      return {
        ...team,
        status: "working" as const,
        agents: team.agents.map((agent) => {
          if (agent.role === "pm") return { ...agent, status: pmStatus };
          return { ...agent, status: roleStatus(agent.role, project.taskRuns) };
        }),
      };
    }),
  };
}

export function beginProjectFailureReplan(
  state: ProjectTeamsState,
  projectId: string,
) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return state;
  const trigger = getPmRecoveryTrigger(state, project);
  if (!trigger) return state;

  const { route, productOwnerDecision } = trigger;
  const nextAttempt = (project.replanAttempts?.[route.id] ?? 0) + 1;
  const sourceLabel = productOwnerDecision
    ? `Product Owner 결정 ${productOwnerDecision.id}`
    : "Debug Router escalation";
  const nextState: ProjectTeamsState = {
    ...state,
    projects: state.projects.map((item) =>
      item.id === projectId
        ? {
            ...item,
            replanAttempts: {
              ...(item.replanAttempts ?? {}),
              [route.id]: nextAttempt,
            },
            status: "planning",
            runtimeFailureSource: "pm",
            runtimeMessage: `${sourceLabel} · PM Codex 복구 재계획 ${nextAttempt}회차 생성 중`,
          }
        : item,
    ),
  };
  const synced = syncTeam(nextState, projectId, "working");
  saveProjectTeamsState(synced);
  return synced;
}

export function applyProjectFailureReplan(
  state: ProjectTeamsState,
  projectId: string,
  outcome: ProjectFailureReplanOutcome,
) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project?.plan) return state;

  const reopened = new Set(outcome.runtime.proposal.reopenTaskIds);
  const retired = new Set(outcome.runtime.proposal.retireTaskIds);
  const revisedPlan = outcome.revisedPlan;
  const oldRunById = new Map(project.taskRuns.map((run) => [run.taskId, run]));

  const rewind = new Set<string>();
  for (const task of revisedPlan.tasks) {
    if (
      reopened.has(task.id)
      || Array.from(reopened).some((reopenedId) =>
        taskTransitivelyDependsOn(revisedPlan, task.id, reopenedId),
      )
    ) {
      rewind.add(task.id);
    }
  }

  let nextRuns = revisedPlan.tasks.map((task) => {
    const existing = oldRunById.get(task.id);
    if (!existing) return emptyRun(task, project.teamId);
    if (rewind.has(task.id)) return resetRun(existing, task, project.teamId);
    return existing;
  });
  nextRuns = makeReadyWhenDependenciesDone(revisedPlan.tasks, nextRuns);

  const record: ProjectReplanRecord = {
    id: `REPLAN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    triggerRouteId: outcome.triggerRoute.id,
    replanAttempt: outcome.replanAttempt,
    summary: outcome.runtime.proposal.summary,
    rationaleSummary: outcome.runtime.proposal.rationaleSummary,
    retiredTaskIds: Array.from(retired),
    reopenedTaskIds: Array.from(reopened),
    addedTaskIds: outcome.runtime.proposal.newTasks.map((task) => task.id),
    pmSessionId: outcome.runtime.sessionId,
    eventsPath: outcome.runtime.eventsPath,
    outputPath: outcome.runtime.outputPath,
    createdAt: new Date().toISOString(),
  };

  const nextState: ProjectTeamsState = {
    ...state,
    projects: state.projects.map((item) => {
      if (item.id !== projectId) return item;
      return {
        ...item,
        plan: revisedPlan,
        taskRuns: nextRuns,
        replans: [record, ...(item.replans ?? [])],
        pmSessionId: outcome.runtime.sessionId ?? item.pmSessionId,
        status: "development",
        runtimeFailureSource: null,
        runtimeMessage: `PM 복구 재계획 적용 · retire ${record.retiredTaskIds.length} · reopen ${record.reopenedTaskIds.length} · add ${record.addedTaskIds.length} · Agent 실행 재개`,
      };
    }),
  };

  const synced = syncTeam(nextState, projectId, "done");
  saveProjectTeamsState(synced);
  return synced;
}

export function failProjectFailureReplan(
  state: ProjectTeamsState,
  projectId: string,
  reason: string,
) {
  const nextState: ProjectTeamsState = {
    ...state,
    projects: state.projects.map((project) =>
      project.id === projectId
        ? {
            ...project,
            status: "blocked",
            runtimeFailureSource: "pm",
            runtimeMessage: `PM 복구 재계획 실패 · ${reason}`,
          }
        : project,
    ),
  };
  const synced = syncTeam(nextState, projectId, "blocked");
  saveProjectTeamsState(synced);
  return synced;
}
