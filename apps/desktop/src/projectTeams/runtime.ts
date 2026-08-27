import { invoke } from "@tauri-apps/api/core";

import { getProjectEvolutionInstructions } from "./evolutionExperiments";
import { prepareOrchestrationPlan } from "./orchestrationCore";
import { seniorAgentContext } from "./seniorAgent";
import { loadProjectTeamsState } from "./store";
import type {
  AgentTaskVerification,
  FailureRouteDecision,
  ProjectPlan,
  ProjectTaskPlan,
  TeamId,
} from "./types";

export type ProjectRuntimePreflight = {
  organization: string;
  gitAvailable: boolean;
  ghAvailable: boolean;
  ghAuthenticated: boolean;
  codexAvailable: boolean;
  codexAuthenticated: boolean;
  codexChatgptAuth: boolean;
  codexAuthMode: "chatgpt" | "other" | "none";
  organizationAccessible: boolean;
  message: string;
};

export type ProjectRepositoryBootstrap = {
  repository: string;
  workspacePath: string;
  createdRepository: boolean;
  clonedRepository: boolean;
  releaseBranch: string;
  integrationBranch: string;
};

export type PmCodexRunResult = {
  plan: ProjectPlan;
  sessionId: string | null;
  eventsPath: string;
  outputPath: string;
};

export type StartProjectRuntimeResult = {
  pm: PmCodexRunResult;
  repository: ProjectRepositoryBootstrap;
};

export type BootstrapProjectRepositoryInput = {
  organization: string;
  repository: string;
  workspaceRoot: string;
};

export type StartProjectRuntimeInput = {
  organization: string;
  workspaceRoot: string;
  projectId: string;
  teamId: TeamId;
  teamName: string;
  request: string;
};

export type DependencyArtifact = {
  taskId: string;
  role: string;
  summary: string;
  branchName: string | null;
  commitSha: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
};

export type AgentTaskRuntimeInput = {
  organization: string;
  projectId: string;
  teamId: TeamId;
  teamName: string;
  role: string;
  agentId: string;
  taskId: string;
  taskSlug: string;
  title: string;
  summary: string;
  acceptanceCriteria: string[];
  userRequest: string;
  productSummary: string;
  architectureSummary: string;
  repositoryFullName: string;
  workspacePath: string;
  dependencies: DependencyArtifact[];
};

export type AgentTaskReport = {
  status: "completed" | "blocked";
  summary: string;
  rationaleSummary: string;
  evidence: string[];
  verification: AgentTaskVerification[];
  commitSha: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  reviewedPullRequests: number[];
  blockers: string[];
};

export type AgentTaskRunResult = {
  projectId: string;
  taskId: string;
  role: string;
  agentId: string;
  branchName: string | null;
  worktreePath: string;
  threadId: string;
  sessionId: string;
  turnId: string;
  eventsPath: string;
  stderrPath: string;
  report: AgentTaskReport;
};

export type FailureOwnerCandidate = {
  taskId: string;
  role: string;
  title: string;
  summary: string;
};

export type RouteAgentFailureInput = {
  projectId: string;
  teamId: string;
  teamName: string;
  repositoryFullName: string;
  workspacePath: string;
  failedTaskId: string;
  failedRole: string;
  failureReason: string;
  blockers: string[];
  verification: AgentTaskVerification[];
  candidateOwners: FailureOwnerCandidate[];
  routeAttempt: number;
};

export type RouteAgentFailureResult = {
  projectId: string;
  failedTaskId: string;
  routerAgentId: string;
  sessionId: string | null;
  eventsPath: string;
  outputPath: string;
  decision: FailureRouteDecision;
};

export type ReplanTaskContext = ProjectTaskPlan & {
  status: string;
  attempts: number;
  hasArtifacts: boolean;
};

export type ReplanFailureRoute = {
  id: string;
  failedTaskId: string;
  failedRole: string;
  failureType: string;
  severity: string;
  summary: string;
  rationaleSummary: string;
  evidence: string[];
  recommendedAction: string;
};

export type ReplanProjectInput = {
  projectId: string;
  teamId: string;
  teamName: string;
  repositoryFullName: string;
  workspacePath: string;
  userRequest: string;
  productSummary: string;
  architectureSummary: string;
  failureRoute: ReplanFailureRoute;
  currentTasks: ReplanTaskContext[];
  retirableTaskIds: string[];
  reopenableTaskIds: string[];
  replanAttempt: number;
};

