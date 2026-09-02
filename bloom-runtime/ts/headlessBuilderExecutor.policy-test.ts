import type {
  BuilderOrchestrationSnapshot,
  BuilderWorkerClaim,
  BuilderWorkerClient,
  BuilderWorkerRunState,
} from "./builderWorkerAdapter";
import {
  createHeadlessBuilderExecutor,
  HEADLESS_BUILDER_SNAPSHOT_SCHEMA_VERSION,
  normalizeBlockingMissingInputs,
  type HeadlessAgentTaskRunResult,
  type HeadlessBuilderRuntime,
  type HeadlessBuilderSnapshotPayload,
} from "./headlessBuilderExecutor";
import {
  prepareOrchestrationPlan,
  refreshOrchestrationReadiness,
} from "./orchestrationCore";
import type { ProjectPlan, ProjectTaskRun, TeamId } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const TEAM_ID: TeamId = "rose";
const CLAIM: BuilderWorkerClaim = {
  runId: 11,
  projectId: 7,
  workerId: "worker-01",
  status: "running",
  leaseExpiresAt: "2026-08-27T01:02:00",
  claimCount: 1,
  title: "Headless Builder Test",
  brief: "실제 웹 서비스를 만들어줘",
  platform: "web",
  features: ["search"],
  authRequired: false,
  templateId: null,
  repositoryFullName: null,
  previewUrl: null,
  orchestrationSnapshot: null,
};

const BASE_PLAN: ProjectPlan = {
  projectName: "Headless Builder Test",
  repositoryName: "headless-builder-test",
  productSummary: "Headless Builder executor 검증용 제품",
  architectureSummary: "Frontend와 Backend를 독립 task로 실행한다.",
  needsAuth: false,
  technologyDecisions: [],
  tasks: [
    {
      id: "FE-001",
      title: "Frontend 구현",
      role: "frontend",
      taskSlug: "frontend-shell",
      summary: "Frontend를 구현한다.",
      dependsOn: [],
      acceptanceCriteria: ["Frontend 결과가 검증된다."],
    },
    {
      id: "BE-001",
      title: "Backend 구현",
      role: "backend",
      taskSlug: "backend-api",
      summary: "Backend를 구현한다.",
      dependsOn: [],
      acceptanceCriteria: ["Backend 결과가 검증된다."],
    },
  ],
};

const WRITER_ROLES = new Set([
  "design-system",
  "designer",
  "frontend",
  "backend",
  "data-marketing",
  "documentation",
  "debug-router",
]);

function runState(status: BuilderWorkerRunState["status"]): BuilderWorkerRunState {
  return {
    runId: CLAIM.runId,
    projectId: CLAIM.projectId,
    workerId: CLAIM.workerId,
    status,
    failureReason: null,
    startedAt: "2026-08-27T01:00:00",
    heartbeatAt: "2026-08-27T01:00:30",
    leaseExpiresAt: status === "running" ? "2026-08-27T01:02:00" : null,
    finishedAt: status === "running" ? null : "2026-08-27T01:01:00",
    claimCount: 1,
  };
}

function fakeClient(
  snapshot: BuilderOrchestrationSnapshot | null,
  events: string[],
) {
  let version = snapshot?.version ?? 0;
  const phases: string[] = [];
  const client: BuilderWorkerClient = {
    async claim() { return CLAIM; },
    async heartbeat() { return runState("running"); },
    async loadSnapshot() {
      events.push("load-snapshot");
      return snapshot;
    },
    async saveSnapshot(_runId, workerId, write) {
      version += 1;
      phases.push(write.phase);
      events.push(`save:${write.phase}`);
      return {
        schemaVersion: write.schemaVersion,
        version,
        phase: write.phase,
        payloadJson: write.payloadJson,
        updatedByWorkerId: workerId,
        updatedAt: "2026-08-27T01:00:30",
      };
    },
    async complete() { return runState("completed"); },
    async fail() { return runState("failed"); },
  };
  return { client, phases };
}

