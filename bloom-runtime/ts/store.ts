import { createInitialProjectTeamsState } from "./catalog";
import { evaluateHarnessPackProjectCompletion } from "./harnessProjectCompletionGate";
import {
  legacyUnboundHarnessPackBinding,
  resolveHarnessPackBinding,
  validateHarnessPackBinding,
  type HarnessPackBinding,
} from "./harnessPackBinding";
import { validateHarnessTaskCompletionRecord } from "./harnessTaskEvidence";
import { createAgentRuntimeIdentity } from "./permissions";
import {
  applyRuntimeCompletionToTaskRun,
  declaredDependencyPullRequestsForTask,
  type RuntimeTaskRunResultLike,
} from "./runtimeTaskCompletion";
import { selectIdleTeamForProject } from "./teamAllocation";
import type {
  AgentDecision,
  AgentRole,
  ProjectPlan,
  ProjectState,
  ProjectTaskRun,
  ProjectTeamsState,
  TeamId,
} from "./types";

const STORAGE_KEY = "luna.project-teams.v1";
const MAX_TASK_ATTEMPTS = 3;
const INTERRUPTED_AGENT_REASON =
  "Luna가 종료되거나 다시 로드되어 실행 중 Agent의 최종 상태를 확인할 수 없습니다. 실제 worktree와 PR 상태를 확인한 뒤 재시도하세요.";

export type StartProjectResult =
  | { ok: true; state: ProjectTeamsState; project: ProjectState }
  | { ok: false; state: ProjectTeamsState; message: string };

export type RecordDecisionInput = Omit<AgentDecision, "id" | "createdAt">;

