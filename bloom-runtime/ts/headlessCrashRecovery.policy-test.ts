import type {
  BuilderOrchestrationSnapshot,
  BuilderWorkerClaim,
  BuilderWorkerClient,
  BuilderWorkerRunState,
} from "./builderWorkerAdapter";
import {
  createHeadlessBuilderExecutor,
  type HeadlessAgentTaskRunResult,
  type HeadlessBuilderRuntime,
  type HeadlessBuilderSnapshotPayload,
} from "./headlessBuilderExecutor";
import { REPOSITORY_WRITER_ROLES } from "./planTopology";
import type { ExecutableAgentRole, ProjectPlan, TeamId } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const TEAM_ID: TeamId = "rose";
const CLAIM: BuilderWorkerClaim = {
  runId: 77,
  projectId: 33,
  workerId: "worker-crash-test",
  status: "running",
  leaseExpiresAt: "2026-08-27T08:00:00Z",
  claimCount: 1,
  title: "Crash Recovery Test",
  brief: "복구 가능한 웹 서비스를 만들어줘",
  platform: "web",
  features: ["dashboard"],
  authRequired: false,
  templateId: null,
  repositoryFullName: null,
  previewUrl: null,
  orchestrationSnapshot: null,
};

const BASE_PLAN: ProjectPlan = {
  projectName: "Crash Recovery Test",
  repositoryName: "crash-recovery-test",
  productSummary: "Bloom crash recovery 검증용 제품",
  architectureSummary: "Frontend 결과를 review topology로 검증한다.",
  needsAuth: false,
  technologyDecisions: [],
  tasks: [
    {
      id: "FE-001",
      title: "Frontend 구현",
      role: "frontend",
      taskSlug: "frontend-shell",
      summary: "Frontend shell을 구현한다.",
      dependsOn: [],
      acceptanceCriteria: ["Frontend 결과가 검증된다."],
    },
  ],
};

function runState(status: BuilderWorkerRunState["status"]): BuilderWorkerRunState {
  return {
    runId: CLAIM.runId,
    projectId: CLAIM.projectId,
    workerId: CLAIM.workerId,
    status,
    failureReason: null,
    startedAt: "2026-08-27T07:00:00Z",
    heartbeatAt: "2026-08-27T07:00:30Z",
    leaseExpiresAt: status === "running" ? "2026-08-27T08:00:00Z" : null,
    finishedAt: status === "running" ? null : "2026-08-27T07:10:00Z",
    claimCount: 1,
  };
}

function parsePayload(snapshot: BuilderOrchestrationSnapshot | null) {
  if (!snapshot) return null;
  return JSON.parse(snapshot.payloadJson) as HeadlessBuilderSnapshotPayload;
}

type CrashPredicate = (
  next: HeadlessBuilderSnapshotPayload,
  previous: HeadlessBuilderSnapshotPayload | null,
  phase: string,
) => boolean;

function persistentClient(crashPredicate: CrashPredicate) {
  let stored: BuilderOrchestrationSnapshot | null = null;
  let crashArmed = true;
  let crashCount = 0;

  const client: BuilderWorkerClient = {
    async claim() {
      return { ...CLAIM, orchestrationSnapshot: stored };
    },
    async heartbeat() {
      return runState("running");
    },
    async loadSnapshot() {
      return stored;
    },
    async saveSnapshot(_runId, workerId, write) {
      const currentVersion = stored?.version ?? 0;
      if (write.expectedVersion !== currentVersion) {
        throw new Error(`snapshot version conflict: expected=${write.expectedVersion}, actual=${currentVersion}`);
      }

      const nextPayload = JSON.parse(write.payloadJson) as HeadlessBuilderSnapshotPayload;
      const previousPayload = parsePayload(stored);
      if (crashArmed && crashPredicate(nextPayload, previousPayload, write.phase)) {
        crashArmed = false;
        crashCount += 1;
        throw new Error("[FAILURE-INJECTION] simulated worker crash before snapshot commit");
      }

      stored = {
        schemaVersion: write.schemaVersion,
        version: currentVersion + 1,
        phase: write.phase,
        payloadJson: write.payloadJson,
        updatedByWorkerId: workerId,
        updatedAt: "2026-08-27T07:00:30Z",
      };
      return stored;
    },
    async complete() {
      return runState("completed");
    },
    async fail() {
      return runState("failed");
    },
  };

  return {
    client,
    get snapshot() { return stored; },
    get crashCount() { return crashCount; },
  };
}

