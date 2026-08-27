import type { ProjectTaskRun } from "./types";

const REPOSITORY_WRITER_ROLES = new Set([
  "design-system",
  "designer",
  "frontend",
  "backend",
  "data-marketing",
  "documentation",
  "debug-router",
]);

export type WorktreeCleanupPolicyResult =
  | { action: "ignore"; reason: string }
  | { action: "skip"; reason: string }
  | { action: "cleanup"; reason: string };

export function isRepositoryWriterCleanupRole(role: ProjectTaskRun["role"]) {
  return REPOSITORY_WRITER_ROLES.has(role);
}

export function classifyWorktreeCleanupTask(
  task: Pick<
    ProjectTaskRun,
    "status" | "role" | "worktreePath" | "branchName" | "commitSha" | "pullRequestNumber"
  >,
): WorktreeCleanupPolicyResult {
  if (!task.worktreePath?.trim()) {
    return { action: "ignore", reason: "worktree metadata 없음" };
  }
  if (task.status !== "done") {
    return { action: "skip", reason: "Task가 done 상태가 아님" };
  }

  if (isRepositoryWriterCleanupRole(task.role)) {
    if (!task.branchName?.trim()) {
      return { action: "skip", reason: "repository writer branch evidence 없음" };
    }
    if (!task.commitSha?.trim()) {
      return { action: "skip", reason: "repository writer commit evidence 없음" };
    }
    if (!task.pullRequestNumber) {
      return { action: "skip", reason: "repository writer PR evidence 없음" };
    }
  } else if (task.branchName) {
    return { action: "skip", reason: "읽기/검증 Agent에 예상하지 않은 branch metadata가 있음" };
  }

  return { action: "cleanup", reason: "완료 Task worktree 정리 후보" };
}
