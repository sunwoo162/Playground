import {
  decorateSchedulerObservability,
  resolveDeploymentPreviewUrl,
  resolveIntegratedMainSha,
} from "./observedHeadlessBuilderExecutor";
import {
  completeSchedulerWaveTelemetry,
  createSchedulerWaveTelemetry,
  summarizeSchedulerTelemetry,
  trimSchedulerWaveTelemetry,
  type SchedulerWaveTelemetry,
} from "./schedulerObservability";
import type {
  ExecutableAgentRole,
  ProjectPlan,
  ProjectTaskRun,
  TaskRunStatus,
} from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function taskRun(
  taskId: string,
  role: ExecutableAgentRole,
  status: TaskRunStatus,
  agentId: string,
  startedAt: string | null = null,
  completedAt: string | null = null,
): ProjectTaskRun {
  return {
    taskId,
    role,
    agentId,
    status,
    attempts: startedAt ? 1 : 0,
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
    startedAt,
    completedAt,
  };
}

const PLAN: ProjectPlan = {
  projectName: "Scheduler Telemetry Test",
  repositoryName: "scheduler-telemetry-test",
  productSummary: "Scheduler observability policy test",
  architectureSummary: "Parallel frontend and backend work with a dependent QA task.",
  needsAuth: false,
  technologyDecisions: [],
  tasks: [
    {
      id: "FE-001",
      title: "Frontend foundation",
      role: "frontend",
      taskSlug: "frontend-foundation",
      summary: "Build the frontend foundation.",
      dependsOn: [],
      acceptanceCriteria: ["Frontend foundation is complete."],
    },
    {
      id: "BE-001",
      title: "Backend API",
      role: "backend",
      taskSlug: "backend-api",
      summary: "Build the backend API.",
      dependsOn: [],
      acceptanceCriteria: ["Backend API is complete."],
    },
    {
      id: "DOC-001",
      title: "Documentation",
      role: "documentation",
      taskSlug: "documentation",
      summary: "Document the service.",
      dependsOn: [],
      acceptanceCriteria: ["Documentation is complete."],
    },
    {
      id: "QA-001",
      title: "QA",
      role: "qa",
      taskSlug: "qa",
      summary: "Verify the frontend flow.",
      dependsOn: ["FE-001"],
      acceptanceCriteria: ["QA passes."],
    },
  ],
};

function preWaveRuns() {
  return [
    taskRun("FE-001", "frontend", "ready", "rose:frontend"),
    taskRun("BE-001", "backend", "ready", "rose:backend"),
    taskRun("DOC-001", "documentation", "ready", "rose:documentation"),
    taskRun("QA-001", "qa", "pending", "rose:qa"),
  ];
}

function testWaveDecisionTelemetry() {
  const before = preWaveRuns();
  const selected = before.slice(0, 3);
  const wave = createSchedulerWaveTelemetry(
    PLAN,
    before,
    selected,
    1,
    "2026-08-27T01:00:00.000Z",
  );

  assert(wave.targetConcurrency === 4, "three runnable Agents must request the adaptive concurrency target of four");
  assert(wave.availableSlots === 4, "with no running tasks all four target slots are available");
  assert(wave.selectedTaskCount === 3, "wave telemetry must record the actual selected width");
  const frontend = wave.selectedTasks.find((task) => task.taskId === "FE-001");
  assert(frontend?.priority.unlockCount === 1, "frontend task must expose that it unlocks the dependent QA task");
  assert(frontend?.selectionReason === "unlocks-ready-tasks", "fan-out priority reason must be human-readable");
}

