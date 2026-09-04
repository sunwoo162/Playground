export type TeamId = "rose" | "lily" | "tulip" | "sunflower" | "cherry-blossom";

export type TeamStatus = "idle" | "reserved" | "working" | "retrospective" | "evolving";

export const AGENT_ROLES = [
  "idea",
  "pm",
  "design-system",
  "designer",
  "ux-research",
  "frontend",
  "backend",
  "database",
  "security",
  "devops",
  "accessibility",
  "performance",
  "api-integration",
  "data-marketing",
  "code-review",
  "reviewer",
  "qa",
  "test-automation",
  "documentation",
  "debug-router",
  "user-a",
  "user-b",
  "process-evaluator",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];
export type ExecutableAgentRole = Exclude<AgentRole, "pm">;

export const AGENT_PERMISSION_VALUES = [
  "repository:read",
  "repository:create",
  "repository:write",
  "branch:create",
  "worktree:create",
  "command:run",
  "dependency:install",
  "test:run",
  "build:run",
  "browser:use",
  "figma:read",
  "commit:create",
  "push",
  "issue:create",
  "issue:update",
  "pull-request:create",
  "pull-request:update",
  "pull-request:review",
  "pull-request:merge",
  "deployment:prepare",
  "deployment:publish",
] as const;

export type AgentPermission = (typeof AGENT_PERMISSION_VALUES)[number];

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

export type RuntimeFailureSource = "pm" | "agent";

export type ProjectIntakeComplexity = "small" | "medium" | "large";
export type ProjectIntakeRiskFlag =
  | "auth"
  | "security"
  | "external-api"
  | "realtime"
  | "payments"
  | "data-persistence"
  | "deployment"
  | "accessibility"
  | "performance"
  | "unknown";

export type ProjectIntakeAnalysis = {
  summary: string;
  primaryUser: string;
  primaryJob: string;
  complexity: ProjectIntakeComplexity;
  requiredRoles: ExecutableAgentRole[];
  criticalRoles: ExecutableAgentRole[];
  needsAuth: boolean;
  userFacing: boolean;
  externalDependencies: string[];
  riskFlags: ProjectIntakeRiskFlag[];
  assumptions: string[];
  missingInputs: string[];
  rationaleSummary: string;
};

export type ProjectIntakeRecord = ProjectIntakeAnalysis & {
  id: string;
  agentVersion: string;
  sessionId: string | null;
  eventsPath: string;
  outputPath: string;
  createdAt: string;
};

export type ScaffoldProfile = "none" | "react-api-sqlite-monorepo-v1";

export type TechnologyDecision = {
  area: string;
  choice: string;
  reason: string;
};

export type ProjectTaskPlan = {
  id: string;
  title: string;
  role: ExecutableAgentRole;
  taskSlug: string;
  summary: string;
  dependsOn: string[];
  acceptanceCriteria: string[];
};

export type ProjectPlan = {
  projectName: string;
  repositoryName: string;
  productSummary: string;
  architectureSummary: string;
  needsAuth: boolean;
  scaffoldProfile?: ScaffoldProfile;
  technologyDecisions: TechnologyDecision[];
  tasks: ProjectTaskPlan[];
};

export type TaskRunStatus = "pending" | "ready" | "running" | "blocked" | "done";
export type VerificationStatus = "passed" | "failed" | "blocked" | "not-run";

export type AgentTaskVerification = {
  name: string;
  status: VerificationStatus;
  details: string;
};

