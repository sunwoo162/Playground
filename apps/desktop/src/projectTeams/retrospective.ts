import { invoke } from "@tauri-apps/api/core";

import type { AgentRole, ProjectTeamsState } from "./types";

const STORAGE_KEY = "luna.project-retrospectives.v1";

export type RetrospectiveParticipantInput = {
  agentId: string;
  role: AgentRole;
  version: string;
  taskSummaries: string[];
  evidence: string[];
  pullRequestNumbers: number[];
};

export type RunProjectRetrospectivesInput = {
  projectId: string;
  teamId: string;
  teamName: string;
  repositoryFullName: string;
  workspacePath: string;
  userRequest: string;
  productSummary: string;
  playbookVersion: string;
  evolutionAgentVersion: string;
  participants: RetrospectiveParticipantInput[];
};

export type AgentRetrospectiveReport = {
  wentWell: string[];
  problems: string[];
  evidence: string[];
  nextChanges: string[];
};

export type AgentRetrospectiveResult = {
  agentId: string;
  role: AgentRole;
  version: string;
  report: AgentRetrospectiveReport;
  eventsPath: string;
  outputPath: string;
};

export type AgentVersionChangeProposal = {
  agentId: string;
  currentVersion: string;
  recommendedVersion: string;
  reason: string;
};

export type TeamEvolutionProposal = {
  summary: string;
  strengths: string[];
  recurringProblems: string[];
  playbookChanges: string[];
  agentVersionChanges: AgentVersionChangeProposal[];
  evidence: string[];
};

export type RunProjectRetrospectivesResult = {
  projectId: string;
  teamId: string;
  retrospectives: AgentRetrospectiveResult[];
  evolution: TeamEvolutionProposal;
  evolutionEventsPath: string;
  evolutionOutputPath: string;
};

type StoredRetrospectives = Record<string, RunProjectRetrospectivesResult>;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function evidenceForRun(run: ProjectTeamsState["projects"][number]["taskRuns"][number]) {
  const evidence = [
    run.summary,
    run.rationaleSummary,
    run.commitSha ? `commit ${run.commitSha}` : null,
    ...run.evidence,
    ...run.verification.map(
      (verification) => `${verification.name}: ${verification.status} · ${verification.details}`,
    ),
  ].filter((value): value is string => Boolean(value?.trim()));

  return Array.from(new Set(evidence)).slice(0, 40);
}

function appendFailureRouteParticipants(
  state: ProjectTeamsState,
  projectId: string,
  participants: Map<string, RetrospectiveParticipantInput>,
) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project?.plan || !project.failureRoutes?.length) return;
  const team = state.teams.find((item) => item.id === project.teamId);
  if (!team) return;

  const router = team.agents.find((agent) => agent.role === "debug-router");
  if (router) {
    const existing = participants.get(router.id) ?? {
      agentId: router.id,
      role: router.role,
      version: router.version,
      taskSummaries: [],
      evidence: [],
      pullRequestNumbers: [],
    };

    for (const route of project.failureRoutes) {
      existing.taskSummaries.push(
        `${route.id}: ${route.failedTaskId} [${route.failedRole}] → ${route.route}${route.ownerTaskId ? ` → ${route.ownerTaskId} [${route.ownerRole}]` : ""}`,
      );
      existing.evidence.push(
        `Failure classification: ${route.failureType} / ${route.severity}`,
        `Diagnosis: ${route.summary}`,
        `Recommended action: ${route.recommendedAction}`,
        ...route.evidence,
      );
    }
    participants.set(router.id, existing);
  }

  for (const route of project.failureRoutes) {
    if (!route.ownerTaskId || !route.ownerRole) continue;
    const ownerRun = project.taskRuns.find((run) => run.taskId === route.ownerTaskId);
    const ownerAgent = ownerRun
      ? team.agents.find((agent) => agent.id === ownerRun.agentId)
      : team.agents.find((agent) => agent.role === route.ownerRole);
    if (!ownerAgent) continue;

    const existing = participants.get(ownerAgent.id) ?? {
      agentId: ownerAgent.id,
      role: ownerAgent.role,
      version: ownerAgent.version,
      taskSummaries: [],
      evidence: [],
      pullRequestNumbers: [],
    };
    existing.evidence.push(
      `Debug Router assigned ${route.id}: ${route.failureType} / ${route.severity} · ${route.recommendedAction}`,
      ...route.evidence,
    );
    participants.set(ownerAgent.id, existing);
  }
}

