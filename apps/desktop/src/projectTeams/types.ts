export type TeamId = "rose" | "lily" | "tulip" | "sunflower" | "cherry-blossom";

export type TeamStatus = "idle" | "reserved" | "working" | "retrospective" | "evolving";

export type AgentRole =
  | "idea"
  | "pm"
  | "design-system"
  | "designer"
  | "frontend"
  | "backend"
  | "code-review"
  | "reviewer"
  | "qa"
  | "documentation"
  | "debug-router"
  | "user-a"
  | "user-b"
  | "process-evaluator";

export type AgentPermission =
  | "repository:read"
  | "repository:create"
  | "repository:write"
  | "branch:create"
  | "worktree:create"
  | "command:run"
  | "dependency:install"
  | "test:run"
  | "build:run"
  | "browser:use"
  | "figma:read"
  | "commit:create"
  | "push"
  | "issue:create"
  | "issue:update"
  | "pull-request:create"
  | "pull-request:update"
  | "pull-request:review"
  | "pull-request:merge"
  | "deployment:prepare"
  | "deployment:publish";

export type AgentStatus = "idle" | "ready" | "working" | "blocked" | "review" | "done";

export type ProjectStatus =
  | "queued"
  | "planning"
  | "design"
  | "development"
  | "review"
  | "qa"
  | "user-test"
  | "evaluation"
  | "retrospective"
  | "completed"
  | "blocked";

export type AgentState = {
  id: string;
  role: AgentRole;
  label: string;
  description: string;
  version: string;
  status: AgentStatus;
  retrospectiveCount: number;
  autonomy: "independent";
  permissions: AgentPermission[];
};

export type TeamState = {
  id: TeamId;
  name: string;
  status: TeamStatus;
  playbookVersion: string;
  completedProjects: number;
  averageScore: number | null;
  activeProjectId: string | null;
  agents: AgentState[];
};

export type AgentDecision = {
  id: string;
  projectId: string;
  agentId: string;
  action: string;
  rationaleSummary: string;
  evidence: string[];
  alternativesConsidered: string[];
  sourceAgentIds: string[];
  createdAt: string;
};

export type ProjectState = {
  id: string;
  request: string;
  teamId: TeamId;
  status: ProjectStatus;
  createdAt: string;
  authPolicyId: "bouquet";
  executionPolicyId: "iseol-workflow";
  autonomyPolicyId: "independent-agent";
  decisionPolicyId: "reasoned-agent-decisions";
  documentationPolicyId: "documentation-evidence";
  qualityPolicyId: "production-service";
  deploymentPolicyId: "luna-apps-portal";
  runtimeMessage: string;
};

export type ProjectTeamsState = {
  schemaVersion: 1;
  teams: TeamState[];
  projects: ProjectState[];
  decisions: AgentDecision[];
  evolutionAgentVersion: string;
};
