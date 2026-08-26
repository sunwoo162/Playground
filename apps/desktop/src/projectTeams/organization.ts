import type { AgentRole, TeamId } from "./types";

const SETTINGS_KEY = "luna.project-runtime-settings.v1";

export const DEFAULT_ORGANIZATION = "BloomBouquet";
export const DEFAULT_AGENT_BRANCH_PATTERN = "agent/<team>/<role>/<task>";

export type OrganizationRuntimeSettings = {
  organization: string;
  workspaceRoot: string;
  releaseBranch: "main";
  integrationBranch: "develop";
  agentBranchPattern: typeof DEFAULT_AGENT_BRANCH_PATTERN;
  repositoryStrategy: "project-monorepo";
};

export const DEFAULT_ORGANIZATION_RUNTIME_SETTINGS: OrganizationRuntimeSettings = {
  organization: DEFAULT_ORGANIZATION,
  workspaceRoot: "",
  releaseBranch: "main",
  integrationBranch: "develop",
  agentBranchPattern: DEFAULT_AGENT_BRANCH_PATTERN,
  repositoryStrategy: "project-monorepo",
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadOrganizationRuntimeSettings(): OrganizationRuntimeSettings {
  if (!canUseStorage()) {
    return DEFAULT_ORGANIZATION_RUNTIME_SETTINGS;
  }

  const stored = window.localStorage.getItem(SETTINGS_KEY);
  if (!stored) {
    return DEFAULT_ORGANIZATION_RUNTIME_SETTINGS;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<OrganizationRuntimeSettings>;
    return {
      ...DEFAULT_ORGANIZATION_RUNTIME_SETTINGS,
      ...parsed,
      organization: parsed.organization?.trim() || DEFAULT_ORGANIZATION,
      workspaceRoot: parsed.workspaceRoot?.trim() || "",
      releaseBranch: "main",
      integrationBranch: "develop",
      agentBranchPattern: DEFAULT_AGENT_BRANCH_PATTERN,
      repositoryStrategy: "project-monorepo",
    };
  } catch {
    return DEFAULT_ORGANIZATION_RUNTIME_SETTINGS;
  }
}

export function saveOrganizationRuntimeSettings(settings: OrganizationRuntimeSettings) {
  const normalized: OrganizationRuntimeSettings = {
    ...settings,
    organization: settings.organization.trim() || DEFAULT_ORGANIZATION,
    workspaceRoot: settings.workspaceRoot.trim(),
    releaseBranch: "main",
    integrationBranch: "develop",
    agentBranchPattern: DEFAULT_AGENT_BRANCH_PATTERN,
    repositoryStrategy: "project-monorepo",
  };

  if (canUseStorage()) {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  }

  return normalized;
}

function toBranchSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "task";
}

export function buildAgentBranchName(teamId: TeamId, role: AgentRole, task: string) {
  return `agent/${teamId}/${role}/${toBranchSlug(task)}`;
}