export type CompleteProjectPlanningInput = {
  projectId: string;
  plan: ProjectPlan;
  repositoryFullName: string;
  workspacePath: string;
  pmSessionId: string | null;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function emptyTaskRun(task: ProjectPlan["tasks"][number], teamId: TeamId): ProjectTaskRun {
  return {
    taskId: task.id,
    role: task.role,
    agentId: `${teamId}:${task.role}`,
    status: task.dependsOn.length === 0 ? "ready" : "pending",
    attempts: 0,
    branchName: null,
    worktreePath: null,
    threadId: null,
    sessionId: null,
    turnId: null,
    eventsPath: null,
    stderrPath: null,
    commitSha: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    reviewedPullRequests: [],
    summary: null,
    rationaleSummary: null,
    evidence: [],
    harnessCompletion: null,
    verification: [],
    blockers: [],
    lastError: null,
    startedAt: null,
    completedAt: null,
  };
}

function hydrateTaskRun(run: ProjectTaskRun): ProjectTaskRun {
  return {
    ...run,
    attempts: Number.isFinite(run.attempts) ? run.attempts : 0,
    branchName: run.branchName ?? null,
    worktreePath: run.worktreePath ?? null,
    threadId: run.threadId ?? null,
    sessionId: run.sessionId ?? null,
    turnId: run.turnId ?? null,
    eventsPath: run.eventsPath ?? null,
    stderrPath: run.stderrPath ?? null,
    commitSha: run.commitSha ?? null,
    pullRequestNumber: run.pullRequestNumber ?? null,
    pullRequestUrl: run.pullRequestUrl ?? null,
    reviewedPullRequests: Array.isArray(run.reviewedPullRequests) ? run.reviewedPullRequests : [],
    summary: run.summary ?? null,
    rationaleSummary: run.rationaleSummary ?? null,
    evidence: Array.isArray(run.evidence) ? run.evidence : [],
    harnessCompletion: Object.prototype.hasOwnProperty.call(run, "harnessCompletion")
      ? run.harnessCompletion === null ? null : validateHarnessTaskCompletionRecord(run.harnessCompletion)
      : null,
    verification: Array.isArray(run.verification) ? run.verification : [],
    blockers: Array.isArray(run.blockers) ? run.blockers : [],
    lastError: run.lastError ?? null,
    startedAt: run.startedAt ?? null,
    completedAt: run.completedAt ?? null,
  };
}

function hydrateState(state: ProjectTeamsState): ProjectTeamsState {
  const initialState = createInitialProjectTeamsState();

  return {
    ...state,
    teams: initialState.teams.map((templateTeam) => {
      const storedTeam = state.teams.find((team) => team.id === templateTeam.id);
      if (!storedTeam) {
        return templateTeam;
      }

      const storedAgents = new Map(storedTeam.agents.map((agent) => [agent.role, agent]));

      return {
        ...templateTeam,
        ...storedTeam,
        agents: templateTeam.agents.map((templateAgent) => {
          const storedAgent = storedAgents.get(templateAgent.role) ?? templateAgent;
          const identity = createAgentRuntimeIdentity(templateAgent.id, templateAgent.role);

          return {
            ...templateAgent,
            ...storedAgent,
            id: templateAgent.id,
            role: templateAgent.role,
            autonomy: identity.autonomy,
            permissions: identity.permissions,
          };
        }),
      };
    }),
    projects: state.projects.map((project) => ({
      ...project,
      autonomyPolicyId: project.autonomyPolicyId ?? "independent-agent",
      decisionPolicyId: project.decisionPolicyId ?? "reasoned-agent-decisions",
      documentationPolicyId: project.documentationPolicyId ?? "documentation-evidence",
      qualityPolicyId: project.qualityPolicyId ?? "production-service",
      deploymentPolicyId: project.deploymentPolicyId ?? "luna-apps-portal",
      plan: project.plan ?? null,
      taskRuns: Array.isArray(project.taskRuns) ? project.taskRuns.map(hydrateTaskRun) : [],
      harnessPackBinding: Object.prototype.hasOwnProperty.call(project, "harnessPackBinding")
        ? project.harnessPackBinding === null ? null : validateHarnessPackBinding(project.harnessPackBinding)
        : legacyUnboundHarnessPackBinding("Legacy project predates live pack binding."),
      repositoryFullName: project.repositoryFullName ?? null,
      workspacePath: project.workspacePath ?? null,
      pmSessionId: project.pmSessionId ?? null,
      runtimeFailureSource: project.runtimeFailureSource ?? null,
    })),
    decisions: Array.isArray(state.decisions) ? state.decisions : [],
  };
}

function recoverInterruptedAgentTasks(state: ProjectTeamsState) {
  const recoveredProjectIds: string[] = [];
  const now = new Date().toISOString();

  let nextState: ProjectTeamsState = {
    ...state,
    projects: state.projects.map((project) => {
      if (!project.taskRuns.some((run) => run.status === "running")) {
        return project;
      }

      recoveredProjectIds.push(project.id);
      return {
        ...project,
        status: "blocked" as const,
        runtimeFailureSource: "agent" as const,
        runtimeMessage: `Agent Runtime 복구 필요 · ${INTERRUPTED_AGENT_REASON}`,
        taskRuns: project.taskRuns.map((run) =>
          run.status === "running"
            ? {
                ...run,
                status: "blocked" as const,
                lastError: INTERRUPTED_AGENT_REASON,
                blockers: [INTERRUPTED_AGENT_REASON],
                completedAt: now,
              }
            : run,
        ),
      };
    }),
  };

  if (recoveredProjectIds.length === 0) {
    return state;
  }

  recoveredProjectIds.forEach((projectId) => {
    nextState = syncTeamAgentStatuses(nextState, projectId);
  });
  return nextState;
}

export function loadProjectTeamsState(): ProjectTeamsState {
  if (!canUseStorage()) {
    return createInitialProjectTeamsState();
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return createInitialProjectTeamsState();
  }

  try {
    const parsed = JSON.parse(stored) as ProjectTeamsState;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.teams) || !Array.isArray(parsed.projects)) {
      return createInitialProjectTeamsState();
    }

    const hydrated = hydrateState(parsed);
    const recovered = recoverInterruptedAgentTasks(hydrated);
    if (recovered !== hydrated) {
      saveProjectTeamsState(recovered);
    }
    return recovered;
  } catch {
    return createInitialProjectTeamsState();
  }
}

export function saveProjectTeamsState(state: ProjectTeamsState) {
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export function resetProjectTeamsState() {
  const state = createInitialProjectTeamsState();
  saveProjectTeamsState(state);
  return state;
}

function createProjectId() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PROJECT-${time}-${random}`;
}

function createDecisionId() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DECISION-${time}-${random}`;
}

function updateProject(
  state: ProjectTeamsState,
  projectId: string,
  updater: (project: ProjectState) => ProjectState,
) {
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === projectId ? updater(project) : project,
    ),
  };
}

