import {
  auditLiveE2ESnapshot,
  createLiveE2ESmokeRequest,
  LIVE_E2E_MARKER,
  validateLiveE2EImplementationPlan,
  type LiveE2ESnapshotEnvelope,
} from "./e2eSmoke";
import * as e2eSmokeModule from "./e2eSmoke";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const writerRoles = ["frontend", "backend", "data-marketing", "documentation"] as const;
const governanceRoles = ["code-review", "reviewer", "qa"] as const;

function taskRun(
  role: string,
  index: number,
  reviewedPullRequests: number[] = [],
) {
  const writer = writerRoles.includes(role as (typeof writerRoles)[number]);
  return {
    taskId: `TASK-${String(index + 1).padStart(3, "0")}`,
    role,
    agentId: `rose:${role}`,
    status: "done",
    attempts: 1,
    branchName: writer ? `bloom-e2e/${role}` : null,
    worktreePath: writer ? `/tmp/bloom-e2e/${role}` : null,
    threadId: `thread-${role}`,
    sessionId: `session-${role}`,
    turnId: `turn-${role}`,
    eventsPath: `/tmp/${role}.events.jsonl`,
    stderrPath: `/tmp/${role}.stderr.log`,
    commitSha: writer ? `${index + 1}`.repeat(40).slice(0, 40) : null,
    pullRequestNumber: writer ? 100 + index : null,
    pullRequestUrl: writer ? `https://github.com/BloomBouquet/bloom-e2e-pulseboard-fixture/pull/${100 + index}` : null,
    reviewedPullRequests,
    summary: `${role} complete`,
    rationaleSummary: "fixture evidence",
    evidence: ["fixture evidence"],
    verification: [{ name: "fixture", status: "passed", details: "passed" }],
    blockers: [],
    lastError: null,
    startedAt: "2026-08-27T00:00:00.000Z",
    completedAt: "2026-08-27T00:01:00.000Z",
  };
}

function completedSnapshot(): LiveE2ESnapshotEnvelope {
  const writerPrs = writerRoles.map((_, index) => 100 + index);
  const taskRuns = [
    ...writerRoles.map((role, index) => taskRun(role, index)),
    taskRun("code-review", 4, writerPrs),
    taskRun("reviewer", 5),
    taskRun("qa", 6),
  ];
  const payload = {
    schemaVersion: 1,
    runId: 44,
    projectId: 12,
    runtimeProjectId: "builder-12",
    intakeId: "builder-run-44",
    request: `${LIVE_E2E_MARKER} build Pulseboard`,
    intake: {
      analysis: { summary: "Pulseboard" },
      sessionId: "intake-session",
      eventsPath: "/tmp/intake.events.jsonl",
      outputPath: "/tmp/intake.json",
    },
    pm: {
      sessionId: "pm-session",
      eventsPath: "/tmp/pm.events.jsonl",
      outputPath: "/tmp/pm.json",
    },
    plan: {
      repositoryName: "bloom-e2e-pulseboard-fixture",
      tasks: taskRuns.map((run) => ({ id: run.taskId, role: run.role })),
    },
    repository: {
      repository: "BloomBouquet/bloom-e2e-pulseboard-fixture",
      workspacePath: "/tmp/bloom-e2e-pulseboard-fixture",
    },
    taskRuns,
    integrationPullRequestNumbers: writerPrs,
    integration: {
      repositoryFullName: "BloomBouquet/bloom-e2e-pulseboard-fixture",
      mergedPullRequests: writerPrs.map((number, index) => ({
        number,
        url: `https://github.com/BloomBouquet/bloom-e2e-pulseboard-fixture/pull/${number}`,
        headBranch: `bloom-e2e/${writerRoles[index]}`,
        mergeCommitSha: `merge-${number}`,
      })),
    },
    blockedReason: null,
  };
  return {
    schemaVersion: 1,
    version: 10,
    phase: "completed",
    payloadJson: JSON.stringify(payload),
    updatedByWorkerId: "bloom-worker-fixture",
    updatedAt: "2026-08-27T00:10:00.000Z",
  };
}

