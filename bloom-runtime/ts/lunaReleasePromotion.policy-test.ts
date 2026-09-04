import type {
  BuilderOrchestrationSnapshot,
  BuilderWorkerClaim,
  BuilderWorkerClient,
  BuilderWorkerRunState,
} from "./builderWorkerAdapter";
import {
  createHeadlessBuilderExecutor,
  type HeadlessBuilderRuntime,
  type HeadlessBuilderSnapshotPayload,
} from "./headlessBuilderExecutor";
import { resolveHarnessPackBinding } from "./harnessPackBinding";
import type { ProjectPlan, ProjectTaskRun } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const plan: ProjectPlan = {
  projectName: "Automatic Release",
  repositoryName: "automatic-release",
  productSummary: "release promotion policy",
  architectureSummary: "writer -> code review -> reviewer -> qa",
  needsAuth: false,
  technologyDecisions: [],
  tasks: [
    { id: "FE-001", title: "Frontend", role: "frontend", taskSlug: "frontend", summary: "build", dependsOn: [], acceptanceCriteria: ["done"] },
    { id: "CR-001", title: "Code review", role: "code-review", taskSlug: "code-review", summary: "review", dependsOn: ["FE-001"], acceptanceCriteria: ["done"] },
    { id: "RV-001", title: "Reviewer", role: "reviewer", taskSlug: "reviewer", summary: "review", dependsOn: ["CR-001"], acceptanceCriteria: ["done"] },
    { id: "QA-001", title: "QA", role: "qa", taskSlug: "qa", summary: "verify", dependsOn: ["RV-001"], acceptanceCriteria: ["done"] },
  ],
};

function doneRun(taskId: string, role: ProjectTaskRun["role"], pullRequestNumber: number | null, reviewedPullRequests: number[]): ProjectTaskRun {
  return {
    taskId,
    role,
    agentId: `rose:${role}`,
    status: "done",
    attempts: 1,
    branchName: pullRequestNumber === null ? null : `agent/${role}`,
    worktreePath: "/tmp/worktree",
    threadId: "thread",
    sessionId: "session",
    turnId: "turn",
    eventsPath: "/tmp/events.jsonl",
    stderrPath: "/tmp/stderr.log",
    commitSha: pullRequestNumber === null ? null : "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    pullRequestNumber,
    pullRequestUrl: pullRequestNumber === null ? null : `https://github.com/example/automatic-release/pull/${pullRequestNumber}`,
    reviewedPullRequests,
    summary: "done",
    rationaleSummary: "verified",
    evidence: [],
    verification: [{ name: "test", status: "passed", details: "passed" }],
    blockers: [],
    lastError: null,
    startedAt: "2026-08-30T14:00:00Z",
    completedAt: "2026-08-30T14:01:00Z",
  };
}

const payload: HeadlessBuilderSnapshotPayload = {
  schemaVersion: 2,
  harnessPackBinding: resolveHarnessPackBinding({ intent: "Build and release automatically" }),
  runId: 50,
  projectId: 60,
  runtimeProjectId: "builder-60",
  intakeId: "builder-run-50",
  request: "Build and release automatically",
  intake: {
    analysis: {
      summary: "ready",
      primaryUser: "user",
      primaryJob: "use app",
      complexity: "medium",
      requiredRoles: ["frontend", "code-review", "reviewer", "qa"],
      criticalRoles: ["frontend", "qa"],
      needsAuth: false,
      userFacing: true,
      externalDependencies: [],
      riskFlags: [],
      assumptions: [],
      missingInputs: [],
      rationaleSummary: "ready",
    },
    sessionId: "intake-session",
    eventsPath: "/tmp/intake.jsonl",
    outputPath: "/tmp/intake.json",
  },
  pm: { sessionId: "pm-session", eventsPath: "/tmp/pm.jsonl", outputPath: "/tmp/pm.json" },
  plan,
  repository: {
    repository: "example/automatic-release",
    workspacePath: "/tmp/automatic-release",
    createdRepository: false,
    clonedRepository: true,
    releaseBranch: "main",
    integrationBranch: "develop",
  },
  taskRuns: [
    doneRun("FE-001", "frontend", 101, []),
    doneRun("CR-001", "code-review", null, [101]),
    doneRun("RV-001", "reviewer", null, [101]),
    doneRun("QA-001", "qa", null, [101]),
  ],
  integrationPullRequestNumbers: [],
  integration: null,
  blockedReason: null,
};

