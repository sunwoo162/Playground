import type { ProjectState, ProjectTaskRun } from "./types";

export type InterruptedTaskRecoveryPolicy =
  | { action: "ignore"; reason: string }
  | { action: "block"; reason: string }
  | {
      action: "reconcile";
      taskSlug: string;
      reason: string;
    };

export function classifyInterruptedTaskRecovery(
  project: ProjectState,
  run: ProjectTaskRun,
): InterruptedTaskRecoveryPolicy {
  if (run.status !== "running") {
    return { action: "ignore", reason: "Task가 running 상태가 아님" };
  }
  if (!project.plan) {
    return { action: "block", reason: "PM plan metadata가 없어 중단 Task를 재조정할 수 없음" };
  }
  if (!project.repositoryFullName?.trim() || !project.workspacePath?.trim()) {
    return { action: "block", reason: "repository/workspace metadata가 없어 중단 Task를 재조정할 수 없음" };
  }

  const task = project.plan.tasks.find((candidate) => candidate.id === run.taskId);
  if (!task) {
    return { action: "block", reason: "running Task에 대응하는 PM task metadata가 없음" };
  }
  if (task.role !== run.role) {
    return { action: "block", reason: "running Task role과 PM plan role이 일치하지 않음" };
  }
  if (!task.taskSlug.trim()) {
    return { action: "block", reason: "running Task slug가 비어 있음" };
  }

  return {
    action: "reconcile",
    taskSlug: task.taskSlug,
    reason: "running Task와 repository/session 복구에 필요한 metadata가 준비됨",
  };
}
