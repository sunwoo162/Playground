import {
  E2E_CANARY_REQUEST,
  evaluateE2ECanaryProject,
  isE2ECanaryProject,
  validateE2ECanaryPlan,
} from "./e2eCanary";
import type {
  ExecutableAgentRole,
  ProjectPlan,
  ProjectState,
  ProjectTaskRun,
} from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function taskRun(role: ExecutableAgentRole, index: number, done = true): ProjectTaskRun {
  return {
    taskId: `TASK-${index}`,
    role,
    agentId: `rose:${role}`,
    status: done ? "done" : "pending",
    attempts: 1,
    branchName: `agent/rose/${role}/task-${index}`,
    worktreePath: `/tmp/task-${index}`,
    threadId: `thread-${index}`,
    sessionId: `session-${index}`,
    turnId: `turn-${index}`,
    eventsPath: `/tmp/task-${index}.events.jsonl`,
    stderrPath: `/tmp/task-${index}.stderr.log`,
    commitSha: `commit-${index}`,
    pullRequestNumber: index,
    pullRequestUrl: `https://github.com/BloomBouquet/pulsenote/pull/${index}`,
    reviewedPullRequests: role === "code-review" || role === "reviewer" || role === "qa" ? [1, 2] : [],
    summary: `${role} complete`,
    rationaleSummary: "Evidence verified",
    evidence: ["test evidence"],
    verification: [{ name: "test", status: "passed", details: "passed" }],
    blockers: [],
    lastError: null,
    startedAt: "2026-08-26T00:00:00.000Z",
    completedAt: done ? "2026-08-26T00:01:00.000Z" : null,
  };
}

function plan(roles: ExecutableAgentRole[]): ProjectPlan {
  return {
    projectName: "PulseNote",
    repositoryName: "pulsenote",
    productSummary: "E2E canary product",
    architectureSummary: "React + API + SQLite",
    needsAuth: false,
    technologyDecisions: [],
    tasks: roles.map((role, index) => ({
      id: `TASK-${index + 1}`,
      title: `${role} task`,
      role,
      taskSlug: `${role}-task`,
      summary: `${role} work`,
      dependsOn: index === 0 ? [] : [`TASK-${index}`],
      acceptanceCriteria: ["verified"],
    })),
  };
}

function project(projectPlan: ProjectPlan | null, taskRuns: ProjectTaskRun[], status: ProjectState["status"]): ProjectState {
  return {
    id: "PROJECT-E2E-001",
    request: E2E_CANARY_REQUEST,
    teamId: "rose",
    status,
    createdAt: "2026-08-26T00:00:00.000Z",
    completedAt: status === "completed" ? "2026-08-26T01:00:00.000Z" : null,
    intake: {
      id: "INTAKE-E2E-001",
      agentVersion: "1.0.0",
      sessionId: "intake-session",
      eventsPath: "/tmp/intake.events.jsonl",
      outputPath: "/tmp/intake.json",
      createdAt: "2026-08-26T00:00:05.000Z",
      summary: "PulseNote canary",
      primaryUser: "single user",
      primaryJob: "manage daily notes",
      complexity: "small",
      requiredRoles: ["frontend", "backend", "data-marketing", "documentation", "code-review", "reviewer", "qa"],
      criticalRoles: ["frontend", "backend"],
      needsAuth: false,
      userFacing: true,
      externalDependencies: [],
      riskFlags: ["data-persistence", "accessibility"],
      assumptions: [],
      missingInputs: [],
      rationaleSummary: "Canary scope is explicit",
    },
    teamAllocation: {
      strategy: "least-assigned-oldest-idle",
      assignmentCountBefore: 0,
      completedProjectsBefore: 0,
      lastAssignedAt: null,
      reason: "fair allocation",
    },
    authPolicyId: "bouquet",
    executionPolicyId: "iseol-workflow",
    autonomyPolicyId: "independent-agent",
    decisionPolicyId: "reasoned-agent-decisions",
    documentationPolicyId: "documentation-evidence",
    qualityPolicyId: "production-service",
    deploymentPolicyId: "luna-apps-portal",
    plan: projectPlan,
    taskRuns,
    failureRoutes: [],
    replans: [],
    repositoryFullName: projectPlan ? "BloomBouquet/pulsenote" : null,
    workspacePath: projectPlan ? "/workspace/pulsenote" : null,
    pmSessionId: projectPlan ? "pm-session" : null,
    runtimeFailureSource: null,
    runtimeMessage: status === "completed" ? "Agent 회고 및 Team Evolution 저장 완료" : "runtime active",
  };
}

function run() {
  assert(isE2ECanaryProject(project(null, [], "queued")), "canary marker must identify the project");

  const missingBackend = plan([
    "frontend",
    "data-marketing",
    "documentation",
    "code-review",
    "reviewer",
    "qa",
  ]);
  const missingProject = project(missingBackend, [], "development");
  const missingErrors = validateE2ECanaryPlan(missingProject);
  assert(missingErrors.some((error) => error.includes("backend")), "missing backend must block canary plan evidence");
  assert(
    evaluateE2ECanaryProject(missingProject).stages.find((stage) => stage.id === "development")?.status === "blocked",
    "missing implementation role must surface as blocked development stage",
  );

  const roles: ExecutableAgentRole[] = [
    "frontend",
    "backend",
    "data-marketing",
    "documentation",
    "code-review",
    "reviewer",
    "qa",
  ];
  const completeProject = project(
    plan(roles),
    roles.map((role, index) => taskRun(role, index + 1)),
    "completed",
  );
  const report = evaluateE2ECanaryProject(completeProject);
  assert(report.passed, "completed canary with all required evidence must pass");
  assert(report.stages.length === 12, "canary must expose all 12 E2E stages");
  assert(report.stages.every((stage) => stage.status === "passed"), "completed canary stages must all pass");
  assert(report.repositoryFullName === "BloomBouquet/pulsenote", "report must preserve the actual repository");
  assert(report.pullRequests.length === roles.length, "report must preserve Agent PR evidence");

  console.log("PASS  Luna E2E canary evidence scenarios passed.");
}

run();