function fakeRuntime() {
  const dispatchCount = new Map<string, number>();
  const reconcileCount = new Map<string, number>();
  const evidenceByTask = new Map<string, HeadlessAgentTaskRunResult>();
  const pullRequestByTask = new Map<string, number>();
  const branchEffects = new Set<string>();
  const mergedPullRequests = new Set<number>();
  let nextPullRequest = 500;
  let bootstrapCalls = 0;
  let repositoryCreateEffects = 0;
  let mergeCalls = 0;
  let mergeEffects = 0;

  const makeResult = (
    input: Parameters<HeadlessBuilderRuntime["dispatchTask"]>[0],
  ): HeadlessAgentTaskRunResult => {
    const writer = REPOSITORY_WRITER_ROLES.includes(input.role);
    let pullRequestNumber: number | null = null;
    let branchName: string | null = null;

    if (writer) {
      pullRequestNumber = pullRequestByTask.get(input.taskId) ?? null;
      if (pullRequestNumber === null) {
        pullRequestNumber = nextPullRequest++;
        pullRequestByTask.set(input.taskId, pullRequestNumber);
      }
      branchName = `agent/${input.teamId}/${input.agentId.replace(":", "-")}/${input.taskSlug}`;
      branchEffects.add(branchName);
    }

    const reviewedPullRequests = ["code-review", "reviewer", "qa"].includes(input.role)
      ? [...pullRequestByTask.values()].sort((left, right) => left - right)
      : [];

    return {
      projectId: input.projectId,
      taskId: input.taskId,
      role: input.role,
      agentId: input.agentId,
      branchName,
      worktreePath: `/tmp/worktrees/${input.taskId}`,
      threadId: `thread-${input.taskId}`,
      sessionId: `session-${input.taskId}`,
      turnId: `turn-${input.taskId}`,
      eventsPath: `/tmp/events/${input.taskId}.jsonl`,
      stderrPath: `/tmp/events/${input.taskId}.stderr`,
      report: {
        status: "completed",
        summary: `${input.taskId} 완료`,
        rationaleSummary: "repository evidence를 남겼다.",
        evidence: [`evidence:${input.taskId}`],
        verification: [{ name: "policy", status: "passed", details: "passed" }],
        commitSha: writer ? `sha-${input.taskId}` : null,
        pullRequestNumber,
        pullRequestUrl: pullRequestNumber === null
          ? null
          : `https://github.com/example/crash-recovery-test/pull/${pullRequestNumber}`,
        reviewedPullRequests,
        blockers: [],
      },
    };
  };

  const runtime: HeadlessBuilderRuntime = {
    async analyzeIntake() {
      return {
        analysis: {
          summary: "요구사항 분석 완료",
          primaryUser: "사용자",
          primaryJob: "서비스 사용",
          complexity: "medium",
          requiredRoles: ["frontend"],
          criticalRoles: ["frontend"],
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
      return {
        plan: BASE_PLAN,
        sessionId: "pm-session",
        eventsPath: "/tmp/pm-events.jsonl",
        outputPath: "/tmp/pm.json",
      };
    },
    async bootstrapRepository() {
      bootstrapCalls += 1;
      if (bootstrapCalls === 1) repositoryCreateEffects += 1;
      return {
        repository: "example/crash-recovery-test",
        workspacePath: "/tmp/crash-recovery-test",
        createdRepository: bootstrapCalls === 1,
        clonedRepository: true,
        releaseBranch: "main",
        integrationBranch: "develop",
      };
    },
    async dispatchTask(input) {
      dispatchCount.set(input.taskId, (dispatchCount.get(input.taskId) ?? 0) + 1);
      const result = makeResult(input);
      evidenceByTask.set(input.taskId, result);
      return result;
    },
    async reconcileTask(input) {
      reconcileCount.set(input.taskId, (reconcileCount.get(input.taskId) ?? 0) + 1);
      const result = evidenceByTask.get(input.taskId) ?? null;
      return result
        ? { outcome: "recovered" as const, reason: "durable repository/session evidence found", result }
        : { outcome: "blocked" as const, reason: "durable evidence missing", result: null };
    },
    async mergePullRequests(input) {
      mergeCalls += 1;
      const uniqueNumbers = [...new Set(input.pullRequestNumbers)].sort((left, right) => left - right);
      for (const number of uniqueNumbers) {
        if (!mergedPullRequests.has(number)) {
          mergedPullRequests.add(number);
          mergeEffects += 1;
        }
      }
      return {
        repositoryFullName: input.repositoryFullName,
        mergedPullRequests: uniqueNumbers.map((number) => ({
          number,
          url: `https://github.com/example/crash-recovery-test/pull/${number}`,
          headBranch: `agent/recovered-${number}`,
          mergeCommitSha: `merge-${number}`,
        })),
      };
    },
  };

  return {
    runtime,
    dispatchCount,
    reconcileCount,
    evidenceByTask,
    pullRequestByTask,
    branchEffects,
    mergedPullRequests,
    get bootstrapCalls() { return bootstrapCalls; },
    get repositoryCreateEffects() { return repositoryCreateEffects; },
    get mergeCalls() { return mergeCalls; },
    get mergeEffects() { return mergeEffects; },
  };
}

function makeExecutor(runtime: HeadlessBuilderRuntime) {
  let tick = 0;
  return createHeadlessBuilderExecutor({
    organization: "example",
    workspaceRoot: "/tmp/builder-workspaces",
    teamId: TEAM_ID,
    teamName: "Rose",
    runtime,
    now: () => `2026-08-27T07:${String(Math.floor(tick / 60)).padStart(2, "0")}:${String(tick++ % 60).padStart(2, "0")}Z`,
  });
}

async function expectInjectedCrash(
  executor: ReturnType<typeof makeExecutor>,
  client: BuilderWorkerClient,
) {
  let crashed = false;
  try {
    await executor(CLAIM, client);
  } catch (error) {
    crashed = error instanceof Error && error.message.includes("[FAILURE-INJECTION]");
  }
  assert(crashed, "first execution must stop at the configured failure injection boundary");
}

async function resumeToCompletion(
  executor: ReturnType<typeof makeExecutor>,
  client: BuilderWorkerClient,
) {
  const result = await executor(CLAIM, client);
  assert(result.repositoryFullName === "example/crash-recovery-test", "resumed executor must complete the same repository");
}

function transitionedRoleToDone(
  role: ExecutableAgentRole,
): CrashPredicate {
  return (next, previous, phase) => {
    if (phase !== "building" || !previous) return false;
    const nextRun = next.taskRuns.find((run) => run.role === role && run.status === "done");
    if (!nextRun) return false;
    const previousRun = previous.taskRuns.find((run) => run.taskId === nextRun.taskId);
    return previousRun?.status === "running";
  };
}

async function testRepositoryBootstrapIsSafeAcrossSnapshotCrash() {
  const runtime = fakeRuntime();
  const storage = persistentClient((next, previous, phase) =>
    phase === "building"
    && previous?.phase === undefined
    && next.repository !== null);

  // The first durable snapshot before repository bootstrap is phase=repository. Detect the
  // following building snapshot by inspecting the stored payload rather than relying on a
  // process-local flag.
  const storageWithRepositoryBoundary = persistentClient((next, previous, phase) =>
    phase === "building"
    && previous?.repository === null
    && next.repository !== null);
  const executor = makeExecutor(runtime.runtime);

  void storage;
  await expectInjectedCrash(executor, storageWithRepositoryBoundary.client);
  await resumeToCompletion(executor, storageWithRepositoryBoundary.client);

  assert(storageWithRepositoryBoundary.crashCount === 1, "repository failure injection must fire exactly once");
  assert(runtime.bootstrapCalls === 2, "repository bootstrap may be re-entered after an uncommitted snapshot");
  assert(runtime.repositoryCreateEffects === 1, "idempotent bootstrap must not create the repository twice");
}

async function testWriterCommitAndPullRequestRecoverWithoutRedispatch() {
  const runtime = fakeRuntime();
  const storage = persistentClient(transitionedRoleToDone("frontend"));
  const executor = makeExecutor(runtime.runtime);

  await expectInjectedCrash(executor, storage.client);
  const frontendEvidence = [...runtime.evidenceByTask.values()].find((result) => result.role === "frontend");
  assert(frontendEvidence?.report.commitSha, "failure must occur after writer commit evidence exists");
  assert(frontendEvidence?.report.pullRequestNumber, "failure must occur after writer PR evidence exists");

  await resumeToCompletion(executor, storage.client);

  const taskId = frontendEvidence.taskId;
  assert(runtime.dispatchCount.get(taskId) === 1, "recovered writer task must not be dispatched twice");
  assert(runtime.reconcileCount.get(taskId) === 1, "reclaimed writer task must reconcile repository/session evidence once");
  assert(runtime.branchEffects.size === runtime.pullRequestByTask.size, "each writer PR must keep one deterministic branch side effect");
}

async function testReviewEvidenceRecoversWithoutDuplicateReview() {
  const runtime = fakeRuntime();
  const storage = persistentClient(transitionedRoleToDone("code-review"));
  const executor = makeExecutor(runtime.runtime);

  await expectInjectedCrash(executor, storage.client);
  const reviewEvidence = [...runtime.evidenceByTask.values()].find((result) => result.role === "code-review");
  assert(reviewEvidence, "failure injection must reach a code-review task");
  assert(reviewEvidence.report.reviewedPullRequests.length > 0, "review evidence must reference upstream PRs before the crash");

  await resumeToCompletion(executor, storage.client);

  assert(runtime.dispatchCount.get(reviewEvidence.taskId) === 1, "recovered code review must not be executed twice");
  assert(runtime.reconcileCount.get(reviewEvidence.taskId) === 1, "recovered code review must use reconciliation evidence");
}

async function testMergedPullRequestsAreIdempotentAcrossCompletedSnapshotCrash() {
  const runtime = fakeRuntime();
  const storage = persistentClient((_next, _previous, phase) => phase === "completed");
  const executor = makeExecutor(runtime.runtime);

  await expectInjectedCrash(executor, storage.client);
  const mergedBeforeRestart = runtime.mergedPullRequests.size;
  assert(mergedBeforeRestart > 0, "integration side effects must exist before the completed snapshot crash");
  assert(runtime.mergeCalls === 1, "first execution must invoke integration once before crashing");

  await resumeToCompletion(executor, storage.client);

  assert(runtime.mergeCalls === 2, "restart may re-enter the idempotent integration command when completed evidence was not snapshotted");
  assert(runtime.mergeEffects === mergedBeforeRestart, "idempotent integration must not merge any PR twice");
  assert(runtime.mergedPullRequests.size === mergedBeforeRestart, "restart must preserve the same merged PR set");
}

async function run() {
  await testRepositoryBootstrapIsSafeAcrossSnapshotCrash();
  await testWriterCommitAndPullRequestRecoverWithoutRedispatch();
  await testReviewEvidenceRecoversWithoutDuplicateReview();
  await testMergedPullRequestsAreIdempotentAcrossCompletedSnapshotCrash();
  console.log("headless crash recovery policy tests passed");
}

void run();
