import { createInitialProjectTeamsState } from "./catalog";
import { auditLiveE2EProject, LIVE_E2E_MARKER } from "./e2eSmoke";
import type {
  ExecutableAgentRole,
  ProjectState,
  ProjectTaskPlan,
  ProjectTaskRun,
  ProjectTeamsState,
} from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const roles: ExecutableAgentRole[] = [
  "frontend",
  "backend",
  "data-marketing",
  "documentation",
  "code-review",
  "reviewer",
  "qa",
];

function task(role: ExecutableAgentRole, index: number): ProjectTaskPlan {
  return {
    id: `TASK-${String(index + 1).padStart(3, "0")}`,
    title: `${role} task`,
    role,
    taskSlug: `${role}-task`,
    summary: `${role} E2E fixture task`,
    dependsOn: index === 0 ? [] : [`TASK-${String(index).padStart(3, "0")}`],
    acceptanceCriteria: ["fixture complete"],
  };
}

function run(
  role: ExecutableAgentRole,
  index: number,
  reviewedPullRequests: number[],
): ProjectTaskRun {
  const writer = ["frontend", "backend", "data-marketing", "documentation"].includes(role);
  return {
    taskId: `TASK-${String(index + 1).padStart(3, "0")}`,
    role,
    agentId: `rose:${role}`,
    status: "done",
    attempts: 1,
    branchName: writer ? `agent/rose/${role}/${role}-task` : null,
    worktreePath: writer ? `/tmp/${role}` : null,
    threadId: `thread-${role}`,
    sessionId: `thread-${role}-turn-${role}`,
    turnId: `turn-${role}`,
    eventsPath: `/tmp/${role}.events.jsonl`,
    stderrPath: `/tmp/${role}.stderr.log`,
    commitSha: writer ? `${index + 1}`.repeat(40).slice(0, 40) : null,
    pullRequestNumber: writer ? 100 + index : null,
    pullRequestUrl: writer ? `https://github.com/BloomBouquet/e2e/pull/${100 + index}` : null,
    reviewedPullRequests,
    summary: `${role} complete`,
    rationaleSummary: "fixture evidence",
    evidence: ["fixture evidence"],
    verification: [{ name: "fixture", status: "passed", details: "passed" }],
    blockers: [],
    lastError: null,
    startedAt: "2026-08-26T00:00:00.000Z",
    completedAt: "2026-08-26T00:01:00.000Z",
  };
}

function completedFixture(): ProjectTeamsState {
  const state = createInitialProjectTeamsState();
  const tasks = roles.map(task);
  const writerPrs = [100, 101, 102, 103];
  const taskRuns = roles.map((role, index) =>
    run(role, index, role === "code-review" ? writerPrs : []),
  );
  const project: ProjectState = {
    id: "PROJECT-E2E-FIXTURE",
    request: `${LIVE_E2E_MARKER} build Pulseboard`,
    teamId: "rose",
    status: "completed",
    createdAt: "2026-08-26T00:00:00.000Z",
    completedAt: "2026-08-26T00:10:00.000Z",
    intake: {
      id: "INTAKE-E2E",
      agentVersion: "1.0.0",
      sessionId: "intake-session",
      eventsPath: "/tmp/intake.events.jsonl",
      outputPath: "/tmp/intake.json",
      createdAt: "2026-08-26T00:00:01.000Z",
      summary: "Pulseboard",
      primaryUser: "small product team",
      primaryJob: "track feedback",
      complexity: "medium",
      requiredRoles: ["frontend", "backend", "data-marketing", "documentation", "code-review", "reviewer", "qa"],
      criticalRoles: ["frontend", "backend"],
      needsAuth: false,
      userFacing: true,
      externalDependencies: [],
      riskFlags: ["data-persistence"],
      assumptions: [],
      missingInputs: [],
      rationaleSummary: "fixture intake",
    },
    teamAllocation: {
      strategy: "fairness-guarded-evidence",
      assignmentCountBefore: 0,
      completedProjectsBefore: 0,
      lastAssignedAt: null,
      reason: "fixture allocation",
    },
    authPolicyId: "bouquet",
    executionPolicyId: "iseol-workflow",
    autonomyPolicyId: "independent-agent",
    decisionPolicyId: "reasoned-agent-decisions",
    documentationPolicyId: "documentation-evidence",
    qualityPolicyId: "production-service",
    deploymentPolicyId: "luna-apps-portal",
    plan: {
      projectName: "Pulseboard",
      repositoryName: "luna-e2e-pulseboard-fixture",
      productSummary: "E2E fixture",
      architectureSummary: "web + API + SQLite",
      needsAuth: false,
      technologyDecisions: [],
      tasks,
    },
    taskRuns,
    repositoryFullName: "BloomBouquet/luna-e2e-pulseboard-fixture",
    workspacePath: "/tmp/luna-e2e-pulseboard-fixture",
    pmSessionId: "pm-session",
    runtimeFailureSource: null,
    runtimeMessage: "Agent 회고 7개 및 Team Evolution 제안 0개 저장 완료 · 프로젝트 아카이브 완료",
  };

  return {
    ...state,
    projects: [project],
    teams: state.teams.map((team) =>
      team.id === "rose"
        ? { ...team, status: "idle", activeProjectId: null, completedProjects: 1 }
        : team,
    ),
  };
}

function main() {
  const completed = completedFixture();
  const project = completed.projects[0];
  const audit = auditLiveE2EProject(completed, project);
  assert(audit.passed, `completed E2E fixture must pass: ${audit.checks.filter((item) => item.status !== "pass").map((item) => item.id).join(", ")}`);
  assert(audit.completedChecks === audit.totalChecks, "all E2E checks must be complete");

  const running: ProjectTeamsState = {
    ...completed,
    projects: [{
      ...project,
      status: "development",
      completedAt: null,
      runtimeMessage: "Agent execution in progress",
      taskRuns: project.taskRuns.map((item, index) =>
        index === 0 ? { ...item, status: "running" as const } : { ...item, status: "pending" as const },
      ),
    }],
    teams: completed.teams.map((team) =>
      team.id === "rose" ? { ...team, status: "working", activeProjectId: project.id } : team,
    ),
  };
  const runningAudit = auditLiveE2EProject(running, running.projects[0]);
  assert(!runningAudit.passed, "in-progress E2E fixture must not pass");
  assert(runningAudit.checks.some((item) => item.status === "pending"), "in-progress fixture should expose pending checks");

  console.log("PASS  Luna live E2E smoke audit scenarios passed.");
}

main();
