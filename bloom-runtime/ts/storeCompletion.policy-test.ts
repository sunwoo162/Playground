import { createInitialProjectTeamsState } from "./catalog";
import { beginAgentTasks, completeAgentTask } from "./store";
import type { ProjectPlan, ProjectState, ProjectTaskRun } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function taskRun(status: ProjectTaskRun["status"]): ProjectTaskRun {
  return {
    taskId: "DEV-001",
    role: "frontend",
    agentId: "rose:frontend",
    status,
    attempts: 0,
    branchName: null,
    worktreePath: null,
    threadId: null,
    sessionId: null,
    turnId: null,
    eventsPath: null,
    stderrPath: null,
    commitSha: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    reviewedPullRequests: [],
    summary: null,
    rationaleSummary: null,
    evidence: [],
    verification: [],
    blockers: [],
    lastError: null,
    startedAt: null,
    completedAt: null,
  };
}

const plan: ProjectPlan = {
  projectName: "Store completion gate",
  repositoryName: "store-completion-gate",
  productSummary: "probe",
  architectureSummary: "probe",
  needsAuth: false,
  technologyDecisions: [],
  tasks: [{
    id: "DEV-001",
    title: "Frontend",
    role: "frontend",
    taskSlug: "frontend",
    summary: "write frontend",
    dependsOn: [],
    acceptanceCriteria: [],
  }],
};

function project(status: ProjectTaskRun["status"]): ProjectState {
  return {
    id: "PROJECT-STORE-GATE",
    request: "gate store completion",
    teamId: "rose",
    status: "development",
    createdAt: "2026-09-04T00:00:00.000Z",
    authPolicyId: "bouquet",
    executionPolicyId: "iseol-workflow",
    autonomyPolicyId: "independent-agent",
    decisionPolicyId: "reasoned-agent-decisions",
    documentationPolicyId: "documentation-evidence",
    qualityPolicyId: "production-service",
    deploymentPolicyId: "luna-apps-portal",
    plan,
    taskRuns: [taskRun(status)],
    repositoryFullName: "example/store-completion-gate",
    workspacePath: "C:/workspace/store-completion-gate",
    pmSessionId: "pm-session",
    runtimeFailureSource: null,
    runtimeMessage: "ready",
  };
}

function state(status: ProjectTaskRun["status"]) {
  const value = createInitialProjectTeamsState();
  value.projects = [project(status)];
  return value;
}

const started = beginAgentTasks(state("ready"), "PROJECT-STORE-GATE", ["DEV-001"]);
const startedRun = started.projects[0]?.taskRuns[0];
assert(startedRun?.status === "running", "beginAgentTasks must move a ready task to running");
assert(startedRun.attempts === 1, "beginAgentTasks must increment attempts once");
const completedResult = {
  projectId: "PROJECT-STORE-GATE",
  taskId: "DEV-001",
  role: "frontend",
  agentId: "rose:frontend",
  branchName: "agent/rose/frontend/frontend",
  worktreePath: "C:/workspace/store-completion-gate/.worktrees/frontend",
  threadId: "thread-1",
  sessionId: "session-1",
  turnId: "turn-1",
  eventsPath: "C:/tmp/frontend.jsonl",
  stderrPath: "C:/tmp/frontend.stderr",
  report: {
    status: "completed" as const,
    summary: "frontend complete",
    rationaleSummary: "implemented",
    evidence: ["legacy claim"],
    verification: [{ name: "test", status: "passed" as const, details: "claimed" }],
    commitSha: "abc123",
    pullRequestNumber: 12,
    pullRequestUrl: "https://github.com/example/repo/pull/12",
    reviewedPullRequests: [],
    blockers: [],
  },
};

const rejected = completeAgentTask(state("running"), completedResult);
const rejectedRun = rejected.projects[0]?.taskRuns[0];
assert(rejectedRun?.status === "blocked", "store must fail closed without runtime observations");
assert(rejectedRun.lastError?.includes("observations"), "store rejection must preserve Harness reason");
const accepted = completeAgentTask(state("running"), {
  ...completedResult,
  completionObservations: {
    commands: [],
    publication: {
      branchName: completedResult.branchName,
      commitSha: completedResult.report.commitSha,
      pullRequestNumber: completedResult.report.pullRequestNumber,
      pullRequestUrl: completedResult.report.pullRequestUrl,
    },
  },
});
const acceptedRun = accepted.projects[0]?.taskRuns[0];
assert(acceptedRun?.status === "done", "store must accept runtime-verified writer publication");
assert(acceptedRun.commitSha === "abc123", "accepted store completion must preserve commit metadata");

console.log("store completion policy tests passed");