export type ProjectReplanProposal = {
  summary: string;
  rationaleSummary: string;
  retireTaskIds: string[];
  reopenTaskIds: string[];
  newTasks: ProjectTaskPlan[];
};

export type ReplanProjectResult = {
  projectId: string;
  triggerRouteId: string;
  sessionId: string | null;
  eventsPath: string;
  outputPath: string;
  proposal: ProjectReplanProposal;
};

export type MergeProjectPullRequestsInput = {
  repositoryFullName: string;
  pullRequestNumbers: number[];
};

export type MergedPullRequest = {
  number: number;
  url: string;
  headBranch: string;
  mergeCommitSha: string | null;
};

export type MergeProjectPullRequestsResult = {
  repositoryFullName: string;
  mergedPullRequests: MergedPullRequest[];
};

function withSeniorPmStandard(input: StartProjectRuntimeInput): StartProjectRuntimeInput {
  const internalContext = [
    seniorAgentContext("pm"),
    "If the product needs login or sign-up, set needsAuth=true. Luna will enforce the shared 꽃다발 server/client authentication contract after your plan, so keep provider-specific choices behind adapters and do not invent a separate auth state model.",
    "Luna will append a mandatory Data & Marketing → Documentation → Code Review → Reviewer → QA chain after your plan. Plan the product normally and do not fabricate market metrics or user research to compensate for missing evidence.",
  ].join("\n\n");

  return {
    ...input,
    request: `${input.request}\n\n${internalContext}`,
  };
}

function withPmEvolutionExperiment(input: StartProjectRuntimeInput): StartProjectRuntimeInput {
  const state = loadProjectTeamsState();
  const project = state.projects.find((item) => item.id === input.projectId);
  const team = state.teams.find((item) => item.id === input.teamId);
  const pm = team?.agents.find((agent) => agent.role === "pm");
  if (!project || !pm) return input;

  const experiment = getProjectEvolutionInstructions(state, project, pm.id);
  if (!experiment) return input;

  const playbook = experiment.playbookChanges.length > 0
    ? experiment.playbookChanges.map((change) => `- ${change}`).join("\n")
    : "- 이번 실험에서 별도 Team playbook 변경 없음";
  const agent = experiment.agentInstructions.length > 0
    ? experiment.agentInstructions.map((change) => `- ${change}`).join("\n")
    : "- PM 전용 변경 없음. Team playbook 실험만 적용";
  const internalContext = [
    `[Luna internal Team Evolution experiment ${experiment.experimentId}]`,
    `Candidate team playbook version: ${experiment.playbookVersion}`,
    "These are experimental process hypotheses, not Product Owner requirements. Preserve the original product request and independently reject any experiment instruction that conflicts with repository evidence, tests, safety, or explicit user direction.",
    "Experimental team playbook changes:",
    playbook,
    "Experimental PM objective:",
    agent,
    "When planning, keep the experiment auditable in task rationale/evidence instead of silently treating it as a permanent rule.",
  ].join("\n\n");

  return {
    ...input,
    request: `${input.request}\n\n${internalContext}`,
  };
}

export async function checkProjectRuntime(organization: string) {
  return invoke<ProjectRuntimePreflight>("project_runtime_preflight", { organization });
}

export async function bootstrapProjectRepository(input: BootstrapProjectRepositoryInput) {
  return invoke<ProjectRepositoryBootstrap>("bootstrap_project_repository", input);
}

export async function startProjectRuntime(input: StartProjectRuntimeInput) {
  const preparedInput = withPmEvolutionExperiment(withSeniorPmStandard(input));
  const result = await invoke<StartProjectRuntimeResult>(
    "start_project_runtime",
    preparedInput,
  );
  const plan = prepareOrchestrationPlan(result.pm.plan);
  return {
    ...result,
    pm: {
      ...result.pm,
      plan,
    },
  };
}

export async function dispatchAgentTask(input: AgentTaskRuntimeInput) {
  return invoke<AgentTaskRunResult>("dispatch_agent_task", { input });
}

export async function routeAgentFailure(input: RouteAgentFailureInput) {
  return invoke<RouteAgentFailureResult>("route_agent_failure", { input });
}

export async function replanProjectFailure(input: ReplanProjectInput) {
  return invoke<ReplanProjectResult>("replan_project_failure", { input });
}

export async function mergeProjectPullRequests(input: MergeProjectPullRequestsInput) {
  return invoke<MergeProjectPullRequestsResult>("merge_project_pull_requests", { input });
}
