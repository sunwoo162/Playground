import { validateProjectPlanReviewTopology } from "./planTopology";
import { replanProjectFailure } from "./runtime";
import type {
  FailureRouteRecord,
  ProjectPlan,
  ProjectState,
  ProjectTeamsState,
} from "./types";

const MAX_REPLAN_ATTEMPTS = 3;
const MAX_AGENT_ATTEMPTS = 3;

function latestPmEscalation(project: ProjectState) {
  return (project.failureRoutes ?? []).find(
    (route) => route.route === "escalate-pm",
  ) ?? null;
}

function replanAttempt(project: ProjectState, route: FailureRouteRecord) {
  return (project.replans ?? []).filter(
    (record) => record.triggerRouteId === route.id,
  ).length + 1;
}

function hasExternalArtifacts(run: ProjectState["taskRuns"][number] | undefined) {
  return Boolean(
    run?.branchName
      || run?.commitSha
      || run?.pullRequestNumber
      || run?.pullRequestUrl,
  );
}

function composeRevisedPlan(
  plan: ProjectPlan,
  retireTaskIds: string[],
  newTasks: ProjectPlan["tasks"],
) {
  const retired = new Set(retireTaskIds);
  const revisedPlan: ProjectPlan = {
    ...plan,
    tasks: [
      ...plan.tasks.filter((task) => !retired.has(task.id)),
      ...newTasks,
    ],
  };
  validateProjectPlanReviewTopology(revisedPlan);
  return revisedPlan;
}

export type ProjectFailureReplanOutcome = {
  revisedPlan: ProjectPlan;
  triggerRoute: FailureRouteRecord;
  replanAttempt: number;
  runtime: Awaited<ReturnType<typeof replanProjectFailure>>;
};

export async function runProjectFailureReplan(
  state: ProjectTeamsState,
  projectId: string,
): Promise<ProjectFailureReplanOutcome> {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project?.plan || !project.repositoryFullName || !project.workspacePath) {
    throw new Error("PM 복구 재계획에 필요한 Project 계획/repository/workspace가 없습니다.");
  }

  const route = latestPmEscalation(project);
  if (!route) {
    throw new Error("PM 복구 재계획을 요청한 Debug Router escalation이 없습니다.");
  }

  const attempt = replanAttempt(project, route);
  if (attempt > MAX_REPLAN_ATTEMPTS) {
    throw new Error(`PM 복구 재계획 한도(${MAX_REPLAN_ATTEMPTS})에 도달했습니다.`);
  }

  const team = state.teams.find((item) => item.id === project.teamId);
  if (!team) {
    throw new Error(`PM 복구 재계획 Team을 찾을 수 없습니다: ${project.teamId}`);
  }

  const runByTaskId = new Map(project.taskRuns.map((run) => [run.taskId, run]));
  const currentTasks = project.plan.tasks.map((task) => {
    const run = runByTaskId.get(task.id);
    return {
      ...task,
      status: run?.status ?? "pending",
      attempts: run?.attempts ?? 0,
      hasArtifacts: hasExternalArtifacts(run),
    };
  });

  const retirableTaskIds = project.plan.tasks
    .filter((task) => {
      const run = runByTaskId.get(task.id);
      return Boolean(run && run.status !== "done" && !hasExternalArtifacts(run));
    })
    .map((task) => task.id);

  const reopenableTaskIds = project.plan.tasks
    .filter((task) => {
      const run = runByTaskId.get(task.id);
      return Boolean(
        run
          && task.role !== "debug-router"
          && run.attempts < MAX_AGENT_ATTEMPTS,
      );
    })
    .map((task) => task.id);

  const runtime = await replanProjectFailure({
    projectId: project.id,
    teamId: project.teamId,
    teamName: team.name,
    repositoryFullName: project.repositoryFullName,
    workspacePath: project.workspacePath,
    userRequest: project.request,
    productSummary: project.plan.productSummary,
    architectureSummary: project.plan.architectureSummary,
    failureRoute: {
      id: route.id,
      failedTaskId: route.failedTaskId,
      failedRole: route.failedRole,
      failureType: route.failureType,
      severity: route.severity,
      summary: route.summary,
      rationaleSummary: route.rationaleSummary,
      evidence: route.evidence,
      recommendedAction: route.recommendedAction,
    },
    currentTasks,
    retirableTaskIds,
    reopenableTaskIds,
    replanAttempt: attempt,
  });

  if (runtime.triggerRouteId !== route.id || runtime.projectId !== project.id) {
    throw new Error("PM replan Runtime 결과가 현재 Project/Failure Route와 일치하지 않습니다.");
  }

  const revisedPlan = composeRevisedPlan(
    project.plan,
    runtime.proposal.retireTaskIds,
    runtime.proposal.newTasks,
  );

  return {
    revisedPlan,
    triggerRoute: route,
    replanAttempt: attempt,
    runtime,
  };
}