export function bindProjectHarnessPack(
  state: ProjectTeamsState,
  projectId: string,
  explicitPack?: string,
): { state: ProjectTeamsState; binding: HarnessPackBinding } {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error(`Bloom Harness project not found: ${projectId}`);
  const hasBinding = Object.prototype.hasOwnProperty.call(project, "harnessPackBinding");
  const existing = hasBinding ? project.harnessPackBinding : undefined;
  const binding = existing !== null && existing !== undefined
    ? validateHarnessPackBinding(existing)
    : hasBinding
      ? resolveHarnessPackBinding({ intent: project.request, explicitPack })
      : legacyUnboundHarnessPackBinding("Legacy project predates live pack binding.");
  const nextState = updateProject(state, projectId, (currentProject) => ({
    ...currentProject,
    harnessPackBinding: binding,
    status: binding.status === "blocked" ? "blocked" : currentProject.status,
    runtimeFailureSource: binding.status === "blocked" ? "harness" : currentProject.runtimeFailureSource,
    runtimeMessage: binding.status === "blocked" ? binding.reason : currentProject.runtimeMessage,
  }));
  saveProjectTeamsState(nextState);
  return { state: nextState, binding };
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
      const ready = task.dependsOn.every((dependency) => completed.has(dependency));
      return ready ? { ...run, status: "ready" as const } : run;
    }),
  };
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

function syncTeamAgentStatuses(state: ProjectTeamsState, projectId: string) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return state;

  return {
    ...state,
    teams: state.teams.map((team) => {
      if (team.id !== project.teamId) return team;
      return {
        ...team,
        status: "working" as const,
        agents: team.agents.map((agent) => {
          if (agent.role === "pm") {
            return { ...agent, status: project.plan ? "done" as const : agent.status };
          }
          return { ...agent, status: agentStatusFromRuns(agent.role, project.taskRuns) };
        }),
      };
    }),
  };
}

function projectStatusForRoles(roles: Array<Exclude<AgentRole, "pm">>) {
  const priority: Array<{ roles: Array<Exclude<AgentRole, "pm">>; status: ProjectState["status"] }> = [
    { roles: ["process-evaluator"], status: "evaluation" },
    { roles: ["user-a", "user-b"], status: "user-test" },
    { roles: ["qa"], status: "qa" },
    { roles: ["code-review", "reviewer", "documentation"], status: "review" },
    { roles: ["frontend", "backend", "debug-router"], status: "development" },
    { roles: ["design-system", "designer"], status: "design" },
    { roles: ["idea"], status: "planning" },
  ];

  return priority.find((group) => roles.some((role) => group.roles.includes(role)))?.status ?? "development";
}

export function recordAgentDecision(state: ProjectTeamsState, input: RecordDecisionInput) {
  const decision: AgentDecision = {
    ...input,
    id: createDecisionId(),
    createdAt: new Date().toISOString(),
  };

  const nextState: ProjectTeamsState = {
    ...state,
    decisions: [decision, ...state.decisions],
  };

  saveProjectTeamsState(nextState);
  return { state: nextState, decision };
}

export function startProject(state: ProjectTeamsState, request: string): StartProjectResult {
  const normalizedRequest = request.trim();
  if (!normalizedRequest) {
    return { ok: false, state, message: "프로젝트 요구사항을 입력해 주세요." };
  }

  const allocation = selectIdleTeamForProject(state);
  if (!allocation) {
    return { ok: false, state, message: "현재 대기 중인 팀이 없습니다." };
  }
  const { team } = allocation;

  const project: ProjectState = {
    id: createProjectId(),
    request: normalizedRequest,
    teamId: team.id,
    status: "queued",
    createdAt: new Date().toISOString(),
    teamAllocation: allocation.record,
    authPolicyId: "bouquet",
    executionPolicyId: "iseol-workflow",
    autonomyPolicyId: "independent-agent",
    decisionPolicyId: "reasoned-agent-decisions",
    documentationPolicyId: "documentation-evidence",
    qualityPolicyId: "production-service",
    deploymentPolicyId: "luna-apps-portal",
    plan: null,
    taskRuns: [],
    harnessPackBinding: null,
    repositoryFullName: null,
    workspacePath: null,
    pmSessionId: null,
    runtimeFailureSource: null,
    runtimeMessage: `팀 배정 완료 · ${allocation.record.reason} · PM Local Agent 실행 준비`,
  };

  const nextState: ProjectTeamsState = {
    ...state,
    projects: [project, ...state.projects],
    teams: state.teams.map((currentTeam) => {
      if (currentTeam.id !== team.id) {
        return currentTeam;
      }

      return {
        ...currentTeam,
        status: "reserved",
        activeProjectId: project.id,
        agents: currentTeam.agents.map((agent) => ({
          ...agent,
          status: agent.role === "pm" ? "ready" : "idle",
        })),
      };
    }),
  };

  saveProjectTeamsState(nextState);
  return { ok: true, state: nextState, project };
}

