import { applyAgentReconciliation, getInterruptedAgentCandidates } from "./reconciliationState";
import { reconcileAgentTask, type ReconcileAgentTaskResult } from "./runtime";
import { loadProjectTeamsState } from "./store";

export type StartupReconciliationSummary = {
  changed: boolean;
  completed: number;
  retried: number;
  blocked: number;
};

export async function reconcileInterruptedAgentsOnStartup(): Promise<StartupReconciliationSummary> {
  let state = loadProjectTeamsState();
  const candidates = getInterruptedAgentCandidates(state);
  const summary: StartupReconciliationSummary = {
    changed: false,
    completed: 0,
    retried: 0,
    blocked: 0,
  };

  for (const candidate of candidates) {
    const project = state.projects.find((item) => item.id === candidate.projectId);
    const taskRun = project?.taskRuns.find((run) => run.taskId === candidate.taskId);
    const taskPlan = project?.plan?.tasks.find((task) => task.id === candidate.taskId);

    let result: ReconcileAgentTaskResult;
    if (!project || !taskRun || !taskPlan || !project.repositoryFullName || !project.workspacePath) {
      result = {
        outcome: "blocked",
        message: "중단된 Agent Task의 repository/workspace/plan 메타데이터가 부족해 자동 복구할 수 없습니다.",
        recovered: null,
      };
    } else {
      try {
        result = await reconcileAgentTask({
          projectId: project.id,
          teamId: project.teamId,
          role: taskRun.role,
          agentId: taskRun.agentId,
          taskId: taskRun.taskId,
          taskSlug: taskPlan.taskSlug,
          repositoryFullName: project.repositoryFullName,
          workspacePath: project.workspacePath,
        });
      } catch (error) {
        result = {
          outcome: "blocked",
          message: `Agent Runtime reconciliation 호출 실패: ${error instanceof Error ? error.message : String(error)}`,
          recovered: null,
        };
      }
    }

    state = applyAgentReconciliation(
      state,
      candidate.projectId,
      candidate.taskId,
      result,
    );
    summary.changed = true;
    if (result.outcome === "completed") summary.completed += 1;
    else if (result.outcome === "retry") summary.retried += 1;
    else summary.blocked += 1;
  }

  return summary;
}