const snapshot: BuilderOrchestrationSnapshot = {
  schemaVersion: 2,
  version: 7,
  phase: "building",
  payloadJson: JSON.stringify(payload),
  updatedByWorkerId: "worker-old",
  updatedAt: "2026-08-30T14:02:00Z",
};

const claim: BuilderWorkerClaim = {
  runId: 50,
  projectId: 60,
  workerId: "builder-worker",
  status: "running",
  leaseExpiresAt: "2026-08-30T14:10:00Z",
  claimCount: 1,
  title: "Automatic Release",
  brief: "Build and release automatically",
  platform: "web",
  features: [],
  authRequired: false,
  templateId: null,
  repositoryFullName: "example/automatic-release",
  previewUrl: null,
  orchestrationSnapshot: snapshot,
};

function state(): BuilderWorkerRunState {
  return {
    runId: 50,
    projectId: 60,
    workerId: "builder-worker",
    status: "running",
    failureReason: null,
    startedAt: "2026-08-30T14:00:00Z",
    heartbeatAt: "2026-08-30T14:02:00Z",
    leaseExpiresAt: "2026-08-30T14:10:00Z",
    finishedAt: null,
    claimCount: 1,
  };
}

async function run() {
  const events: string[] = [];
  let version = snapshot.version;
  const client: BuilderWorkerClient = {
    async claim() { return claim; },
    async heartbeat() { return state(); },
    async loadSnapshot() { return snapshot; },
    async saveSnapshot(_runId, workerId, write) {
      version += 1;
      events.push(`save:${write.phase}`);
      return { schemaVersion: write.schemaVersion, version, phase: write.phase, payloadJson: write.payloadJson, updatedByWorkerId: workerId, updatedAt: "2026-08-30T14:03:00Z" };
    },
    async complete() { return { ...state(), status: "completed", leaseExpiresAt: null, finishedAt: "2026-08-30T14:04:00Z" }; },
    async fail() { return { ...state(), status: "failed", leaseExpiresAt: null, finishedAt: "2026-08-30T14:04:00Z" }; },
  };

  const runtime: HeadlessBuilderRuntime & {
    promoteRelease(input: { repositoryFullName: string; integrationBranch: string; releaseBranch: string }): Promise<{ repositoryFullName: string; releaseSha: string; releasePullRequestNumber: number | null }>;
  } = {
    async analyzeIntake() { throw new Error("not expected"); },
    async planProject() { throw new Error("not expected"); },
    async bootstrapRepository() { throw new Error("not expected"); },
    async dispatchTask() { throw new Error("not expected"); },
    async reconcileTask() { throw new Error("not expected"); },
    async mergePullRequests(input) {
      events.push("merge");
      return {
        repositoryFullName: input.repositoryFullName,
        mergedPullRequests: input.pullRequestNumbers.map((number) => ({ number, url: `https://github.com/example/automatic-release/pull/${number}`, headBranch: "agent/frontend", mergeCommitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" })),
      };
    },
    async promoteRelease(input) {
      events.push("promote");
      assert(input.integrationBranch === "develop", "release promotion must start from the repository integration branch");
      assert(input.releaseBranch === "main", "release promotion must target the repository release branch");
      return {
        repositoryFullName: input.repositoryFullName,
        releaseSha: "cccccccccccccccccccccccccccccccccccccccc",
        releasePullRequestNumber: 102,
      };
    },
  };

  const execute = createHeadlessBuilderExecutor({
    organization: "example",
    workspaceRoot: "/tmp/builder-workspaces",
    teamId: "rose",
    teamName: "Rose",
    runtime,
  });
  const result = await execute(claim, client) as Awaited<ReturnType<typeof execute>> & { releaseSha?: string; workspacePath?: string };

  assert(events.indexOf("merge") >= 0, "Agent PR integration must happen before release promotion");
  assert(events.indexOf("promote") > events.indexOf("merge"), "develop must be promoted to main after Agent PR integration");
  assert(events.lastIndexOf("save:completed") > events.indexOf("promote"), "release SHA must be snapshotted before Builder completion");
  assert(result.releaseSha === "cccccccccccccccccccccccccccccccccccccccc", "Builder result must preserve the exact main release SHA for Luna delivery");
  assert(result.workspacePath === "/tmp/automatic-release", "Builder result must preserve the exact workspace used for delivery");

  console.log("PASS  Luna release promotion follows integration before Builder completion.");
}

void run();