function fakeRuntime(events: string[]) {
  const dispatchCalls: string[] = [];
  const reconcileCalls: string[] = [];
  const pullRequests: number[] = [];
  let nextPullRequest = 100;
  let active = 0;
  let maxActive = 0;

  const completedResult = (
    input: Parameters<HeadlessBuilderRuntime["dispatchTask"]>[0],
    pullRequestNumber: number | null,
  ): HeadlessAgentTaskRunResult => ({
    projectId: input.projectId,
    taskId: input.taskId,
    role: input.role,
    agentId: input.agentId,
    branchName: pullRequestNumber === null ? null : `agent/${input.teamId}/${input.role}/${input.taskSlug}`,
    worktreePath: `/tmp/worktrees/${input.taskId}`,
    threadId: `thread-${input.taskId}`,
    sessionId: `session-${input.taskId}`,
    turnId: `turn-${input.taskId}`,
    eventsPath: `/tmp/events/${input.taskId}.jsonl`,
    stderrPath: `/tmp/events/${input.taskId}.stderr`,
    report: {
      status: "completed",
      summary: `${input.taskId} 완료`,
      rationaleSummary: "검증 가능한 결과를 생성했다.",
      evidence: [`evidence:${input.taskId}`],
      verification: [{ name: "test", status: "passed", details: "passed" }],
      commitSha: pullRequestNumber === null ? null : `sha-${input.taskId}`,
      pullRequestNumber,
      pullRequestUrl: pullRequestNumber === null ? null : `https://github.com/example/repo/pull/${pullRequestNumber}`,
      reviewedPullRequests: WRITER_ROLES.has(input.role) ? [] : [...pullRequests],
      blockers: [],
    },
  });

  const runtime: HeadlessBuilderRuntime = {
    async analyzeIntake() {
      events.push("intake");
      return {
        analysis: {
          summary: "요구사항 분석 완료",
          primaryUser: "사용자",
          primaryJob: "서비스 사용",
          complexity: "medium",
          requiredRoles: ["frontend", "backend"],
          criticalRoles: ["frontend", "backend"],
          needsAuth: false,
          userFacing: true,
          externalDependencies: [],
          riskFlags: [],
          assumptions: [],
          missingInputs: [],
          rationaleSummary: "추가 확인 없이 진행 가능",
        },
        sessionId: "intake-session",
        eventsPath: "/tmp/intake-events.jsonl",
        outputPath: "/tmp/intake.json",
      };
    },
    async planProject() {
      events.push("pm");
      return {
        plan: BASE_PLAN,
        sessionId: "pm-session",
        eventsPath: "/tmp/pm-events.jsonl",
        outputPath: "/tmp/pm.json",
      };
    },
    async bootstrapRepository() {
      events.push("bootstrap");
      return {
        repository: "example/headless-builder-test",
        workspacePath: "/tmp/headless-builder-test",
        createdRepository: true,
        clonedRepository: true,
        releaseBranch: "main",
        integrationBranch: "develop",
      };
    },
    async dispatchTask(input) {
      dispatchCalls.push(input.taskId);
      events.push(`dispatch:${input.taskId}`);
      active += 1;
      maxActive = Math.max(maxActive, active);
      const writer = WRITER_ROLES.has(input.role);
      const pullRequestNumber = writer ? nextPullRequest++ : null;
      if (pullRequestNumber !== null) pullRequests.push(pullRequestNumber);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return completedResult(input, pullRequestNumber);
    },
    async reconcileTask(input) {
      reconcileCalls.push(input.taskId);
      events.push(`reconcile:${input.taskId}`);
      const pullRequestNumber = 201;
      if (!pullRequests.includes(pullRequestNumber)) pullRequests.push(pullRequestNumber);
      return {
        outcome: "recovered",
        reason: "repository evidence recovered",
        result: completedResult({
          organization: "example",
          projectId: input.projectId,
          teamId: input.teamId,
          teamName: "Rose",
          role: input.role,
          agentId: input.agentId,
          taskId: input.taskId,
          taskSlug: input.taskSlug,
          title: input.taskId,
          summary: input.taskId,
          acceptanceCriteria: ["recovered"],
          userRequest: "request",
          productSummary: "product",
          architectureSummary: "architecture",
          repositoryFullName: input.repositoryFullName,
          workspacePath: input.workspacePath,
          dependencies: [],
        }, pullRequestNumber),
      };
    },
    async mergePullRequests(input) {
      events.push("merge");
      return {
        repositoryFullName: input.repositoryFullName,
        mergedPullRequests: input.pullRequestNumbers.map((number) => ({
          number,
          url: `https://github.com/example/repo/pull/${number}`,
          headBranch: `agent/branch-${number}`,
          mergeCommitSha: `merge-${number}`,
        })),
      };
    },
    async promoteRelease(input) {
      events.push("promote-release");
      return {
        repositoryFullName: input.repositoryFullName,
        releaseSha: "0123456789abcdef0123456789abcdef01234567",
        releasePullRequestNumber: 202,
      };
    },
  };

  return {
    runtime,
    dispatchCalls,
    reconcileCalls,
    get maxActive() { return maxActive; },
  };
}