export function beginProjectPlanning(state: ProjectTeamsState, projectId: string) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return state;

  let nextState = updateProject(state, projectId, (currentProject) => ({
    ...currentProject,
    status: "planning",
    runtimeFailureSource: null,
    runtimeMessage: "PM Local Agent가 프로젝트를 분석하고 실제 서비스 계획을 작성 중",
  }));

  nextState = {
    ...nextState,
    teams: nextState.teams.map((team) =>
      team.id === project.teamId
        ? {
            ...team,
            status: "working",
            agents: team.agents.map((agent) => ({
              ...agent,
              status: agent.role === "pm" ? "working" : "idle",
            })),
          }
        : team,
    ),
  };

  saveProjectTeamsState(nextState);
  return nextState;
}

export function completeProjectPlanning(state: ProjectTeamsState, input: CompleteProjectPlanningInput) {
  const project = state.projects.find((item) => item.id === input.projectId);
  if (!project) return state;

  const taskRuns = input.plan.tasks.map((task) => emptyTaskRun(task, project.teamId));
  let nextState = updateProject(state, input.projectId, (currentProject) => ({
    ...currentProject,
    status: "development",
    plan: input.plan,
    taskRuns,
    repositoryFullName: input.repositoryFullName,
    workspacePath: input.workspacePath,
    pmSessionId: input.pmSessionId,
    runtimeFailureSource: null,
    runtimeMessage: "PM 계획 및 repository 준비 완료 · 독립 Agent Task 실행 준비",
  }));

  nextState = syncTeamAgentStatuses(nextState, input.projectId);
  saveProjectTeamsState(nextState);
  return nextState;
}

export function getRunnableTaskRuns(state: ProjectTeamsState, projectId: string, limit = 2) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project || !project.plan || project.status === "blocked") return [];

  const selected: ProjectTaskRun[] = [];
  const busyRoles = new Set(
    project.taskRuns.filter((run) => run.status === "running").map((run) => run.role),
  );

  for (const run of project.taskRuns) {
    if (run.status !== "ready" || busyRoles.has(run.role)) continue;
    selected.push(run);
    busyRoles.add(run.role);
    if (selected.length >= limit) break;
  }

  return selected;
}

export function beginAgentTasks(state: ProjectTeamsState, projectId: string, taskIds: string[]) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project || taskIds.length === 0) return state;

  const selected = new Set(taskIds);
  const now = new Date().toISOString();
  const roles = project.taskRuns
    .filter((run) => selected.has(run.taskId) && run.status === "ready")
    .map((run) => run.role);

  let nextState = updateProject(state, projectId, (currentProject) => ({
    ...currentProject,
    status: projectStatusForRoles(roles),
    runtimeFailureSource: null,
    runtimeMessage: `독립 Agent ${roles.length}개 Task 실행 중`,
    taskRuns: currentProject.taskRuns.map((run) =>
      selected.has(run.taskId) && run.status === "ready"
        ? {
            ...run,
            status: "running" as const,
            attempts: run.attempts + 1,
            startedAt: now,
            completedAt: null,
            lastError: null,
            blockers: [],
          }
        : run,
    ),
  }));

  nextState = syncTeamAgentStatuses(nextState, projectId);
  saveProjectTeamsState(nextState);
  return nextState;
}