function testWaveCompletionAndAggregateMetrics() {
  const before = preWaveRuns();
  const wave = createSchedulerWaveTelemetry(
    PLAN,
    before,
    before.slice(0, 3),
    1,
    "2026-08-27T01:00:00.000Z",
  );
  const completedRuns = [
    taskRun("FE-001", "frontend", "done", "rose:frontend", "2026-08-27T01:00:00.000Z", "2026-08-27T01:00:10.000Z"),
    taskRun("BE-001", "backend", "done", "rose:backend", "2026-08-27T01:00:00.000Z", "2026-08-27T01:00:10.000Z"),
    taskRun("DOC-001", "documentation", "done", "rose:documentation", "2026-08-27T01:00:00.000Z", "2026-08-27T01:00:10.000Z"),
    taskRun("QA-001", "qa", "done", "rose:qa", "2026-08-27T01:00:10.000Z", "2026-08-27T01:00:15.000Z"),
  ];
  const completedWave = completeSchedulerWaveTelemetry(
    wave,
    completedRuns,
    "2026-08-27T01:00:10.000Z",
  );
  assert(completedWave.status === "completed", "a terminal successful wave must be marked completed");
  assert(completedWave.durationMs === 10_000, "wave duration must be measured from persisted timestamps");

  const metrics = summarizeSchedulerTelemetry(PLAN, [completedWave], completedRuns);
  assert(metrics.totalAgentRuntimeMs === 35_000, "aggregate telemetry must sum task runtime across Agents");
  assert(metrics.wallClockExecutionMs === 15_000, "aggregate telemetry must measure real wall-clock execution span");
  assert(metrics.estimatedCriticalPathRuntimeMs === 15_000, "critical path runtime must include FE followed by QA");
  assert(metrics.parallelismFactor === 2.33, "parallelism factor must expose runtime overlap benefit");
  assert(metrics.observedAgentCount === 4, "observed Agent count must use identities that actually started work");
  assert(metrics.maxObservedWaveWidth === 3, "maximum observed wave width must reflect telemetry");
}

function baseSnapshot(taskRuns: ProjectTaskRun[]) {
  return {
    schemaVersion: 1,
    runId: 11,
    projectId: 7,
    runtimeProjectId: "builder-7",
    intakeId: "builder-run-11",
    request: "Build scheduler telemetry",
    intake: null,
    pm: null,
    plan: PLAN,
    repository: null,
    taskRuns,
    integrationPullRequestNumbers: [],
    integration: null,
    blockedReason: null,
  };
}

function testSnapshotDecorationAndRecovery() {
  const previous = JSON.stringify(baseSnapshot(preWaveRuns()));
  const runningRuns = [
    taskRun("FE-001", "frontend", "running", "rose:frontend", "2026-08-27T01:00:00.000Z"),
    taskRun("BE-001", "backend", "running", "rose:backend", "2026-08-27T01:00:00.000Z"),
    taskRun("DOC-001", "documentation", "running", "rose:documentation", "2026-08-27T01:00:00.000Z"),
    taskRun("QA-001", "qa", "pending", "rose:qa"),
  ];
  const decoratedRunning = decorateSchedulerObservability(
    previous,
    JSON.stringify(baseSnapshot(runningRuns)),
  );
  const runningPayload = JSON.parse(decoratedRunning);
  assert(runningPayload.schedulerObservability.waves.length === 1, "ready-to-running transition must create exactly one wave record");
  assert(runningPayload.schedulerObservability.waves[0].status === "running", "new wave must remain running before task completion");

  const noDuplicate = decorateSchedulerObservability(
    decoratedRunning,
    JSON.stringify({
      ...baseSnapshot(runningRuns),
      schedulerObservability: runningPayload.schedulerObservability,
    }),
  );
  assert(JSON.parse(noDuplicate).schedulerObservability.waves.length === 1, "running-to-running snapshots must not duplicate a wave");

  const recoveredRuns = [
    taskRun("FE-001", "frontend", "done", "rose:frontend", "2026-08-27T01:00:00.000Z", "2026-08-27T01:00:10.000Z"),
    taskRun("BE-001", "backend", "done", "rose:backend", "2026-08-27T01:00:00.000Z", "2026-08-27T01:00:09.000Z"),
    taskRun("DOC-001", "documentation", "done", "rose:documentation", "2026-08-27T01:00:00.000Z", "2026-08-27T01:00:08.000Z"),
    taskRun("QA-001", "qa", "ready", "rose:qa"),
  ];
  const recovered = decorateSchedulerObservability(
    decoratedRunning,
    JSON.stringify({
      ...baseSnapshot(recoveredRuns),
      schedulerObservability: runningPayload.schedulerObservability,
    }),
  );
  const recoveredPayload = JSON.parse(recovered);
  assert(recoveredPayload.schedulerObservability.waves[0].status === "completed", "recovery snapshot must close an open wave from task evidence");
  assert(recoveredPayload.schedulerObservability.waves[0].durationMs === 10_000, "recovered wave duration must use the latest selected task completion");
  assert(recoveredPayload.schedulerObservability.metrics.waveCount === 1, "old schema-v1 payloads must gain observability without a schema bump");
}

