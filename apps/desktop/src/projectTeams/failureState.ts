import { taskTransitivelyDependsOn } from "./planTopology";
import { saveProjectTeamsState } from "./store";
import type {
  AgentRole,
  FailureRouteRecord,
  ProjectTaskRun,
  ProjectTeamsState,
} from "./types";

const MAX_TASK_ATTEMPTS = 3;

function roleStatus(role: AgentRole, runs: ProjectTaskRun[]) {
  const roleRuns = runs.filter((run) => run.role === role);
  if (roleRuns.length === 0) return "idle" as const;
  if (roleRuns.some((run) => run.status === "running")) return "working" as const;
  if (roleRuns.some((run) => run.status === "blocked")) return "blocked" as const;
  if (roleRuns.some((run) => run.status === "ready")) return "ready" as const;
  if (roleRuns.every((run) => run.status === "done")) return "done" as const;
  return "idle" as const;
}

function syncTeam(state: ProjectTeamsState, projectId: string, debugStatus?: "working" | "done" | "blocked") {
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
          if (agent.role === "pm") {
            return { ...agent, status: project.plan ? "done" as const : agent.status };
          }
          if (agent.role === "debug-router" && debugStatus) {
            return { ...agent, status: debugStatus };
          }
          return { ...agent, status: roleStatus(agent.role, project.taskRuns) };
        }),
      };
    }),
  };
}

export function beginFailureRouting(state: ProjectTeamsState, projectId: string, taskId: string) {
  const nextState: ProjectTeamsState = {
    ...state,
    projects: state.projects.map((project) =>
      project.id === projectId
        ? {
            ...project,
            status: "blocked",
            runtimeFailureSource: "agent",
            runtimeMessage: `${taskId} 실패 · Debug / Problem Router Agent가 원인과 담당 Agent를 독립 분석 중`,
          }
        : project,
    ),
  };

  const synced = syncTeam(nextState, projectId, "working");
  saveProjectTeamsState(synced);
  return synced;
}

function clearedRun(run: ProjectTaskRun, teamId: string, canonicalRole: ProjectTaskRun["role"], status: "ready" | "pending") {
  return {
    ...run,
    role: canonicalRole,
    agentId: `${teamId}:${canonicalRole}`,
    status,
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

export function applyFailureRoute(
  state: ProjectTeamsState,
  projectId: string,
  route: FailureRouteRecord,
) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project?.plan) return state;

  const failureRoutes = [route, ...(project.failureRoutes ?? [])];

  if (route.route !== "retry-owner" || !route.ownerTaskId || !route.ownerRole) {
    const nextState: ProjectTeamsState = {
      ...state,
      projects: state.projects.map((item) =>
        item.id === projectId
          ? {
              ...item,
              failureRoutes,
              status: "blocked",
              runtimeFailureSource: "agent",
              runtimeMessage: route.route === "needs-human"
                ? `Debug Router 판단: Product Owner 결정 필요 · ${route.recommendedAction}`
                : `Debug Router 판단: PM 재계획 필요 · ${route.recommendedAction}`,
            }
          : item,
      ),
    };
    const synced = syncTeam(nextState, projectId, "done");
    saveProjectTeamsState(synced);
    return synced;
  }

  const ownerTask = project.plan.tasks.find((task) => task.id === route.ownerTaskId);
  const ownerRun = project.taskRuns.find((run) => run.taskId === route.ownerTaskId);
  if (!ownerTask || !ownerRun || ownerTask.role !== route.ownerRole) {
    const nextState: ProjectTeamsState = {
      ...state,
      projects: state.projects.map((item) =>
        item.id === projectId
          ? {
              ...item,
              failureRoutes,
              status: "blocked",
              runtimeFailureSource: "agent",
              runtimeMessage: `Debug Router 결과 검증 실패 · owner ${route.ownerTaskId} [${route.ownerRole}]를 현재 PM 계획에서 확인할 수 없습니다.`,
            }
          : item,
      ),
    };
    const synced = syncTeam(nextState, projectId, "blocked");
    saveProjectTeamsState(synced);
    return synced;
  }

  if (ownerRun.attempts >= MAX_TASK_ATTEMPTS) {
    const nextState: ProjectTeamsState = {
      ...state,
      projects: state.projects.map((item) =>
        item.id === projectId
          ? {
              ...item,
              failureRoutes,
              status: "blocked",
              runtimeFailureSource: "agent",
              runtimeMessage: `${route.ownerTaskId} Agent가 자동 실행 한도(${MAX_TASK_ATTEMPTS})에 도달했습니다 · PM/사용자 결정 필요`,
            }
          : item,
      ),
    };
    const synced = syncTeam(nextState, projectId, "done");
    saveProjectTeamsState(synced);
    return synced;
  }

  const rewindTaskIds = new Set(
    project.plan.tasks
      .filter((task) =>
        task.id === ownerTask.id
        || taskTransitivelyDependsOn(project.plan!, task.id, ownerTask.id),
      )
      .map((task) => task.id),
  );

  const taskById = new Map(project.plan.tasks.map((task) => [task.id, task]));
  const nextState: ProjectTeamsState = {
    ...state,
    projects: state.projects.map((item) => {
      if (item.id !== projectId) return item;
      return {
        ...item,
        failureRoutes,
        status: "development",
        runtimeFailureSource: null,
        runtimeMessage: `Debug Router → ${ownerTask.id} ${ownerTask.role} Agent로 복구 라우팅 · downstream ${Math.max(0, rewindTaskIds.size - 1)}개 Task 재검증 예정`,
        taskRuns: item.taskRuns.map((run) => {
          if (!rewindTaskIds.has(run.taskId)) return run;
          const canonicalTask = taskById.get(run.taskId);
          if (!canonicalTask) return run;
          return clearedRun(
            run,
            item.teamId,
            canonicalTask.role,
            run.taskId === ownerTask.id ? "ready" : "pending",
          );
        }),
      };
    }),
  };

  const synced = syncTeam(nextState, projectId, "done");
  saveProjectTeamsState(synced);
  return synced;
}

export function failFailureRouting(
  state: ProjectTeamsState,
  projectId: string,
  taskId: string,
  reason: string,
) {
  const nextState: ProjectTeamsState = {
    ...state,
    projects: state.projects.map((project) =>
      project.id === projectId
        ? {
            ...project,
            status: "blocked",
            runtimeFailureSource: "agent",
            runtimeMessage: `${taskId} Debug Router Runtime 실패 · ${reason}`,
          }
        : project,
    ),
  };

  const synced = syncTeam(nextState, projectId, "blocked");
  saveProjectTeamsState(synced);
  return synced;
}
