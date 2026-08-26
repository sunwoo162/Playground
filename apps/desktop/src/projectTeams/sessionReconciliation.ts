import { invoke } from "@tauri-apps/api/core";

import { classifyInterruptedTaskRecovery } from "./sessionReconciliationPolicy";
import { completeAgentTask, failAgentTask } from "./store";
import type { AgentTaskRunResult } from "./runtime";
import type { ProjectTeamsState } from "./types";

const STORAGE_KEY = "luna.project-teams.v1";
const RECONCILIATION_PREFIX = "Agent session reconciliation";

export type ReconcileInterruptedAgentTaskInput = {
  projectId: string;
  teamId: string;
  role: string;
  agentId: string;
  taskId: string;
  taskSlug: string;
  repositoryFullName: string;
  workspacePath: string;
};

export type ReconcileInterruptedAgentTaskResult = {
  outcome: "recovered" | "blocked";
  reason: string;
  result: AgentTaskRunResult | null;
};

export type StartupAgentReconciliationSummary = {
  attempted: number;
  recovered: number;
  blocked: number;
};

function readStoredState(): ProjectTeamsState | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as ProjectTeamsState;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.projects) || !Array.isArray(parsed.teams)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function reconciliationFailureReason(reason: string) {
  return `${RECONCILIATION_PREFIX} · ${reason}`;
}

export async function reconcileInterruptedAgentTasksAtStartup(): Promise<StartupAgentReconciliationSummary> {
  let state = readStoredState();
  const summary: StartupAgentReconciliationSummary = {
    attempted: 0,
    recovered: 0,
    blocked: 0,
  };
  if (!state) return summary;

  const interrupted = state.projects.flatMap((project) =>
    project.taskRuns
      .filter((run) => run.status === "running")
      .map((run) => ({ projectId: project.id, taskId: run.taskId })),
  );

  for (const interruptedTask of interrupted) {
    const project = state.projects.find((candidate) => candidate.id === interruptedTask.projectId);
    const run = project?.taskRuns.find((candidate) => candidate.taskId === interruptedTask.taskId);
    if (!project || !run || run.status !== "running") continue;

    const policy = classifyInterruptedTaskRecovery(project, run);
    if (policy.action === "ignore") continue;
    summary.attempted += 1;

    if (policy.action === "block") {
      state = failAgentTask(
        state,
        project.id,
        run.taskId,
        reconciliationFailureReason(policy.reason),
      );
      summary.blocked += 1;
      continue;
    }

    try {
      const result = await invoke<ReconcileInterruptedAgentTaskResult>(
        "reconcile_interrupted_agent_task",
        {
          input: {
            projectId: project.id,
            teamId: project.teamId,
            role: run.role,
            agentId: run.agentId,
            taskId: run.taskId,
            taskSlug: policy.taskSlug,
            repositoryFullName: project.repositoryFullName,
            workspacePath: project.workspacePath,
          } satisfies ReconcileInterruptedAgentTaskInput,
        },
      );

      if (result.outcome === "recovered" && result.result) {
        state = completeAgentTask(state, result.result);
        summary.recovered += 1;
        continue;
      }

      state = failAgentTask(
        state,
        project.id,
        run.taskId,
        reconciliationFailureReason(result.reason || "완료 증거를 복구하지 못했습니다."),
      );
      summary.blocked += 1;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      state = failAgentTask(
        state,
        project.id,
        run.taskId,
        reconciliationFailureReason(`Runtime 검증 실패: ${detail}`),
      );
      summary.blocked += 1;
    }
  }

  return summary;
}
