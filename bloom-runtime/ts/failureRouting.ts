import { taskTransitivelyDependsOn } from "./planTopology";
import { routeAgentFailure } from "./runtime";
import { seniorAgentContext } from "./seniorAgent";
import type { FailureRouteRecord, ProjectState, ProjectTeamsState } from "./types";

const MAX_ROUTE_ATTEMPTS = 3;

function projectById(state: ProjectTeamsState, projectId: string) {
  return state.projects.find((project) => project.id === projectId) ?? null;
}

function teamName(state: ProjectTeamsState, project: ProjectState) {
  return state.teams.find((team) => team.id === project.teamId)?.name ?? project.teamId;
}

function routes(project: ProjectState) {
  return project.failureRoutes ?? [];
}

function routeAttempt(project: ProjectState, taskId: string) {
  return routes(project).filter((route) => route.failedTaskId === taskId).length + 1;
}

function candidateOwners(project: ProjectState, failedTaskId: string) {
  if (!project.plan) return [];
  const failedTask = project.plan.tasks.find((task) => task.id === failedTaskId);
  if (!failedTask) return [];

  const candidates = project.plan.tasks.filter((task) => {
    if (task.id === failedTaskId) return true;
    if (task.role === "debug-router") return false;
    return taskTransitivelyDependsOn(project.plan!, failedTaskId, task.id);
  });

  return candidates.map((task) => ({
    taskId: task.id,
    role: task.role,
    title: task.title,
    summary: task.summary,
  }));
}

export function latestFailureRoute(project: ProjectState, ownerTaskId: string) {
  return routes(project).find(
    (route) => route.route === "retry-owner" && route.ownerTaskId === ownerTaskId,
  ) ?? null;
}

export function failureRecoveryContext(project: ProjectState, ownerTaskId: string) {
  const route = latestFailureRoute(project, ownerTaskId);
  if (!route) return null;

  const evidence = route.evidence.length > 0
    ? route.evidence.map((item) => `- ${item}`).join("\n")
    : "- 별도 증거 없음";

  return [
    `Debug Router recovery route ${route.id}`,
    `원래 실패 Task: ${route.failedTaskId} [${route.failedRole}]`,
    `분류: ${route.failureType} / ${route.severity}`,
    `진단: ${route.summary}`,
    `권장 조치: ${route.recommendedAction}`,
    "근거:",
    evidence,
    "이 진단은 참고 증거이며 권위가 아닙니다. 실제 repository/PR/test 상태를 독립적으로 다시 확인하세요.",
  ].join("\n");
}

export async function diagnoseBlockedTask(
  state: ProjectTeamsState,
  projectId: string,
  taskId: string,
) {
  const project = projectById(state, projectId);
  if (!project?.plan || !project.repositoryFullName || !project.workspacePath) {
    throw new Error("Failure Router에 필요한 PM 계획/repository/workspace가 없습니다.");
  }

  const run = project.taskRuns.find((item) => item.taskId === taskId);
  const task = project.plan.tasks.find((item) => item.id === taskId);
  if (!run || !task || run.status !== "blocked") {
    throw new Error(`Failure Router 대상 blocked Task를 찾을 수 없습니다: ${taskId}`);
  }

  const attempt = routeAttempt(project, taskId);
  if (attempt > MAX_ROUTE_ATTEMPTS) {
    throw new Error(`Failure Router 자동 라우팅 한도(${MAX_ROUTE_ATTEMPTS})에 도달했습니다.`);
  }

  const owners = candidateOwners(project, taskId);
  if (owners.length === 0) {
    throw new Error(`${taskId} 실패를 라우팅할 owner 후보가 없습니다.`);
  }

  const joinedBlockers = run.blockers.join(" · ").trim();
  const failureReason = run.lastError?.trim()
    || joinedBlockers
    || run.summary?.trim()
    || "Agent가 blocked 상태를 반환했지만 구체적인 실패 원인을 남기지 않았습니다.";

  return routeAgentFailure({
    projectId: project.id,
    teamId: project.teamId,
    teamName: teamName(state, project),
    repositoryFullName: project.repositoryFullName,
    workspacePath: project.workspacePath,
    failedTaskId: task.id,
    failedRole: run.role,
    failureReason: `${failureReason}\n\n${seniorAgentContext("debug-router")}`,
    blockers: run.blockers,
    verification: run.verification,
    candidateOwners: owners,
    routeAttempt: attempt,
  });
}

export function toFailureRouteRecord(
  project: ProjectState,
  result: Awaited<ReturnType<typeof diagnoseBlockedTask>>,
): FailureRouteRecord {
  const failedRun = project.taskRuns.find((run) => run.taskId === result.failedTaskId);
  if (!failedRun) {
    throw new Error(`Failure Router 기록 대상 Task를 찾을 수 없습니다: ${result.failedTaskId}`);
  }

  return {
    id: `ROUTE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    failedTaskId: result.failedTaskId,
    failedRole: failedRun.role,
    routeAttempt: routeAttempt(project, result.failedTaskId),
    routerAgentId: result.routerAgentId,
    routerSessionId: result.sessionId,
    eventsPath: result.eventsPath,
    outputPath: result.outputPath,
    createdAt: new Date().toISOString(),
    ...result.decision,
  };
}