export function buildRetrospectiveInput(
  state: ProjectTeamsState,
  projectId: string,
): RunProjectRetrospectivesInput {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project?.plan || !project.repositoryFullName || !project.workspacePath) {
    throw new Error("회고를 실행할 Project 계획/repository/workspace가 준비되지 않았습니다.");
  }
  if (project.status !== "retrospective") {
    throw new Error("develop 통합이 끝난 retrospective 상태의 Project만 회고할 수 있습니다.");
  }

  const team = state.teams.find((item) => item.id === project.teamId);
  if (!team) {
    throw new Error(`Project Team을 찾을 수 없습니다: ${project.teamId}`);
  }

  const participants = new Map<string, RetrospectiveParticipantInput>();
  const pm = team.agents.find((agent) => agent.role === "pm");
  if (pm) {
    participants.set(pm.id, {
      agentId: pm.id,
      role: pm.role,
      version: pm.version,
      taskSummaries: [
        `PM 계획: ${project.plan.projectName}`,
        `Architecture: ${project.plan.architectureSummary}`,
      ],
      evidence: [
        `Repository: ${project.repositoryFullName}`,
        `Planned tasks: ${project.plan.tasks.length}`,
      ],
      pullRequestNumbers: [],
    });
  }

  for (const run of project.taskRuns) {
    if (run.attempts <= 0) continue;
    const agent = team.agents.find((item) => item.id === run.agentId);
    if (!agent) continue;

    const task = project.plan.tasks.find((item) => item.id === run.taskId);
    const existing = participants.get(agent.id) ?? {
      agentId: agent.id,
      role: agent.role,
      version: agent.version,
      taskSummaries: [],
      evidence: [],
      pullRequestNumbers: [],
    };

    existing.taskSummaries.push(
      `${run.taskId}: ${task?.title ?? run.taskId} · ${run.status} · attempts=${run.attempts}`,
    );
    existing.evidence.push(...evidenceForRun(run));
    if (run.pullRequestNumber) existing.pullRequestNumbers.push(run.pullRequestNumber);
    existing.pullRequestNumbers.push(...run.reviewedPullRequests);
    participants.set(agent.id, existing);
  }

  appendFailureRouteParticipants(state, projectId, participants);

  const normalizedParticipants = Array.from(participants.values()).map((participant) => ({
    ...participant,
    taskSummaries: Array.from(new Set(participant.taskSummaries)).slice(0, 20),
    evidence: Array.from(new Set(participant.evidence)).slice(0, 40),
    pullRequestNumbers: Array.from(new Set(participant.pullRequestNumbers)).sort((a, b) => a - b),
  }));

  if (normalizedParticipants.length === 0) {
    throw new Error("회고할 참여 Agent가 없습니다.");
  }

  return {
    projectId: project.id,
    teamId: project.teamId,
    teamName: team.name,
    repositoryFullName: project.repositoryFullName,
    workspacePath: project.workspacePath,
    userRequest: project.request,
    productSummary: project.plan.productSummary,
    playbookVersion: team.playbookVersion,
    evolutionAgentVersion: state.evolutionAgentVersion,
    participants: normalizedParticipants,
  };
}

export async function runProjectRetrospectives(
  state: ProjectTeamsState,
  projectId: string,
) {
  const input = buildRetrospectiveInput(state, projectId);
  const result = await invoke<RunProjectRetrospectivesResult>("run_project_retrospectives", { input });
  saveProjectRetrospectives(result);
  return result;
}

export function saveProjectRetrospectives(result: RunProjectRetrospectivesResult) {
  if (!canUseStorage()) return;
  const current = loadAllProjectRetrospectives();
  current[result.projectId] = result;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

function loadAllProjectRetrospectives(): StoredRetrospectives {
  if (!canUseStorage()) return {};
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as StoredRetrospectives;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadProjectRetrospectives(projectId: string) {
  return loadAllProjectRetrospectives()[projectId] ?? null;
}
