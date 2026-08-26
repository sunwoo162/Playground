import { invoke } from "@tauri-apps/api/core";

import type { ProjectPlan, TeamId } from "./types";

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

export async function checkProjectRuntime(organization: string) {
  return invoke<ProjectRuntimePreflight>("project_runtime_preflight", { organization });
}

export async function bootstrapProjectRepository(input: BootstrapProjectRepositoryInput) {
  return invoke<ProjectRepositoryBootstrap>("bootstrap_project_repository", input);
}

export async function startProjectRuntime(input: StartProjectRuntimeInput) {
  return invoke<StartProjectRuntimeResult>("start_project_runtime", input);
}
