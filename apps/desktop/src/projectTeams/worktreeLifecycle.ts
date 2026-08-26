import { invoke } from "@tauri-apps/api/core";

import { classifyWorktreeCleanupTask } from "./worktreeLifecyclePolicy";
import type { AgentTaskVerification, ProjectState, ProjectTaskRun } from "./types";

export type WorktreeCleanupTaskInput = {
  taskId: string;
  role: ProjectTaskRun["role"];
  status: ProjectTaskRun["status"];
  branchName: string | null;
  worktreePath: string;
  commitSha: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  threadId: string | null;
  sessionId: string | null;
  turnId: string | null;
  evidence: string[];
  verification: AgentTaskVerification[];
};

export type WorktreeCleanupSkip = {
  taskId: string;
  reason: string;
};

export type CleanupProjectWorktreesResult = {
  archivePath: string | null;
  removedTaskIds: string[];
  alreadyAbsentTaskIds: string[];
  skipped: WorktreeCleanupSkip[];
  pruned: boolean;
};

function toRuntimeTask(task: ProjectTaskRun): WorktreeCleanupTaskInput {
  return {
    taskId: task.taskId,
    role: task.role,
    status: task.status,
    branchName: task.branchName,
    worktreePath: task.worktreePath ?? "",
    commitSha: task.commitSha,
    pullRequestNumber: task.pullRequestNumber,
    pullRequestUrl: task.pullRequestUrl,
    threadId: task.threadId,
    sessionId: task.sessionId,
    turnId: task.turnId,
    evidence: task.evidence,
    verification: task.verification,
  };
}

export function buildProjectWorktreeCleanupPlan(project: ProjectState) {
  const tasks: WorktreeCleanupTaskInput[] = [];
  const skipped: WorktreeCleanupSkip[] = [];

  project.taskRuns.forEach((task) => {
    const policy = classifyWorktreeCleanupTask(task);
    if (policy.action === "cleanup") {
      tasks.push(toRuntimeTask(task));
    } else if (policy.action === "skip") {
      skipped.push({ taskId: task.taskId, reason: policy.reason });
    }
  });

  return { tasks, skipped };
}

export async function cleanupProjectWorktrees(
  project: ProjectState,
): Promise<CleanupProjectWorktreesResult> {
  if (!project.repositoryFullName || !project.workspacePath) {
    return {
      archivePath: null,
      removedTaskIds: [],
      alreadyAbsentTaskIds: [],
      skipped: [{
        taskId: project.id,
        reason: "Project repository/workspace metadata가 없어 worktree 정리를 실행하지 않았습니다.",
      }],
      pruned: false,
    };
  }

  const plan = buildProjectWorktreeCleanupPlan(project);
  if (plan.tasks.length === 0) {
    return {
      archivePath: null,
      removedTaskIds: [],
      alreadyAbsentTaskIds: [],
      skipped: plan.skipped,
      pruned: false,
    };
  }

  const result = await invoke<CleanupProjectWorktreesResult>("cleanup_project_worktrees", {
    input: {
      projectId: project.id,
      repositoryFullName: project.repositoryFullName,
      workspacePath: project.workspacePath,
      tasks: plan.tasks,
    },
  });

  return {
    ...result,
    skipped: [...plan.skipped, ...result.skipped],
  };
}

export function summarizeWorktreeCleanup(result: CleanupProjectWorktreesResult) {
  const removed = result.removedTaskIds.length;
  const absent = result.alreadyAbsentTaskIds.length;
  const skipped = result.skipped.length;
  const parts = [`worktree 제거 ${removed}`];
  if (absent > 0) parts.push(`이미 없음 ${absent}`);
  if (skipped > 0) parts.push(`보존/스킵 ${skipped}`);
  if (result.pruned) parts.push("registry prune 완료");
  return parts.join(" · ");
}
