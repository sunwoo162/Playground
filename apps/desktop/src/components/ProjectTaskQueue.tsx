import "../ProjectTaskQueue.css";
import type { ProjectState } from "../projectTeams/types";

function taskStatusLabel(status: ProjectState["taskRuns"][number]["status"]) {
  switch (status) {
    case "ready":
      return "실행 준비";
    case "running":
      return "실행 중";
    case "blocked":
      return "막힘";
    case "done":
      return "완료";
    case "pending":
    default:
      return "의존성 대기";
  }
}

type ProjectTaskQueueProps = {
  project: ProjectState;
  busy: boolean;
  onContinue: () => void;
  onRetryBlocked: () => void;
};

export function ProjectTaskQueue({
  project,
  busy,
  onContinue,
  onRetryBlocked,
}: ProjectTaskQueueProps) {
  if (!project.plan || project.taskRuns.length === 0) return null;

  const taskById = new Map(project.plan.tasks.map((task) => [task.id, task]));
  const readyCount = project.taskRuns.filter((run) => run.status === "ready").length;
  const runningCount = project.taskRuns.filter((run) => run.status === "running").length;
  const blockedCount = project.taskRuns.filter((run) => run.status === "blocked").length;
  const doneCount = project.taskRuns.filter((run) => run.status === "done").length;

  return (
    <section className="project-task-queue" aria-label="Agent Task 실행 현황">
      <div className="project-task-queue-heading">
        <div>
          <span>AGENT TASKS</span>
          <strong>{doneCount}/{project.taskRuns.length} 완료</strong>
        </div>
        <div className="project-task-queue-summary">
          <span>준비 {readyCount}</span>
          <span>실행 {runningCount}</span>
          <span>막힘 {blockedCount}</span>
        </div>
      </div>

      <div className="project-task-rows">
        {project.taskRuns.map((run) => {
          const task = taskById.get(run.taskId);
          const latestRoute = (project.failureRoutes ?? []).find(
            (route) => route.failedTaskId === run.taskId,
          );
          return (
            <div className="project-task-row" key={run.taskId}>
              <div className="project-task-main">
                <div className="project-task-title-row">
                  <strong>{run.taskId}</strong>
                  <span>{run.role}</span>
                </div>
                <p>{task?.title ?? run.taskId}</p>
                <small>
                  {run.pullRequestNumber
                    ? `PR #${run.pullRequestNumber}${run.commitSha ? ` · ${run.commitSha.slice(0, 7)}` : ""}`
                    : latestRoute
                      ? `Debug Router: ${latestRoute.route} · ${latestRoute.failureType} · ${latestRoute.recommendedAction}`
                      : run.lastError ?? run.summary ?? task?.summary ?? ""}
                </small>
              </div>
              <div className="project-task-meta">
                <span className={`project-task-status task-${run.status}`}>
                  {taskStatusLabel(run.status)}
                </span>
                <small>{run.attempts > 0 ? `${run.attempts}회` : "-"}</small>
              </div>
            </div>
          );
        })}
      </div>

      <div className="project-task-actions">
        <button type="button" onClick={onContinue} disabled={busy || readyCount === 0 || blockedCount > 0}>
          {busy ? "Agent 실행 중" : "Agent 실행 계속"}
        </button>
        {blockedCount > 0 && (
          <button type="button" onClick={onRetryBlocked} disabled={busy}>
            Debug Router로 재분석
          </button>
        )}
      </div>

      <p className="project-task-note">
        한 번에 최대 2개 Task만 실행합니다. 실패 Task는 같은 Agent를 바로 재실행하지 않고 Debug Router가 원인과 담당 Task를 먼저 판단합니다.
      </p>
    </section>
  );
}