export function completeAgentTask(
  state: ProjectTeamsState,
  result: RuntimeTaskRunResultLike & { projectId: string },
) {
  const project = state.projects.find((item) => item.id === result.projectId);
  if (!project) return state;

  const now = new Date().toISOString();
  const declaredDependencyPullRequests = project.plan
    ? declaredDependencyPullRequestsForTask(project.plan, project.taskRuns, result.taskId)
    : [];
  let nextState = updateProject(state, result.projectId, (currentProject) => ({
    ...currentProject,
    taskRuns: currentProject.taskRuns.map((run) =>
      run.taskId === result.taskId
        ? applyRuntimeCompletionToTaskRun({
            run,
            result,
            declaredDependencyPullRequests,
            completedAt: now,
          })
        : run,
    ),
  }));

  nextState = updateProject(nextState, result.projectId, refreshDependencyReadiness);
  const updatedProject = nextState.projects.find((item) => item.id === result.projectId);
  if (!updatedProject) return nextState;

  const hasBlocked = updatedProject.taskRuns.some((run) => run.status === "blocked");
  const allDone = updatedProject.taskRuns.length > 0
    && updatedProject.taskRuns.every((run) => run.status === "done");
  const packGate = allDone && !hasBlocked
    ? updatedProject.harnessPackBinding === null
      ? { ready: false, reasons: ["Bloom Harness pack binding was not resolved before task execution."] }
      : evaluateHarnessPackProjectCompletion({
          binding: updatedProject.harnessPackBinding
            ?? legacyUnboundHarnessPackBinding("Legacy project predates live pack binding."),
          taskRuns: updatedProject.taskRuns,
        })
    : null;
  const packBlocked = Boolean(packGate && !packGate.ready);
  const packReason = packGate?.reasons.join(" ") ?? "";

  nextState = updateProject(nextState, result.projectId, (currentProject) => ({
    ...currentProject,
    status: hasBlocked ? "blocked" : packBlocked ? "blocked" : allDone ? "review" : currentProject.status,
    runtimeFailureSource: hasBlocked ? "agent" : packBlocked ? "harness" : null,
    runtimeMessage: hasBlocked
      ? "Agent Task가 막혔습니다 · 근거를 확인하고 재시도 또는 제품 결정을 진행해 주세요."
      : packBlocked
        ? `Bloom Harness pack completion blocked · ${packReason}`
        : allDone
          ? "PM 계획의 모든 Agent Task 실행 완료 · PR 통합/merge gate 연결 대기"
          : "Agent Task 완료 · dependency가 충족된 다음 Task 실행 준비",
  }));

  nextState = syncTeamAgentStatuses(nextState, result.projectId);
  saveProjectTeamsState(nextState);
  return nextState;
}

export function failAgentTask(
  state: ProjectTeamsState,
  projectId: string,
  taskId: string,
  reason: string,
) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return state;

  const now = new Date().toISOString();
  let nextState = updateProject(state, projectId, (currentProject) => ({
    ...currentProject,
    status: "blocked",
    runtimeFailureSource: "agent",
    runtimeMessage: `Agent Runtime 실패 · ${reason}`,
    taskRuns: currentProject.taskRuns.map((run) =>
      run.taskId === taskId
        ? {
            ...run,
            status: "blocked" as const,
            lastError: reason,
            blockers: [reason],
            completedAt: now,
          }
        : run,
    ),
  }));

  nextState = syncTeamAgentStatuses(nextState, projectId);
  saveProjectTeamsState(nextState);
  return nextState;
}

export function retryBlockedAgentTasks(state: ProjectTeamsState, projectId: string) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return state;

  let retryCount = 0;
  let exhaustedCount = 0;
  let nextState = updateProject(state, projectId, (currentProject) => ({
    ...currentProject,
    taskRuns: currentProject.taskRuns.map((run) => {
      if (run.status !== "blocked") return run;
      if (run.attempts >= MAX_TASK_ATTEMPTS) {
        exhaustedCount += 1;
        return run;
      }
      retryCount += 1;
      return {
        ...run,
        status: "ready" as const,
        lastError: null,
        blockers: [],
        harnessCompletion: null,
        completedAt: null,
      };
    }),
  }));

  nextState = updateProject(nextState, projectId, (currentProject) => ({
    ...currentProject,
    status: retryCount > 0 ? "development" : "blocked",
    runtimeFailureSource: retryCount > 0 ? null : exhaustedCount > 0 ? "agent" : currentProject.runtimeFailureSource,
    runtimeMessage:
      retryCount > 0
        ? `막힌 Agent Task ${retryCount}개 재시도 준비`
        : exhaustedCount > 0
          ? `자동 재시도 한도(${MAX_TASK_ATTEMPTS})에 도달했습니다 · PM/사용자 결정 필요`
          : currentProject.runtimeMessage,
  }));

  nextState = syncTeamAgentStatuses(nextState, projectId);
  saveProjectTeamsState(nextState);
  return nextState;
}

export function failProjectRuntime(state: ProjectTeamsState, projectId: string, reason: string) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return state;

  let nextState = updateProject(state, projectId, (currentProject) => ({
    ...currentProject,
    status: "blocked",
    runtimeFailureSource: "pm",
    runtimeMessage: reason,
  }));

  nextState = {
    ...nextState,
    teams: nextState.teams.map((team) =>
      team.id === project.teamId
        ? {
            ...team,
            status: "working",
            agents: team.agents.map((agent) => ({
              ...agent,
              status: agent.role === "pm" ? "blocked" : agent.status,
            })),
          }
        : team,
    ),
  };

  saveProjectTeamsState(nextState);
  return nextState;
}

export function getTeamName(state: ProjectTeamsState, teamId: TeamId) {
  return state.teams.find((team) => team.id === teamId)?.name ?? teamId;
}
