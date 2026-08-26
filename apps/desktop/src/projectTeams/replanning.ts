import {
  ensureMarketingDocumentationPlan,
  isMandatoryMarketingTask,
} from "./dataMarketing";
import { validateProjectPlanReviewTopology } from "./planTopology";
import { getProductOwnerDecision } from "./productOwnerDecision";
import { replanProjectFailure } from "./runtime";
import { seniorAgentContext } from "./seniorAgent";
import type {
  AgentDecision,
  FailureRouteRecord,
  ProjectPlan,
  ProjectState,
  ProjectTeamsState,
} from "./types";

const MAX_REPLAN_ATTEMPTS = 3;
const MAX_AGENT_ATTEMPTS = 3;

export type PmRecoveryTrigger = {
  route: FailureRouteRecord;
  productOwnerDecision: AgentDecision | null;
};

export function getPmRecoveryTrigger(
  state: ProjectTeamsState,
  project: ProjectState,
): PmRecoveryTrigger | null {
  const route = project.failureRoutes?.[0] ?? null;
  if (!route) return null;

  if (route.route === "escalate-pm") {
    return { route, productOwnerDecision: null };
  }

  if (route.route === "needs-human") {
    const decision = getProductOwnerDecision(state, project.id, route.id);
    if (decision) {
      return { route, productOwnerDecision: decision };
    }
  }

  return null;
}

function replanAttempt(project: ProjectState, route: FailureRouteRecord) {
  const trackedAttempt = project.replanAttempts?.[route.id];
  if (trackedAttempt !== undefined) return trackedAttempt;
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
  const rawPlan: ProjectPlan = {
    ...plan,
    tasks: [
      ...plan.tasks.filter((task) => !retired.has(task.id)),
      ...newTasks,
    ],
  };
  const revisedPlan = ensureMarketingDocumentationPlan(rawPlan);
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

  const trigger = getPmRecoveryTrigger(state, project);
  if (!trigger) {
    throw new Error("PM 복구 재계획 trigger가 없거나 Product Owner 결정이 아직 기록되지 않았습니다.");
  }

  const { route, productOwnerDecision } = trigger;
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
      return Boolean(
        run
          && !isMandatoryMarketingTask(task)
          && run.status !== "done"
          && !hasExternalArtifacts(run),
      );
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

  const productOwnerEvidence = productOwnerDecision
    ? [
        `Product Owner decision ${productOwnerDecision.id}: ${productOwnerDecision.rationaleSummary}`,
      ]
    : [];
  const runtime = await replanProjectFailure({
    projectId: project.id,
    teamId: project.teamId,
    teamName: team.name,
    repositoryFullName: project.repositoryFullName,
    workspacePath: project.workspacePath,
    userRequest: `${project.request}\n\n${seniorAgentContext("pm")}`,
    productSummary: project.plan.productSummary,
    architectureSummary: project.plan.architectureSummary,
    failureRoute: {
      id: route.id,
      failedTaskId: route.failedTaskId,
      failedRole: route.failedRole,
      failureType: route.failureType,
      severity: route.severity,
      summary: route.summary,
      rationaleSummary: productOwnerDecision
        ? `${route.rationaleSummary} Product Owner가 명시적으로 결정했습니다: ${productOwnerDecision.rationaleSummary}`
        : route.rationaleSummary,
      evidence: [...route.evidence, ...productOwnerEvidence],
      recommendedAction: productOwnerDecision
        ? `Product Owner 결정에 맞춰 복구 계획을 작성하세요: ${productOwnerDecision.rationaleSummary}. 기존 Router 요청: ${route.recommendedAction}`
        : route.recommendedAction,
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
