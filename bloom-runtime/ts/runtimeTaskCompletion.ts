import {
  evaluateRuntimeTaskCompletion,
  type RuntimeCompletionObservations,
} from "./runtimeCompletionAdapter";
import type { AgentTaskVerification, ProjectPlan, ProjectTaskRun } from "./types";

export type RuntimeTaskReportLike = {
  status: "completed" | "blocked";
  summary: string;
  rationaleSummary: string;
  evidence: string[];
  verification: AgentTaskVerification[];
  commitSha: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  reviewedPullRequests: number[];
  blockers: string[];
};

export type RuntimeTaskRunResultLike = {
  taskId: string;
  role: string;
  agentId: string;
  branchName: string | null;
  worktreePath: string;
  threadId: string;
  sessionId: string;
  turnId: string;
  eventsPath: string;
  stderrPath: string;  report: RuntimeTaskReportLike;
  completionObservations?: RuntimeCompletionObservations | null;
};

export type ApplyRuntimeCompletionInput = {
  run: ProjectTaskRun;
  result: RuntimeTaskRunResultLike;
  declaredDependencyPullRequests: readonly number[];
  completedAt: string;
};

function applyResultMetadata(
  run: ProjectTaskRun,
  result: RuntimeTaskRunResultLike,
  status: ProjectTaskRun["status"],
  lastError: string | null,
  completedAt: string,
): ProjectTaskRun {
  const hasRepositoryPublication = Boolean(result.branchName?.trim());
  return {
    ...run,
    status,
    branchName: result.branchName,
    worktreePath: result.worktreePath,
    threadId: result.threadId,
    sessionId: result.sessionId,
    turnId: result.turnId,
    eventsPath: result.eventsPath,
    stderrPath: result.stderrPath,    commitSha: hasRepositoryPublication ? result.report.commitSha : null,
    pullRequestNumber: hasRepositoryPublication ? result.report.pullRequestNumber : null,
    pullRequestUrl: hasRepositoryPublication ? result.report.pullRequestUrl : null,
    reviewedPullRequests: result.report.reviewedPullRequests,
    summary: result.report.summary,
    rationaleSummary: result.report.rationaleSummary,
    evidence: result.report.evidence,
    verification: result.report.verification,
    blockers: result.report.blockers,
    lastError,
    completedAt,
  };
}

export function applyRuntimeCompletionToTaskRun(
  input: ApplyRuntimeCompletionInput,
): ProjectTaskRun {
  if (input.result.report.status === "blocked") {
    return applyResultMetadata(
      input.run,
      input.result,
      "blocked",
      input.result.report.blockers.join(" · ") || input.result.report.summary,
      input.completedAt,
    );
  }

  const decision = evaluateRuntimeTaskCompletion({
    taskId: input.run.taskId,
    role: input.run.role,    report: {
      status: input.result.report.status,
      summary: input.result.report.summary,
      blockers: input.result.report.blockers,
      reviewedPullRequests: input.result.report.reviewedPullRequests,
    },
    completionObservations: input.result.completionObservations,
    declaredDependencyPullRequests: input.declaredDependencyPullRequests,
  });

  return applyResultMetadata(
    input.run,
    input.result,
    decision.accepted ? "done" : "blocked",
    decision.accepted ? null : decision.rejectionReason,
    input.completedAt,
  );
}

export function declaredDependencyPullRequestsForTask(
  plan: ProjectPlan,
  taskRuns: readonly ProjectTaskRun[],
  taskId: string,
): number[] {
  const task = plan.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Bloom runtime completion task is missing from plan: ${taskId}`);
  const tasksById = new Map(plan.tasks.map((item) => [item.id, item] as const));
  const runsById = new Map(taskRuns.map((run) => [run.taskId, run] as const));
  const visited = new Set<string>();
  const stack = [...task.dependsOn];
  const pullRequests: number[] = [];

  while (stack.length > 0) {
    const dependencyId = stack.pop();
    if (!dependencyId || visited.has(dependencyId)) continue;
    visited.add(dependencyId);
    const pullRequestNumber = runsById.get(dependencyId)?.pullRequestNumber ?? null;
    if (pullRequestNumber !== null) pullRequests.push(pullRequestNumber);
    stack.push(...(tasksById.get(dependencyId)?.dependsOn ?? []));
  }

  return [...new Set(pullRequests)].sort((a, b) => a - b);
}