function main() {
  const request = createLiveE2ESmokeRequest(new Date(2026, 7, 27, 10, 11, 12));
  assert(request.repositoryName === "bloom-e2e-pulseboard-20260827-101112", "E2E repository name must use Bloom prefix and timestamp");
  assert(request.request.includes(LIVE_E2E_MARKER), "E2E request must include Bloom marker");
  assert(!request.request.includes("LUNA-E2E"), "E2E request must not use the old Luna marker");

  const validImplementationPlan = {
    repositoryName: request.repositoryName,
    scaffoldProfile: "react-api-sqlite-monorepo-v1" as const,
    tasks: [{ role: "frontend" as const }, { role: "backend" as const }],
  };
  validateLiveE2EImplementationPlan(request.request, validImplementationPlan);

  let wrongRepositoryError = "";
  try {
    const wrongRepositoryPlan = {
      repositoryName: "bloom-e2e-pulseboard",
      scaffoldProfile: "react-api-sqlite-monorepo-v1" as const,
      tasks: [{ role: "frontend" as const }, { role: "backend" as const }],
    };
    validateLiveE2EImplementationPlan(request.request, wrongRepositoryPlan);
  } catch (error) {
    wrongRepositoryError = error instanceof Error ? error.message : String(error);
  }
  assert(wrongRepositoryError.includes(request.repositoryName), "Live E2E PM validation must reject a repository name that differs from the exact smoke request");

  const enforceLiveE2ERepositoryName = (e2eSmokeModule as unknown as Record<string, unknown>).enforceLiveE2ERepositoryName;
  assert(typeof enforceLiveE2ERepositoryName === "function", "Live E2E runtime must expose deterministic repository-name enforcement");
  const normalizedLivePlan = {
    repositoryName: "bloom-e2e-pulseboard",
    scaffoldProfile: "react-api-sqlite-monorepo-v1" as const,
    tasks: [{ role: "frontend" as const }, { role: "backend" as const }],
  };
  (enforceLiveE2ERepositoryName as (request: string, plan: typeof normalizedLivePlan) => typeof normalizedLivePlan)(request.request, normalizedLivePlan);
  assert(normalizedLivePlan.repositoryName === request.repositoryName, "Live E2E runtime must overwrite a PM repository mismatch with the exact smoke request name");
  validateLiveE2EImplementationPlan(request.request, normalizedLivePlan);

  const enforceLiveE2EScaffoldProfile = (e2eSmokeModule as unknown as Record<string, unknown>).enforceLiveE2EScaffoldProfile;
  assert(typeof enforceLiveE2EScaffoldProfile === "function", "Live E2E runtime must expose deterministic scaffold-profile enforcement");
  const scaffoldPlan = { ...normalizedLivePlan, scaffoldProfile: "none" };
  (enforceLiveE2EScaffoldProfile as (request: string, plan: typeof scaffoldPlan) => typeof scaffoldPlan)(request.request, scaffoldPlan);
  assert(scaffoldPlan.scaffoldProfile === "react-api-sqlite-monorepo-v1", "Live E2E Pulseboard must use the deterministic React/API/SQLite scaffold profile");

  let missingBackendError = "";
  try {
    const missingBackendPlan = {
      repositoryName: request.repositoryName,
      scaffoldProfile: "react-api-sqlite-monorepo-v1" as const,
      tasks: [{ role: "frontend" as const }, { role: "security" as const }],
    };
    validateLiveE2EImplementationPlan(request.request, missingBackendPlan);
  } catch (error) {
    missingBackendError = error instanceof Error ? error.message : String(error);
  }
  assert(missingBackendError.includes("backend"), "Live E2E PM validation must reject a plan without a backend role");

  const normalPlan = {
    repositoryName: "normal-project",
    tasks: [{ role: "frontend" as const }],
  };
  validateLiveE2EImplementationPlan("Build a normal frontend-only project", normalPlan);

  const completed = completedSnapshot();
  const completedAudit = auditLiveE2ESnapshot(completed, "completed");
  assert(completedAudit.passed, `completed E2E snapshot must pass: ${completedAudit.checks.filter((item) => item.status !== "pass").map((item) => item.id).join(", ")}`);
  assert(completedAudit.completedChecks === completedAudit.totalChecks, "all completed E2E checks must pass");

  const runningPayload = JSON.parse(completed.payloadJson);
  runningPayload.taskRuns[0].status = "running";
  runningPayload.integrationPullRequestNumbers = [];
  runningPayload.integration = null;
  const runningAudit = auditLiveE2ESnapshot({
    ...completed,
    phase: "building",
    payloadJson: JSON.stringify(runningPayload),
  }, "running");
  assert(!runningAudit.passed, "running E2E snapshot must not pass");
  assert(runningAudit.checks.some((item) => item.status === "pending"), "running E2E snapshot should expose pending checks");

  const uncoveredPayload = JSON.parse(completed.payloadJson);
  const codeReview = uncoveredPayload.taskRuns.find((run: { role: string }) => run.role === "code-review");
  codeReview.reviewedPullRequests = codeReview.reviewedPullRequests.slice(0, -1);
  const uncoveredAudit = auditLiveE2ESnapshot({
    ...completed,
    payloadJson: JSON.stringify(uncoveredPayload),
  }, "completed");
  const coverage = uncoveredAudit.checks.find((item) => item.id === "review-coverage");
  assert(coverage?.status === "fail", "missing writer PR review coverage must fail the E2E audit");

  const malformedAudit = auditLiveE2ESnapshot({
    ...completed,
    payloadJson: "{broken-json",
  }, "failed");
  assert(!malformedAudit.passed, "malformed terminal snapshot must fail");
  assert(malformedAudit.checks.every((item) => item.status !== "pending"), "failed terminal snapshot must not remain pending");

  const queuedAudit = auditLiveE2ESnapshot(null, "queued");
  assert(!queuedAudit.passed, "queued run without snapshot must not pass");
  assert(queuedAudit.checks.every((item) => item.status === "pending"), "queued run without snapshot should remain pending");

  console.log(`PASS  Bloom live E2E snapshot audit scenarios passed (${governanceRoles.length + writerRoles.length} fixture roles).`);
}

main();