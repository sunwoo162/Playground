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

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function checkEqual(actual: number | undefined, expected: number, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected=${expected}, actual=${String(actual)}`);
  }
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
  tasks: [{
    id: "FE-001",
    title: "Frontend 구현",
    role: "frontend",
    taskSlug: "frontend-shell",
    summary: "Frontend shell을 구현한다.",
    dependsOn: [],
    acceptanceCriteria: ["Frontend 결과가 검증된다."],
  }],
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
  return snapshot
    ? JSON.parse(snapshot.payloadJson) as HeadlessBuilderSnapshotPayload
    : null;
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
    async claim() { return { ...CLAIM, orchestrationSnapshot: stored }; },
    async heartbeat() { return runState("running"); },
    async loadSnapshot() { return stored; },
    async saveSnapshot(_runId, workerId, write) {
      const currentVersion = stored?.version ?? 0;
      if (write.expectedVersion !== currentVersion) {
        throw new Error(`snapshot version conflict: expected=${write.expectedVersion}, actual=${currentVersion}`);
      }
      const next = JSON.parse(write.payloadJson) as HeadlessBuilderSnapshotPayload;
      const previous = parsePayload(stored);
      if (crashArmed && crashPredicate(next, previous, write.phase)) {
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
    async complete() { return runState("completed"); },
    async fail() { return runState("failed"); },
  };

  return { client, get crashCount() { return crashCount; } };
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
    let pullRequestNumber = writer ? pullRequestByTask.get(input.taskId) ?? null : null;
    if (writer && pullRequestNumber === null) {
      pullRequestNumber = nextPullRequest++;
      pullRequestByTask.set(input.taskId, pullRequestNumber);
    }
    const branchName = writer
      ? `agent/${input.teamId}/${input.agentId.replace(":", "-")}/${input.taskSlug}`
      : null;
    if (branchName) branchEffects.add(branchName);
    const reviewedPullRequests = ["code-review", "reviewer", "qa"].includes(input.role)
      ? [...pullRequestByTask.values()].sort((a, b) => a - b)
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
      const numbers = [...new Set(input.pullRequestNumbers)].sort((a, b) => a - b);
      for (const number of numbers) {
        if (!mergedPullRequests.has(number)) {
          mergedPullRequests.add(number);
          mergeEffects += 1;
        }
      }
      return {
        repositoryFullName: input.repositoryFullName,
        mergedPullRequests: numbers.map((number) => ({
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
    now: () => `2026-08-27T07:00:${String(tick++).padStart(2, "0")}Z`,
  });
}

async function expectCrash(executor: ReturnType<typeof makeExecutor>, client: BuilderWorkerClient) {
  try {
    await executor(CLAIM, client);
  } catch (error) {
    if (error instanceof Error && error.message.includes("[FAILURE-INJECTION]")) return;
    throw error;
  }
  throw new Error("first execution must stop at the configured failure injection boundary");
}

async function resume(executor: ReturnType<typeof makeExecutor>, client: BuilderWorkerClient) {
  const result = await executor(CLAIM, client);
  check(result.repositoryFullName === "example/crash-recovery-test", "resumed executor must finish the same repository");
}

function transitionedRoleToDone(role: ExecutableAgentRole): CrashPredicate {
  return (next, previous, phase) => {
    if (phase !== "building" || !previous) return false;
    const done = next.taskRuns.find((run) => run.role === role && run.status === "done");
    if (!done) return false;
    return previous.taskRuns.find((run) => run.taskId === done.taskId)?.status === "running";
  };
}

async function testRepositoryBootstrapRecovery() {
  const runtime = fakeRuntime();
  const storage = persistentClient((next, previous, phase) =>
    phase === "building" && previous?.repository === null && next.repository !== null);
  const executor = makeExecutor(runtime.runtime);
  await expectCrash(executor, storage.client);
  await resume(executor, storage.client);
  checkEqual(storage.crashCount, 1, "repository failure injection must fire once");
  checkEqual(runtime.bootstrapCalls, 2, "bootstrap may be re-entered after an uncommitted snapshot");
  checkEqual(runtime.repositoryCreateEffects, 1, "repository must not be created twice");
}

async function testWriterEvidenceRecovery() {
  const runtime = fakeRuntime();
  const storage = persistentClient(transitionedRoleToDone("frontend"));
  const executor = makeExecutor(runtime.runtime);
  await expectCrash(executor, storage.client);
  const evidence = [...runtime.evidenceByTask.values()].find((item) => item.role === "frontend");
  if (!evidence) throw new Error("frontend evidence must exist before injected crash");
  check(evidence.report.commitSha !== null, "writer commit must exist before crash");
  check(evidence.report.pullRequestNumber !== null, "writer PR must exist before crash");
  await resume(executor, storage.client);
  checkEqual(runtime.dispatchCount.get(evidence.taskId), 1, "writer must not redispatch after recovery");
  checkEqual(runtime.reconcileCount.get(evidence.taskId), 1, "writer must recover through reconciliation");
  checkEqual(runtime.branchEffects.size, runtime.pullRequestByTask.size, "writer branch side effects must stay unique");
}

async function testReviewEvidenceRecovery() {
  const runtime = fakeRuntime();
  const storage = persistentClient(transitionedRoleToDone("code-review"));
  const executor = makeExecutor(runtime.runtime);
  await expectCrash(executor, storage.client);
  const evidence = [...runtime.evidenceByTask.values()].find((item) => item.role === "code-review");
  if (!evidence) throw new Error("code-review evidence must exist before injected crash");
  check(evidence.report.reviewedPullRequests.length > 0, "review must reference upstream PR evidence");
  await resume(executor, storage.client);
  checkEqual(runtime.dispatchCount.get(evidence.taskId), 1, "review must not execute twice after recovery");
  checkEqual(runtime.reconcileCount.get(evidence.taskId), 1, "review must recover through reconciliation");
}

async function testIntegrationRecovery() {
  const runtime = fakeRuntime();
  const storage = persistentClient((_next, _previous, phase) => phase === "completed");
  const executor = makeExecutor(runtime.runtime);
  await expectCrash(executor, storage.client);
  const mergedBeforeRestart = runtime.mergedPullRequests.size;
  check(mergedBeforeRestart > 0, "merge side effects must exist before completed snapshot crash");
  checkEqual(runtime.mergeCalls, 1, "first execution must invoke integration once");
  await resume(executor, storage.client);
  checkEqual(runtime.mergeCalls, 2, "restart may re-enter the idempotent integration command");
  checkEqual(runtime.mergeEffects, mergedBeforeRestart, "no PR may be merged twice");
  checkEqual(runtime.mergedPullRequests.size, mergedBeforeRestart, "merged PR set must remain stable");
}

async function run() {
  await testRepositoryBootstrapRecovery();
  await testWriterEvidenceRecovery();
  await testReviewEvidenceRecovery();
  await testIntegrationRecovery();
  console.log("headless crash recovery policy tests passed");
}

void run();
