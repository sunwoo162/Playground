import type { ReconcileAgentTaskResult } from "./runtime";
import { saveProjectTeamsState } from "./store";
import type {
  AgentRole,
  ProjectState,
  ProjectTaskRun,
  ProjectTeamsState,
} from "./types";

const INTERRUPTED_AGENT_MARKER =
  "Luna가 종료되거나 다시 로드되어 실행 중 Agent의 최종 상태를 확인할 수 없습니다.";

export type InterruptedAgentCandidate = {
  projectId: string;
  taskId: string;
};

export function getInterruptedAgentCandidates(
  state: ProjectTeamsState,
): InterruptedAgentCandidate[] {
  return state.projects.flatMap((project) =>
    project.taskRuns
      .filter(
        (run) =>
          run.status === "running" ||
          (run.status === "blocked" && run.lastError?.includes(INTERRUPTED_AGENT_MARKER)),
      )
      .map((run) => ({ projectId: project.id, taskId: run.taskId })),
  );
}

function taskPlanById(project: ProjectState, taskId: string) {
  return project.plan?.tasks.find((task) => task.id === taskId) ?? null;
}

function refreshDependencyReadiness(project: ProjectState): ProjectState {
  if (!project.plan) return project;
  const completed = new Set(
    project.taskRuns.filter((run) => run.status === "done").map((run) => run.taskId),
  );

  return {
    ...project,
    taskRuns: project.taskRuns.map((run) => {
      if (run.status !== "pending") return run;
      const task = taskPlanById(project, run.taskId);
      if (!task) return run;
      return task.dependsOn.every((dependency) => completed.has(dependency))
        ? { ...run, status: "ready" as const }
        : run;
    }),
  };
}

function projectStatusForRuns(runs: ProjectTaskRun[]): ProjectState["status"] {
  if (runs.some((run) => run.status === "blocked")) return "blocked";
  if (runs.length > 0 && runs.every((run) => run.status === "done")) return "review";

  const activeRoles = runs
    .filter((run) => run.status === "running" || run.status === "ready")
    .map((run) => run.role);
  const priorities: Array<{
    roles: Array<Exclude<AgentRole, "pm">>;
    status: ProjectState["status"];
  }> = [
    { roles: ["process-evaluator"], status: "evaluation" },
    { roles: ["user-a", "user-b"], status: "user-test" },
    { roles: ["qa"], status: "qa" },
    { roles: ["code-review", "reviewer", "documentation", "data-marketing"], status: "review" },
    { roles: ["frontend", "backend", "debug-router"], status: "development" },
    { roles: ["design-system", "designer"], status: "design" },
    { roles: ["idea"], status: "planning" },
  ];

  return priorities.find((group) => activeRoles.some((role) => group.roles.includes(role)))?.status
    ?? "development";
}

function agentStatusFromRuns(role: AgentRole, runs: ProjectTaskRun[]) {
  const roleRuns = runs.filter((run) => run.role === role);
  if (roleRuns.length === 0) return "idle" as const;
  if (roleRuns.some((run) => run.status === "running")) return "working" as const;
  if (roleRuns.some((run) => run.status === "blocked")) return "blocked" as const;
  if (roleRuns.some((run) => run.status === "ready")) return "ready" as const;
  if (roleRuns.every((run) => run.status === "done")) return "done" as const;
  return "idle" as const;
}

export function applyAgentReconciliation(
  state: ProjectTeamsState,
  projectId: string,
  taskId: string,
  result: ReconcileAgentTaskResult,
): ProjectTeamsState {
  const now = new Date().toISOString();
  let nextState: ProjectTeamsState = {
    ...state,
    projects: state.projects.map((project) => {
      if (project.id !== projectId) return project;

      const taskRuns = project.taskRuns.map((run) => {
        if (run.taskId !== taskId) return run;

        if (result.outcome === "completed" && result.recovered) {
          const recovered = result.recovered;
          return {
            ...run,
            status: "done" as const,
            branchName: recovered.branchName,
            worktreePath: recovered.worktreePath,
            threadId: recovered.threadId,
            sessionId: recovered.sessionId,
            turnId: recovered.turnId,
            eventsPath: recovered.eventsPath,
            stderrPath: recovered.stderrPath,
            commitSha: recovered.report.commitSha,
            pullRequestNumber: recovered.report.pullRequestNumber,
            pullRequestUrl: recovered.report.pullRequestUrl,
            reviewedPullRequests: recovered.report.reviewedPullRequests,
            summary: recovered.report.summary,
            rationaleSummary: recovered.report.rationaleSummary,
            evidence: recovered.report.evidence,
            verification: recovered.report.verification,
            blockers: [],
            lastError: null,
            completedAt: now,
          };
        }

        if (result.outcome === "retry") {
          return {
            ...run,
            status: "ready" as const,
            blockers: [],
            lastError: null,
            completedAt: null,
          };
        }

        if (result.recovered) {
          const recovered = result.recovered;
          return {
            ...run,
            status: "blocked" as const,
            branchName: recovered.branchName,
            worktreePath: recovered.worktreePath,
            threadId: recovered.threadId,
            sessionId: recovered.sessionId,
            turnId: recovered.turnId,
            eventsPath: recovered.eventsPath,
            stderrPath: recovered.stderrPath,
            commitSha: recovered.report.commitSha,
            pullRequestNumber: recovered.report.pullRequestNumber,
            pullRequestUrl: recovered.report.pullRequestUrl,
            reviewedPullRequests: recovered.report.reviewedPullRequests,
            summary: recovered.report.summary,
            rationaleSummary: recovered.report.rationaleSummary,
            evidence: recovered.report.evidence,
            verification: recovered.report.verification,
            blockers: recovered.report.blockers.length > 0
              ? recovered.report.blockers
              : [result.message],
            lastError: result.message,
            completedAt: now,
          };
        }

        return {
          ...run,
          status: "blocked" as const,
          blockers: [result.message],
          lastError: result.message,
          completedAt: now,
        };
      });

      const refreshed = refreshDependencyReadiness({ ...project, taskRuns });
      const status = projectStatusForRuns(refreshed.taskRuns);
      return {
        ...refreshed,
        status,
        runtimeFailureSource: status === "blocked" ? "agent" : null,
        runtimeMessage:
          result.outcome === "completed"
            ? `Agent Task 복구 완료 · ${result.message}`
            : result.outcome === "retry"
              ? `Agent Task 재시도 준비 · ${result.message}`
              : `Agent Task 복구 차단 · ${result.message}`,
      };
    }),
  };

  const project = nextState.projects.find((item) => item.id === projectId);
  if (!project) return state;

  nextState = {
    ...nextState,
    teams: nextState.teams.map((team) => {
      if (team.id !== project.teamId) return team;
      return {
        ...team,
        status: project.status === "completed" ? "idle" as const : "working" as const,
        agents: team.agents.map((agent) => {
          if (agent.role === "pm") {
            return { ...agent, status: project.plan ? "done" as const : agent.status };
          }
          return {
            ...agent,
            status: agentStatusFromRuns(agent.role, project.taskRuns),
          };
        }),
      };
    }),
  };

  saveProjectTeamsState(nextState);
  return nextState;
}
