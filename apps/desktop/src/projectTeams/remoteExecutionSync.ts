import { markProjectIntegrated } from "./integrationState";
import {
  getRemoteRunnerJob,
  type RemoteRunnerJob,
  type RemoteRunnerSettings,
} from "./remoteRunner";
import {
  getRemoteExecution,
  updateRemoteExecution,
  type RemoteExecutionRecord,
} from "./remoteExecutionState";
import { completeAgentTask } from "./store";
import type { ProjectTeamsState } from "./types";

export type RemoteExecutionSyncResult = {
  state: ProjectTeamsState;
  job: RemoteRunnerJob;
  record: RemoteExecutionRecord | null;
  appliedTaskCount: number;
  integrationApplied: boolean;
};

export function applyRemoteJobResult(
  state: ProjectTeamsState,
  job: RemoteRunnerJob,
): { state: ProjectTeamsState; appliedTaskCount: number; integrationApplied: boolean } {
  if (job.status !== "succeeded" || !job.result) {
    return { state, appliedTaskCount: 0, integrationApplied: false };
  }

  let nextState = state;
  let appliedTaskCount = 0;
  for (const result of job.result.taskResults) {
    const project = nextState.projects.find((item) => item.id === result.projectId);
    const run = project?.taskRuns.find((item) => item.taskId === result.taskId);
    if (!project || !run) continue;

    const sameCompletedResult =
      run.status === "done"
      && run.commitSha === result.report.commitSha
      && run.pullRequestNumber === result.report.pullRequestNumber;
    if (sameCompletedResult) continue;

    nextState = completeAgentTask(nextState, result);
    appliedTaskCount += 1;
  }

  const mergedPullRequestNumbers = job.result.mergedPullRequestNumbers ?? [];
  const project = nextState.projects.find((item) => item.id === job.projectId);
  const shouldApplyIntegration =
    job.result.status === "completed"
    && mergedPullRequestNumbers.length > 0
    && project !== undefined
    && project.status !== "retrospective"
    && project.status !== "completed";

  if (shouldApplyIntegration) {
    nextState = markProjectIntegrated(
      nextState,
      job.projectId,
      mergedPullRequestNumbers,
    );
  }

  return {
    state: nextState,
    appliedTaskCount,
    integrationApplied: shouldApplyIntegration,
  };
}

export async function syncRemoteExecution(
  state: ProjectTeamsState,
  projectId: string,
): Promise<RemoteExecutionSyncResult | null> {
  const existing = getRemoteExecution(projectId);
  if (!existing) return null;

  const runnerSettings: RemoteRunnerSettings = {
    mode: "remote",
    baseUrl: existing.runnerBaseUrl,
  };
  const job = await getRemoteRunnerJob(existing.jobId, runnerSettings);
  const record = updateRemoteExecution(job);
  const applied = applyRemoteJobResult(state, job);

  return {
    state: applied.state,
    job,
    record,
    appliedTaskCount: applied.appliedTaskCount,
    integrationApplied: applied.integrationApplied,
  };
}
