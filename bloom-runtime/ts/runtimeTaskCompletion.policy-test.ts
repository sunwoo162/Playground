import { refreshOrchestrationReadiness } from "./orchestrationCore";
import {
  applyRuntimeCompletionToTaskRun,
  declaredDependencyPullRequestsForTask,
  type RuntimeTaskRunResultLike,
} from "./runtimeTaskCompletion";
import type { ProjectPlan, ProjectTaskRun } from "./types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const completedAt = "2026-09-04T05:00:00.000Z";

function taskRun(
  taskId: string,
  role: ProjectTaskRun["role"],
  status: ProjectTaskRun["status"] = "running",
): ProjectTaskRun {
  return {
    taskId,
    role,
    agentId: `rose:${role}`,
    status,
    attempts: 1,
    branchName: null,
    worktreePath: null,
    threadId: null,
    sessionId: null,    turnId: null,
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
    startedAt: completedAt,
    completedAt: null,
  };
}

function result(
  role: ProjectTaskRun["role"],
  overrides: Partial<RuntimeTaskRunResultLike> = {},
): RuntimeTaskRunResultLike {
  return {
    taskId: "DEV-001",
    role,
    agentId: `rose:${role}`,
    branchName: role === "qa" ? null : "agent/dev-001",
    worktreePath: "C:/workspace/dev-001",    threadId: "thread-1",
    sessionId: "session-1",
    turnId: "turn-1",
    eventsPath: "C:/runtime/events.jsonl",
    stderrPath: "C:/runtime/stderr.log",
    report: {
      status: "completed",
      summary: "Agent says complete",
      rationaleSummary: "Legacy rationale",
      evidence: ["agent-claimed evidence"],
      verification: [{ name: "claimed", status: "passed", details: "agent claim" }],
      commitSha: role === "qa" ? null : "abc123",
      pullRequestNumber: role === "qa" ? null : 12,
      pullRequestUrl: role === "qa" ? null : "https://github.com/example/repo/pull/12",
      reviewedPullRequests: [],
      blockers: [],
    },
    completionObservations: null,
    ...overrides,
  };
}

const writerRun = taskRun("DEV-001", "frontend");
const rejectedWriter = applyRuntimeCompletionToTaskRun({
  run: writerRun,
  result: result("frontend"),
  declaredDependencyPullRequests: [],
  completedAt,
});assert(rejectedWriter.status === "blocked", "writer without runtime observations must be blocked");
assert(rejectedWriter.commitSha === "abc123", "rejected writer must preserve commit metadata");
assert(rejectedWriter.pullRequestNumber === 12, "rejected writer must preserve PR metadata");
assert(
  rejectedWriter.lastError?.includes("runtime completion observations are missing"),
  "rejected writer must expose deterministic Harness rejection",
);
assert(
  rejectedWriter.evidence[0] === "agent-claimed evidence",
  "legacy evidence must be preserved only for audit",
);

const validWriter = applyRuntimeCompletionToTaskRun({
  run: writerRun,
  result: result("frontend", {
    completionObservations: {
      commands: [],
      publication: {
        branchName: "agent/dev-001",
        commitSha: "abc123",
        pullRequestNumber: 12,
        pullRequestUrl: "https://github.com/example/repo/pull/12",
      },
    },
  }),
  declaredDependencyPullRequests: [],
  completedAt,
});
assert(validWriter.status === "done", "verified writer publication must allow done");
assert(validWriter.lastError === null, "accepted completion must clear lastError");
assert(validWriter.harnessCompletion?.accepted === true, "accepted writer must persist Harness completion");
assert(
  validWriter.harnessCompletion?.evidence.some((item) => item.kind === "file-change") === true,
  "writer record must persist file-change evidence",
);
const plan: ProjectPlan = {
  projectName: "Completion Gate",
  repositoryName: "completion-gate",
  productSummary: "probe",
  architectureSummary: "probe",
  needsAuth: false,
  technologyDecisions: [],
  tasks: [
    {
      id: "DEV-001",
      title: "Writer",
      role: "frontend",
      taskSlug: "writer",
      summary: "write",
      dependsOn: [],
      acceptanceCriteria: [],
    },
    {
      id: "DEV-002",
      title: "Follower",
      role: "backend",
      taskSlug: "follower",
      summary: "follow",
      dependsOn: ["DEV-001"],
      acceptanceCriteria: [],
    },
  ],
};

const dependencyPrs = declaredDependencyPullRequestsForTask(
  plan,
  [{ ...validWriter, pullRequestNumber: 12 }, taskRun("DEV-002", "backend", "pending")],
  "DEV-002",
);
assert(
  dependencyPrs.length === 1 && dependencyPrs[0] === 12,
  "declared dependency PRs must include direct task dependencies",
);

const transitivePlan: ProjectPlan = {
  ...plan,
  tasks: [
    plan.tasks[0],
    { ...plan.tasks[1], id: "CR-001", role: "code-review", dependsOn: ["DEV-001"] },
    {
      id: "REV-001",
      title: "Reviewer",
      role: "reviewer",
      taskSlug: "reviewer",
      summary: "review",
      dependsOn: ["CR-001"],
      acceptanceCriteria: [],
    },
  ],
};
const transitivePrs = declaredDependencyPullRequestsForTask(
  transitivePlan,
  [
    { ...validWriter, pullRequestNumber: 12 },
    taskRun("CR-001", "code-review", "done"),
    taskRun("REV-001", "reviewer", "running"),
  ],
  "REV-001",
);
assert(
  transitivePrs.length === 1 && transitivePrs[0] === 12,
  "declared dependency PRs must include transitive upstream writer PRs",
);

const refreshedAfterReject = refreshOrchestrationReadiness(plan, [
  rejectedWriter,
  taskRun("DEV-002", "backend", "pending"),
]);
assert(
  refreshedAfterReject.find((item) => item.taskId === "DEV-002")?.status === "pending",
  "rejected upstream completion must not unlock downstream tasks",
);

const qaRun = taskRun("QA-001", "qa");
const qaRejected = applyRuntimeCompletionToTaskRun({
  run: qaRun,
  result: {
    ...result("qa"),
    taskId: "QA-001",
  },
  declaredDependencyPullRequests: [],
  completedAt,
});
assert(qaRejected.status === "blocked", "QA without observed test must be blocked");

const qaAccepted = applyRuntimeCompletionToTaskRun({
  run: qaRun,
  result: {
    ...result("qa"),
    taskId: "QA-001",
    completionObservations: {
      commands: [{ step: 7, command: "pnpm", commandClass: "test", ok: true, exitCode: 0 }],
      publication: null,
    },
  },
  declaredDependencyPullRequests: [],
  completedAt,
});
assert(qaAccepted.status === "done", "QA with successful runtime-observed test must be done");

const agentBlocked = applyRuntimeCompletionToTaskRun({
  run: writerRun,
  result: result("frontend", {
    report: {
      ...result("frontend").report,
      status: "blocked",
      blockers: ["needs product decision"],
    },
  }),
  declaredDependencyPullRequests: [],
  completedAt,
});
assert(agentBlocked.status === "blocked", "legacy blocked result must stay blocked");
assert(
  agentBlocked.lastError === "needs product decision",
  "legacy blocker must remain the primary error",
);

console.log("Bloom runtime task completion state policy tests passed");