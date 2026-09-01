import type {
  BuilderOrchestrationSnapshot,
  BuilderWorkerClaim,
  BuilderWorkerClient,
  BuilderWorkerRunState,
} from "./builderWorkerAdapter";
import {
  createHeadlessBuilderExecutor,
  type HeadlessAgentTaskRuntimeInput,
  type HeadlessAgentTaskRunResult,
  type HeadlessBuilderRuntime,
} from "./headlessBuilderExecutor";
import type { ProjectPlan } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const claim: BuilderWorkerClaim = {
  runId: 22,
  projectId: 22,
  workerId: "worker-test",
  status: "running",
  leaseExpiresAt: "2026-09-01T14:00:00Z",
  claimCount: 1,
  title: "Publication metadata regression",
  brief: "idea task 뒤에 frontend task를 실행한다.",
  platform: "web",
  features: [],
  authRequired: false,
  templateId: null,
  repositoryFullName: null,
  previewUrl: null,
  orchestrationSnapshot: null,
};

const plan: ProjectPlan = {
  projectName: "Publication metadata regression",
  repositoryName: "publication-metadata-regression",
  productSummary: "non-writer publication metadata가 dependency로 전파되지 않아야 한다.",
  architectureSummary: "idea task 완료 뒤 frontend writer가 실행된다.",
  needsAuth: false,
  technologyDecisions: [],
  tasks: [
    {
      id: "PB-001",
      title: "아이디어 정리",
      role: "idea",
      taskSlug: "idea-summary",
      summary: "제품 아이디어를 정리한다.",
      dependsOn: [],
      acceptanceCriteria: ["제품 방향을 정리한다."],
    },
    {
      id: "PB-002",
      title: "프론트 구현",
      role: "frontend",
      taskSlug: "frontend-shell",
      summary: "화면을 구현한다.",
      dependsOn: ["PB-001"],
      acceptanceCriteria: ["화면을 구현한다."],
    },
  ],
};

function runState(status: BuilderWorkerRunState["status"]): BuilderWorkerRunState {
  return {
    runId: claim.runId,
    projectId: claim.projectId,
    workerId: claim.workerId,
    status,
    failureReason: null,
    startedAt: "2026-09-01T13:00:00Z",
    heartbeatAt: "2026-09-01T13:00:30Z",
    leaseExpiresAt: status === "running" ? "2026-09-01T14:00:00Z" : null,
    finishedAt: status === "running" ? null : "2026-09-01T13:01:00Z",
    claimCount: 1,
  };
}

function completedResult(
  input: HeadlessAgentTaskRuntimeInput,
  publication: { branchName: string | null; commitSha: string | null; pullRequestNumber: number | null },
): HeadlessAgentTaskRunResult {
  return {
    projectId: input.projectId,
    taskId: input.taskId,
    role: input.role,
    agentId: input.agentId,
    branchName: publication.branchName,
    worktreePath: `/tmp/${input.taskId}`,
    threadId: `thread-${input.taskId}`,
    sessionId: `session-${input.taskId}`,
    turnId: `turn-${input.taskId}`,
    eventsPath: `/tmp/${input.taskId}.jsonl`,
    stderrPath: `/tmp/${input.taskId}.stderr`,
    report: {
      status: "completed",
      summary: `${input.taskId} completed`,
      rationaleSummary: "test result",
      evidence: [],
      verification: [{ name: "test", status: "passed", details: "passed" }],
      commitSha: publication.commitSha,
      pullRequestNumber: publication.pullRequestNumber,
      pullRequestUrl: publication.pullRequestNumber === null
        ? null
        : `https://github.com/example/repo/pull/${publication.pullRequestNumber}`,
      reviewedPullRequests: [],
      blockers: [],
    },
  };
}

async function run() {
  const taskInputs: HeadlessAgentTaskRuntimeInput[] = [];
  let snapshot: BuilderOrchestrationSnapshot | null = null;
  let version = 0;

  const client: BuilderWorkerClient = {
    async claim() { return claim; },
    async heartbeat() { return runState("running"); },
    async loadSnapshot() { return snapshot; },
    async saveSnapshot(_runId, workerId, write) {
      version += 1;
      snapshot = {
        schemaVersion: write.schemaVersion,
        version,
        phase: write.phase,
        payloadJson: write.payloadJson,
        updatedByWorkerId: workerId,
        updatedAt: "2026-09-01T13:00:30Z",
      };
      return snapshot;
    },
    async complete() { return runState("completed"); },
    async fail() { return runState("failed"); },
  };

  const runtime: HeadlessBuilderRuntime = {
    async analyzeIntake() {
      return {
        analysis: {
          summary: "ready",
          primaryUser: "user",
          primaryJob: "use app",
          complexity: "small",
          requiredRoles: ["idea", "frontend"],
          criticalRoles: ["frontend"],
          needsAuth: false,
          userFacing: true,
          externalDependencies: [],
          riskFlags: [],
          assumptions: [],
          missingInputs: [],
          rationaleSummary: "ready",
        },
        sessionId: "intake",
        eventsPath: "/tmp/intake.jsonl",
        outputPath: "/tmp/intake.json",
      };
    },
    async planProject() {
      return {
        plan,
        sessionId: "pm",
        eventsPath: "/tmp/pm.jsonl",
        outputPath: "/tmp/pm.json",
      };
    },
    async bootstrapRepository() {
      return {
        repository: "example/publication-metadata-regression",
        workspacePath: "/tmp/publication-metadata-regression",
        createdRepository: true,
        clonedRepository: true,
        releaseBranch: "main",
        integrationBranch: "develop",
      };
    },
    async dispatchTask(input) {
      taskInputs.push(input);
      if (input.role === "idea") {
        return completedResult(input, {
          branchName: null,
          commitSha: "373a196",
          pullRequestNumber: null,
        });
      }
      throw new Error("stop after dependency capture");
    },
    async reconcileTask() {
      throw new Error("reconcileTask must not run in this regression test");
    },
    async mergePullRequests(input) {
      return {
        repositoryFullName: input.repositoryFullName,
        mergedPullRequests: input.pullRequestNumbers.map((number) => ({
          number,
          url: `https://github.com/example/repo/pull/${number}`,
          headBranch: "agent/rose/frontend/frontend-shell",
          mergeCommitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        })),
      };
    },
    async promoteRelease(input) {
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
    now: () => "2026-09-01T13:00:00Z",
  });

  try {
    await execute(claim, client);
  } catch {
    // The executor converts the deliberate dispatch stop into its wave-level blocked error.
  }

  const frontendInput = taskInputs.find((input) => input.taskId === "PB-002");
  assert(frontendInput, "frontend task must be dispatched after idea dependency");
  assert(frontendInput.dependencies.length === 1, "frontend task must receive the idea dependency");
  assert(
    frontendInput.dependencies[0]?.commitSha === null,
    `non-writer dependency commitSha must be discarded, got ${frontendInput.dependencies[0]?.commitSha}`,
  );

  console.log("non-writer publication metadata policy test passed");
}

void run();
