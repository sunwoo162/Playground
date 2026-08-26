import {
  REPOSITORY_WRITER_ROLES,
  taskTransitivelyDependsOn,
} from "./planTopology";
import type { AgentRole, ProjectState, ProjectTaskRun } from "./types";

export type ProjectMergeGate =
  | { ready: true; pullRequestNumbers: number[] }
  | { ready: false; pullRequestNumbers: number[]; reasons: string[] };

function verificationPassed(run: ProjectTaskRun) {
  return !run.verification.some(
    (verification) => verification.status === "failed" || verification.status === "blocked",
  );
}

function cleanReviewRuns(
  project: ProjectState,
  role: Extract<AgentRole, "code-review" | "reviewer" | "qa">,
  pullRequestNumber: number,
) {
  return project.taskRuns.filter(
    (run) =>
      run.role === role
      && run.status === "done"
      && run.reviewedPullRequests.includes(pullRequestNumber)
      && verificationPassed(run),
  );
}

export function evaluateProjectMergeGate(project: ProjectState): ProjectMergeGate {
  const reasons: string[] = [];
  const unfinished = project.taskRuns.filter((run) => run.status !== "done");
  if (unfinished.length > 0) {
    reasons.push(`완료되지 않은 Agent Task가 ${unfinished.length}개 있습니다.`);
  }

  if (!project.plan) {
    return {
      ready: false,
      pullRequestNumbers: [],
      reasons: [...reasons, "PM 계획이 없어 PR 검증 경로를 확인할 수 없습니다."],
    };
  }

  const writerRuns = project.taskRuns.filter((run) =>
    REPOSITORY_WRITER_ROLES.includes(run.role),
  );

  for (const run of writerRuns) {
    if (run.status === "done" && run.pullRequestNumber === null) {
      reasons.push(`${run.taskId}(${run.role})가 완료됐지만 PR 번호가 없습니다.`);
    }
  }

  const pullRequestRuns = writerRuns.filter(
    (run): run is ProjectTaskRun & { pullRequestNumber: number } =>
      typeof run.pullRequestNumber === "number",
  );
  const pullRequestNumbers = Array.from(
    new Set(pullRequestRuns.map((run) => run.pullRequestNumber)),
  ).sort((a, b) => a - b);

  if (pullRequestNumbers.length === 0) {
    reasons.push("통합할 Agent PR이 없습니다.");
  }

  for (const ownerRun of pullRequestRuns) {
    const pullRequestNumber = ownerRun.pullRequestNumber;
    const codeReviews = cleanReviewRuns(project, "code-review", pullRequestNumber).filter((run) =>
      taskTransitivelyDependsOn(project.plan!, run.taskId, ownerRun.taskId),
    );

    if (codeReviews.length === 0) {
      reasons.push(
        `PR #${pullRequestNumber}(${ownerRun.taskId}) 이후 Code Review Agent의 유효한 검증 증거가 없습니다.`,
      );
      continue;
    }

    const reviewers = cleanReviewRuns(project, "reviewer", pullRequestNumber).filter((run) =>
      codeReviews.some((codeReview) =>
        taskTransitivelyDependsOn(project.plan!, run.taskId, codeReview.taskId),
      ),
    );

    if (reviewers.length === 0) {
      reasons.push(
        `PR #${pullRequestNumber}(${ownerRun.taskId})의 Code Review 이후 Reviewer Agent 검증이 없습니다.`,
      );
      continue;
    }

    const qaRuns = cleanReviewRuns(project, "qa", pullRequestNumber).filter((run) =>
      reviewers.some((reviewer) =>
        taskTransitivelyDependsOn(project.plan!, run.taskId, reviewer.taskId),
      ),
    );

    if (qaRuns.length === 0) {
      reasons.push(
        `PR #${pullRequestNumber}(${ownerRun.taskId})의 Reviewer 이후 QA Agent 검증이 없습니다.`,
      );
    }
  }

  if (reasons.length > 0) {
    return { ready: false, pullRequestNumbers, reasons };
  }

  return { ready: true, pullRequestNumbers };
}
