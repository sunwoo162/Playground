import type { AgentRole, ProjectState } from "./types";

const REQUIRED_REVIEW_ROLES: AgentRole[] = ["code-review", "reviewer", "qa"];

export type ProjectMergeGate =
  | { ready: true; pullRequestNumbers: number[] }
  | { ready: false; pullRequestNumbers: number[]; reasons: string[] };

export function evaluateProjectMergeGate(project: ProjectState): ProjectMergeGate {
  const reasons: string[] = [];
  const unfinished = project.taskRuns.filter((run) => run.status !== "done");
  if (unfinished.length > 0) {
    reasons.push(`완료되지 않은 Agent Task가 ${unfinished.length}개 있습니다.`);
  }

  const pullRequestNumbers = Array.from(
    new Set(
      project.taskRuns
        .map((run) => run.pullRequestNumber)
        .filter((number): number is number => typeof number === "number"),
    ),
  ).sort((a, b) => a - b);

  if (pullRequestNumbers.length === 0) {
    reasons.push("통합할 Agent PR이 없습니다.");
  }

  for (const role of REQUIRED_REVIEW_ROLES) {
    const completedRuns = project.taskRuns.filter(
      (run) => run.role === role && run.status === "done",
    );
    if (completedRuns.length === 0) {
      reasons.push(`${role} Agent의 완료된 검증 결과가 없습니다.`);
      continue;
    }

    for (const pullRequestNumber of pullRequestNumbers) {
      const reviewed = completedRuns.some((run) =>
        run.reviewedPullRequests.includes(pullRequestNumber),
      );
      if (!reviewed) {
        reasons.push(`${role} Agent가 PR #${pullRequestNumber}를 직접 검증한 증거가 없습니다.`);
      }
    }

    const failedVerification = completedRuns.flatMap((run) =>
      run.verification.filter((verification) =>
        verification.status === "failed" || verification.status === "blocked",
      ),
    );
    if (failedVerification.length > 0) {
      reasons.push(`${role} Agent 검증에 failed/blocked 결과가 남아 있습니다.`);
    }
  }

  if (reasons.length > 0) {
    return { ready: false, pullRequestNumbers, reasons };
  }

  return { ready: true, pullRequestNumbers };
}
