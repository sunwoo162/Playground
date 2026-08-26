export type TeamId = "rose" | "lily" | "tulip" | "sunflower" | "cherry-blossom";

export type TeamStatus = "idle" | "reserved" | "working" | "retrospective" | "evolving";

export type AgentRole =
  | "idea"
  | "pm"
  | "design-system"
  | "designer"
  | "frontend"
  | "backend"
  | "reviewer"
  | "qa"
  | "debug-router"
  | "user-a"
  | "user-b"
  | "process-evaluator";

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

export type ProjectState = {
  id: string;
  request: string;
  teamId: TeamId;
  status: ProjectStatus;
  createdAt: string;
  authPolicyId: "bouquet";
  executionPolicyId: "iseol-workflow";
  runtimeMessage: string;
};

export type ProjectTeamsState = {
  schemaVersion: 1;
  teams: TeamState[];
  projects: ProjectState[];
  evolutionAgentVersion: string;
};
