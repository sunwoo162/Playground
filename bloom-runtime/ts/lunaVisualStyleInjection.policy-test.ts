import type { BuilderWorkerClaim } from "./builderWorkerAdapter";
import {
  createHeadlessBuilderExecutor,
  type HeadlessAgentTaskRunResult,
  type HeadlessBuilderRuntime,
} from "./headlessBuilderExecutor";
import type { ProjectPlan, TeamId } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const TEAM_ID: TeamId = "rose";
const CLAIM: BuilderWorkerClaim = {
  runId: 901,
  projectId: 902,
  workerId: "visual-policy-worker",
  status: "running",
  leaseExpiresAt: "2026-08-29T13:00:00Z",
  claimCount: 1,
  title: "Visual Baseline Test",
  brief: "실제 웹 서비스를 만들어줘",
  platform: "web",
  features: ["search"],
  authRequired: false,
  templateId: null,
  repositoryFullName: null,
  previewUrl: null,
  orchestrationSnapshot: null,
};

const PLAN: ProjectPlan = {
  projectName: "Visual Baseline Test",
  repositoryName: "visual-baseline-test",
  productSummary: "Luna visual baseline 주입 검증용 제품",
  architectureSummary: "Frontend와 Backend를 독립 task로 검증한다.",
  needsAuth: false,
  technologyDecisions: [],
  tasks: [
    {
      id: "FE-001",
      title: "Frontend 구현",
      role: "frontend",
      taskSlug: "frontend-shell",
      summary: "사용자 화면을 구현한다.",
      dependsOn: [],
      acceptanceCriteria: ["사용자 화면이 검증된다."],
    },
    {
      id: "BE-001",
      title: "Backend 구현",
      role: "backend",
      taskSlug: "backend-api",
      summary: "API를 구현한다.",
      dependsOn: [],
      acceptanceCriteria: ["API가 검증된다."],
    },
  ],
};

async function run() {
  let planningRequest = "";
  const dispatched: Parameters<HeadlessBuilderRuntime["dispatchTask"]>[0][] = [];

  const runtime: HeadlessBuilderRuntime = {
    async analyzeIntake() {
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
    async planProject(input) {
      planningRequest = input.request;
      return {
        plan: PLAN,
        sessionId: "pm-session",
        eventsPath: "/tmp/pm-events.jsonl",
        outputPath: "/tmp/pm.json",
      };
    },
    async bootstrapRepository() {
      return {
        repository: "example/visual-baseline-test",
        workspacePath: "/tmp/visual-baseline-test",
        createdRepository: true,
        clonedRepository: true,
        releaseBranch: "main",
        integrationBranch: "develop",
      };
    },
    async dispatchTask(input) {
      dispatched.push(input);
      const result: HeadlessAgentTaskRunResult = {
        projectId: input.projectId,
        taskId: input.taskId,
        role: input.role,
        agentId: input.agentId,
        branchName: null,
        worktreePath: `/tmp/${input.taskId}`,
        threadId: `thread-${input.taskId}`,
        sessionId: `session-${input.taskId}`,
        turnId: `turn-${input.taskId}`,
        eventsPath: `/tmp/${input.taskId}.jsonl`,
        stderrPath: `/tmp/${input.taskId}.stderr`,
        report: {
          status: "blocked",
          summary: "visual policy capture complete",
          rationaleSummary: "stop after first wave",
          evidence: [],
          verification: [],
          commitSha: null,
          pullRequestNumber: null,
          pullRequestUrl: null,
          reviewedPullRequests: [],
          blockers: ["intentional policy-test stop"],
        },
      };
      return result;
    },
    async reconcileTask() {
      return { outcome: "blocked", reason: "not used", result: null };
    },
    async mergePullRequests(input) {
      return { repositoryFullName: input.repositoryFullName, mergedPullRequests: [] };
    },
  };

  const client = {
    async claim() { return CLAIM; },
    async heartbeat() {
      return {
        runId: CLAIM.runId,
        projectId: CLAIM.projectId,
        workerId: CLAIM.workerId,
        status: "running" as const,
        failureReason: null,
        startedAt: "2026-08-29T12:00:00Z",
        heartbeatAt: "2026-08-29T12:00:01Z",
        leaseExpiresAt: "2026-08-29T13:00:00Z",
        finishedAt: null,
        claimCount: 1,
      };
    },
    async loadSnapshot() { return null; },
    async saveSnapshot(_runId: number, workerId: string, write: {
      schemaVersion: 1;
      expectedVersion: number;
      phase: string;
      payloadJson: string;
    }) {
      return {
        schemaVersion: write.schemaVersion,
        version: write.expectedVersion + 1,
        phase: write.phase,
        payloadJson: write.payloadJson,
        updatedByWorkerId: workerId,
        updatedAt: "2026-08-29T12:00:01Z",
      };
    },
    async complete() { throw new Error("not used"); },
    async fail() { throw new Error("not used"); },
  };

  const execute = createHeadlessBuilderExecutor({
    organization: "example",
    workspaceRoot: "/tmp/luna-visual-policy",
    teamId: TEAM_ID,
    teamName: "Rose",
    runtime,
    now: () => "2026-08-29T12:00:02Z",
  });

  try {
    await execute(CLAIM, client);
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes("blocked"),
      "policy test should stop only after intentionally blocked first-wave tasks",
    );
  }

  assert(planningRequest.includes("실제 웹 서비스를 만들어줘"), "PM context must preserve the original Product Owner request");
  assert(planningRequest.includes("[Luna visual style baseline"), "user-facing PM planning must receive the Luna visual baseline");
  assert(planningRequest.includes("Do not copy BloomBouquet layout"), "PM context must explicitly preserve product-specific layout");
  assert(planningRequest.includes("Product Owner"), "PM context must preserve explicit Product Owner style precedence");
  for (const color of ["#ffffff", "#171719", "#6b6b6e", "#dfe0e2", "#2d5a3d"]) {
    assert(planningRequest.includes(color), `PM context must carry palette anchor ${color}`);
  }

  const frontend = dispatched.find((input) => input.role === "frontend");
  const backend = dispatched.find((input) => input.role === "backend");
  assert(frontend, "frontend task must be dispatched in the first wave");
  assert(backend, "backend task must be dispatched in the first wave");
  assert(frontend.summary.includes("[Luna senior operating standard"), "frontend must retain the common senior context");
  assert(backend.summary.includes("[Luna senior operating standard"), "backend must retain the common senior context");
  assert(frontend.summary.includes("[Luna visual style baseline"), "frontend implementation must receive the visual baseline");
  assert(frontend.summary.includes("product-specific layout"), "frontend context must keep layout product-specific");
  assert(frontend.summary.includes("Product Owner"), "frontend context must keep Product Owner override precedence");
  assert(!backend.summary.includes("[Luna visual style baseline"), "backend-only work must not receive the full UI visual baseline by default");
  assert(!frontend.userRequest.includes("[Luna visual style baseline"), "task userRequest must remain the original Product Owner request, not PM-only policy text");

  console.log("PASS  Luna visual style injection scenarios passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