export type ProjectTaskRun = {
  taskId: string;
  role: ExecutableAgentRole;
  agentId: string;
  status: TaskRunStatus;
  attempts: number;
  branchName: string | null;
  worktreePath: string | null;
  threadId: string | null;
  sessionId: string | null;
  turnId: string | null;
  eventsPath: string | null;
  stderrPath: string | null;
  commitSha: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  reviewedPullRequests: number[];
  summary: string | null;
  rationaleSummary: string | null;
  evidence: string[];
  verification: AgentTaskVerification[];
  blockers: string[];
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type FailureRouteAction = "retry-owner" | "escalate-pm" | "needs-human";
export type FailureType =
  | "implementation"
  | "test"
  | "build"
  | "dependency"
  | "environment"
  | "requirements"
  | "security"
  | "external-service"
  | "unknown";
export type FailureSeverity = "low" | "medium" | "high" | "critical";

export type FailureRouteDecision = {
  route: FailureRouteAction;
  failureType: FailureType;
  severity: FailureSeverity;
  ownerTaskId: string | null;
  ownerRole: Exclude<AgentRole, "pm" | "debug-router"> | null;
  summary: string;
  rationaleSummary: string;
  evidence: string[];
  recommendedAction: string;
};

export type FailureRouteRecord = FailureRouteDecision & {
  id: string;
  failedTaskId: string;
  failedRole: ExecutableAgentRole;
  routeAttempt: number;
  routerAgentId: string;
  routerSessionId: string | null;
  eventsPath: string;
  outputPath: string;
  createdAt: string;
};

export type ProjectReplanRecord = {
  id: string;
  triggerRouteId: string;
  replanAttempt: number;
  summary: string;
  rationaleSummary: string;
  retiredTaskIds: string[];
  reopenedTaskIds: string[];
  addedTaskIds: string[];
  pmSessionId: string | null;
  eventsPath: string;
  outputPath: string;
  createdAt: string;
};

export type EvolutionExperimentStatus = "proposed" | "active" | "kept" | "rolled-back";

export type EvolutionMetrics = {
  taskCount: number;
  totalAttempts: number;
  retryCount: number;
  failureRouteCount: number;
  replanCount: number;
  failedVerificationCount: number;
  blockedVerificationCount: number;
};

export type EvolutionVersionSnapshot = {
  playbookVersion: string;
  agentVersions: Record<string, string>;
};

export type EvolutionAgentChange = {
  agentId: string;
  fromVersion: string;
  toVersion: string;
  reason: string;
  instructionChanges: string[];
};

export type EvolutionExperiment = {
  id: string;
  teamId: TeamId;
  sourceProjectId: string;
  targetProjectId: string | null;
  status: EvolutionExperimentStatus;
  playbookChanges: string[];
  agentChanges: EvolutionAgentChange[];
  baseline: EvolutionVersionSnapshot;
  candidate: EvolutionVersionSnapshot;
  baselineMetrics: EvolutionMetrics;
  experimentMetrics: EvolutionMetrics | null;
  verdictReason: string | null;
  createdAt: string;
  activatedAt: string | null;
  completedAt: string | null;
};

export type TeamRolePerformance = {
  role: ExecutableAgentRole;
  projectCount: number;
  taskCount: number;
  retryCount: number;
  routedFailureCount: number;
  verificationIssueCount: number;
  retryRate: number;
  failureRate: number;
  verificationIssueRate: number;
  issueRate: number;
};

export type TeamStrengthConfidence = "emerging" | "established";

export type TeamStrengthEvidence = {
  role: ExecutableAgentRole;
  confidence: TeamStrengthConfidence;
  projectCount: number;
  taskCount: number;
  teamIssueRate: number;
  peerIssueRate: number;
  advantage: number;
  reason: string;
};

export type TeamPerformanceProfile = {
  measuredProjectCount: number;
  rolePerformance: TeamRolePerformance[];
  strengths: TeamStrengthEvidence[];
  updatedAt: string;
};

export type AgentState = {
  id: string;
  role: AgentRole;
  label: string;
  description: string;
  version: string;
  status: AgentStatus;
  retrospectiveCount: number;
  seniority: "senior-10-plus";
  minimumExperienceYears: 10;
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
  performanceProfile?: TeamPerformanceProfile | null;
  agents: AgentState[];
};

export type TeamAllocationEvidence = {
  role: ExecutableAgentRole;
  advantage: number;
  taskCount: number;
};

export type TeamAllocationRecord = {
  strategy: "least-assigned-oldest-idle" | "fairness-guarded-evidence";
  assignmentCountBefore: number;
  completedProjectsBefore: number;
  lastAssignedAt: string | null;
  intakeId?: string | null;
  consideredRoles?: ExecutableAgentRole[];
  establishedStrengthMatches?: TeamAllocationEvidence[];
  fairnessPoolSize?: number;
  maxAssignmentGap?: number;
  reason: string;
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
  completedAt?: string | null;
  intake?: ProjectIntakeRecord | null;
  teamAllocation?: TeamAllocationRecord | null;
  authPolicyId: "bouquet";
  executionPolicyId: "iseol-workflow";
  autonomyPolicyId: "independent-agent";
  decisionPolicyId: "reasoned-agent-decisions";
  documentationPolicyId: "documentation-evidence";
  qualityPolicyId: "production-service";
  deploymentPolicyId: "luna-apps-portal";
  plan: ProjectPlan | null;
  taskRuns: ProjectTaskRun[];
  failureRoutes?: FailureRouteRecord[];
  replans?: ProjectReplanRecord[];
  replanAttempts?: Record<string, number>;
  evolutionExperimentId?: string | null;
  versionSnapshot?: EvolutionVersionSnapshot | null;
  repositoryFullName: string | null;
  workspacePath: string | null;
  pmSessionId: string | null;
  runtimeFailureSource: RuntimeFailureSource | null;
  runtimeMessage: string;
};

export type ProjectTeamsState = {
  schemaVersion: 1;
  teams: TeamState[];
  projects: ProjectState[];
  decisions: AgentDecision[];
  evolutionAgentVersion: string;
  intakeAgentVersion?: string;
  evolutionExperiments?: EvolutionExperiment[];
};