function testTelemetryRetentionBound() {
  const waves: SchedulerWaveTelemetry[] = Array.from({ length: 205 }, (_, index) => ({
    sequence: index + 1,
    startedAt: "2026-08-27T01:00:00.000Z",
    completedAt: "2026-08-27T01:00:01.000Z",
    durationMs: 1_000,
    status: "completed",
    targetConcurrency: 2,
    runningBefore: 0,
    readyBefore: 1,
    eligibleAgentCount: 1,
    availableSlots: 2,
    selectedTaskCount: 1,
    selectedTasks: [],
  }));
  const trimmed = trimSchedulerWaveTelemetry(waves);
  assert(trimmed.length === 200, "scheduler telemetry must stay bounded inside the snapshot size budget");
  assert(trimmed[0].sequence === 6, "telemetry retention must keep the newest wave records");
}

function testDeploymentPreviewEvidenceResolution() {
  const deployed = taskRun(
    "DEP-001",
    "devops",
    "done",
    "rose:devops",
    "2026-08-27T01:00:00.000Z",
    "2026-08-27T01:00:10.000Z",
  );
  deployed.evidence = [
    "deployment-url: https://bloombouquet.https.gsmsv.site/apps/sample/",
  ];
  assert(
    resolveDeploymentPreviewUrl(null, [deployed])
      === "https://bloombouquet.https.gsmsv.site/apps/sample/",
    "fresh Builder completion must recover the verified HTTPS preview from completed DevOps evidence",
  );
  assert(
    resolveDeploymentPreviewUrl("http://localhost:3000/", [deployed]) === "http://localhost:3000/",
    "an explicitly persisted preview URL must take precedence over deployment evidence",
  );

  const nonDevops = taskRun("FE-002", "frontend", "done", "rose:frontend");
  nonDevops.evidence = ["deployment-url: https://example.test/untrusted/"];
  assert(
    resolveDeploymentPreviewUrl(null, [nonDevops]) === null,
    "deployment evidence from a non-DevOps task must not create a release preview",
  );

  const secondDeployment = taskRun("DEP-002", "devops", "done", "rose:devops-2");
  secondDeployment.evidence = ["deployment-url: https://example.test/other/"];
  let ambiguousRejected = false;
  try {
    resolveDeploymentPreviewUrl(null, [deployed, secondDeployment]);
  } catch {
    ambiguousRejected = true;
  }
  assert(ambiguousRejected, "conflicting verified deployment URLs must block completion instead of picking one");
}

function testIntegratedMainShaResolution() {
  const first = "1111111111111111111111111111111111111111";
  const final = "2222222222222222222222222222222222222222";
  assert(resolveIntegratedMainSha({
    repositoryFullName: "BloomBouquet/sample",
    mergedPullRequests: [
      { number: 1, url: "https://github.com/BloomBouquet/sample/pull/1", headBranch: "sample/frontend", mergeCommitSha: first },
      { number: 2, url: "https://github.com/BloomBouquet/sample/pull/2", headBranch: "sample/backend", mergeCommitSha: final },
    ],
  }) === final, "automatic delivery must deploy the final integrated main commit");

  let rejected = false;
  try {
    resolveIntegratedMainSha({
      repositoryFullName: "BloomBouquet/sample",
      mergedPullRequests: [
        { number: 1, url: "https://github.com/BloomBouquet/sample/pull/1", headBranch: "sample/frontend", mergeCommitSha: null },
      ],
    });
  } catch {
    rejected = true;
  }
  assert(rejected, "automatic delivery must fail closed when final merge SHA evidence is missing");
}

function run() {
  testWaveDecisionTelemetry();
  testWaveCompletionAndAggregateMetrics();
  testSnapshotDecorationAndRecovery();
  testTelemetryRetentionBound();
  testDeploymentPreviewEvidenceResolution();
  testIntegratedMainShaResolution();
  console.log("schedulerObservability policy tests passed");
}

run();