function executor(runtime: HeadlessBuilderRuntime) {
  let tick = 0;
  return createHeadlessBuilderExecutor({
    organization: "example",
    workspaceRoot: "/tmp/builder-workspaces",
    teamId: TEAM_ID,
    teamName: "Rose",
    runtime,
    now: () => `2026-08-27T01:00:${String(tick++).padStart(2, "0")}Z`,
  });
}

function runningSnapshot(): BuilderOrchestrationSnapshot {
  const plan = prepareOrchestrationPlan(BASE_PLAN);
  let taskRuns: ProjectTaskRun[] = refreshOrchestrationReadiness(
    plan,
    plan.tasks.map((task) => ({
      taskId: task.id,
      role: task.role,
      agentId: `${TEAM_ID}:${task.role}`,
      status: "pending",
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
    })),
  );
  taskRuns = taskRuns.map((run) => run.taskId === "FE-001"
    ? { ...run, status: "running", attempts: 1, startedAt: "2026-08-27T00:59:00Z" }
    : run);

  const payload: HeadlessBuilderSnapshotPayload = {
    schemaVersion: HEADLESS_BUILDER_SNAPSHOT_SCHEMA_VERSION,
    runId: CLAIM.runId,
    projectId: CLAIM.projectId,
    runtimeProjectId: `builder-${CLAIM.projectId}`,
    intakeId: `builder-run-${CLAIM.runId}`,
    request: "Project title: Headless Builder Test\n실제 웹 서비스를 만들어줘",
    intake: {
      analysis: {
        summary: "분석 완료",
        primaryUser: "사용자",
        primaryJob: "서비스 사용",
        complexity: "medium",
        requiredRoles: ["frontend", "backend"],
        criticalRoles: ["frontend", "backend"],
        needsAuth: false,
        userFacing: true,
        externalDependencies: [],
        riskFlags: [],
        assumptions: [],
        missingInputs: [],
        rationaleSummary: "진행 가능",
      },
      sessionId: "intake-session",
      eventsPath: "/tmp/intake-events.jsonl",
      outputPath: "/tmp/intake.json",
    },
    pm: {
      sessionId: "pm-session",
      eventsPath: "/tmp/pm-events.jsonl",
      outputPath: "/tmp/pm.json",
    },
    plan,
    repository: {
      repository: "example/headless-builder-test",
      workspacePath: "/tmp/headless-builder-test",
      createdRepository: true,
      clonedRepository: true,
      releaseBranch: "main",
      integrationBranch: "develop",
    },
    taskRuns,
    integrationPullRequestNumbers: [],
    integration: null,
    blockedReason: null,
  };

  return {
    schemaVersion: HEADLESS_BUILDER_SNAPSHOT_SCHEMA_VERSION,
    version: 4,
    phase: "building",
    payloadJson: JSON.stringify(payload),
    updatedByWorkerId: "worker-old",
    updatedAt: "2026-08-27T00:59:30Z",
  };
}

