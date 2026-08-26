import { invoke } from "@tauri-apps/api/core";

import type {
  AgentTaskVerification,
  ProjectPlan,
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

export async function checkProjectRuntime(organization: string) {
  return invoke<ProjectRuntimePreflight>("project_runtime_preflight", { organization });
}

export async function bootstrapProjectRepository(input: BootstrapProjectRepositoryInput) {
  return invoke<ProjectRepositoryBootstrap>("bootstrap_project_repository", input);
}

export async function startProjectRuntime(input: StartProjectRuntimeInput) {
  return invoke<StartProjectRuntimeResult>("start_project_runtime", input);
}

export async function dispatchAgentTask(input: AgentTaskRuntimeInput) {
  return invoke<AgentTaskRunResult>("dispatch_agent_task", { input });
}