async function testFreshClaimPersistsEveryExternalSideEffectBoundary() {
  const events: string[] = [];
  const runtime = fakeRuntime(events);
  const { client, phases } = fakeClient(null, events);
  const result = await executor(runtime.runtime)(CLAIM, client);

  assert(result.repositoryFullName === "example/headless-builder-test", "executor must return the bootstrapped repository only after integration");
  assert(events.indexOf("intake") < events.indexOf("save:planning"), "Intake result must be snapshotted before PM planning");
  assert(events.indexOf("pm") < events.indexOf("save:repository"), "PM plan must be snapshotted before repository bootstrap");
  assert(events.indexOf("save:repository") < events.indexOf("bootstrap"), "repository side effect must happen only after the PM plan snapshot");
  assert(events.indexOf("merge") < events.lastIndexOf("save:completed"), "integration result must be persisted before executor returns");
  assert(phases.includes("integration") && phases[phases.length - 1] === "completed", "executor must pass an explicit integration snapshot before completed");
  assert(runtime.maxActive <= 2, "headless task wave must preserve the shared max parallel limit of 2");
  assert(runtime.maxActive === 2, "independent frontend/backend tasks should execute in the same two-task wave");
}

async function testInterruptedRunningTaskReconcilesBeforeAnyRedispatch() {
  const events: string[] = [];
  const runtime = fakeRuntime(events);
  const snapshot = runningSnapshot();
  const claim = { ...CLAIM, orchestrationSnapshot: snapshot };
  const { client } = fakeClient(snapshot, events);

  await executor(runtime.runtime)(claim, client);

  assert(runtime.reconcileCalls.includes("FE-001"), "running task must use evidence reconciliation on a reclaimed snapshot");
  assert(!runtime.dispatchCalls.includes("FE-001"), "recovered running task must never be blindly dispatched again");
  assert(events.indexOf("reconcile:FE-001") < events.findIndex((event) => event.startsWith("dispatch:")), "reconciliation must happen before new task execution");
}

async function testUnrecoverableRunningTaskBlocksWithoutRedispatch() {
  const events: string[] = [];
  const runtime = fakeRuntime(events);
  runtime.runtime.reconcileTask = async (input) => {
    runtime.reconcileCalls.push(input.taskId);
    events.push(`reconcile:${input.taskId}`);
    return { outcome: "blocked", reason: "terminal evidence missing", result: null };
  };
  const snapshot = runningSnapshot();
  const claim = { ...CLAIM, orchestrationSnapshot: snapshot };
  const { client, phases } = fakeClient(snapshot, events);

  let rejected = false;
  try {
    await executor(runtime.runtime)(claim, client);
  } catch {
    rejected = true;
  }

  assert(rejected, "unrecoverable running task must stop the executor");
  assert(runtime.dispatchCalls.length === 0, "unrecoverable running task must not be re-executed");
  assert(phases.includes("blocked"), "unrecoverable task evidence must be durably snapshotted as blocked");
}

function testCopiedIntakeBlockerCatalogIsNonBlocking() {
  const copied = "a required credential/secret for a mandatory external service / legal/ownership authorization / an irreversible destructive target / a required external endpoint/dataset that the platform cannot provision";
  const normalized = normalizeBlockingMissingInputs([copied]);
  assert(normalized.length === 0, "copied intake blocker examples must not block execution");

  const concrete = normalizeBlockingMissingInputs(["Stripe production API secret"]);
  assert(concrete.length === 1, "a concrete missing production credential must remain blocking");
}

async function run() {
  await testFreshClaimPersistsEveryExternalSideEffectBoundary();
  await testInterruptedRunningTaskReconcilesBeforeAnyRedispatch();
  await testUnrecoverableRunningTaskBlocksWithoutRedispatch();
  testCopiedIntakeBlockerCatalogIsNonBlocking();
  console.log("headlessBuilderExecutor policy tests passed");
}

void run();
