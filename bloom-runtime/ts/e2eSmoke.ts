import { REPOSITORY_WRITER_ROLES } from "./planTopology";
import type { ExecutableAgentRole, ProjectTaskRun } from "./types";

export const LIVE_E2E_MARKER = "[BLOOM-E2E-SMOKE]";
export const LIVE_E2E_PRODUCT = "Pulseboard";
export const LIVE_E2E_SNAPSHOT_SCHEMA_VERSION = 1;

export type E2ECheckStatus = "pass" | "pending" | "fail";

export type E2ECheck = {
  id: string;
  label: string;
  status: E2ECheckStatus;
  detail: string;
};

export type E2EAudit = {
  runId: number | null;
  projectId: number | null;
  passed: boolean;
  completedChecks: number;
  totalChecks: number;
  checks: E2ECheck[];
};

export type LiveE2ESnapshotEnvelope = {
  schemaVersion: number;
  version: number;
  phase: string;
  payloadJson: string;
  updatedByWorkerId?: string | null;
  updatedAt?: string | null;
};

type LiveE2EPlanTask = {
  id: string;
  role: ExecutableAgentRole;
};

type LiveE2EPayload = {
  schemaVersion: number;
  runId: number;
  projectId: number;
  runtimeProjectId: string;
  intakeId: string;
  request: string;
  intake: {
    analysis: unknown;
    sessionId: string | null;
    eventsPath: string;
    outputPath: string;
  } | null;
  pm: {
    sessionId: string | null;
    eventsPath: string;
    outputPath: string;
  } | null;
  plan: {
    repositoryName: string;
    tasks: LiveE2EPlanTask[];
  } | null;
  repository: {
    repository: string;
    workspacePath: string;
  } | null;
  taskRuns: ProjectTaskRun[];
  integrationPullRequestNumbers: number[];
  integration: {
    repositoryFullName: string;
    mergedPullRequests: Array<{
      number: number;
      url: string;
      headBranch: string;
      mergeCommitSha: string | null;
    }>;
  } | null;
  blockedReason: string | null;
};

type ParsedSnapshot = {
  payload: LiveE2EPayload | null;
  error: string | null;
};

const IMPLEMENTATION_ROLES: ExecutableAgentRole[] = ["frontend", "backend"];
const GOVERNANCE_ROLES: ExecutableAgentRole[] = [
  "data-marketing",
  "documentation",
  "code-review",
  "reviewer",
  "qa",
];

type LiveE2EImplementationPlan = {
  repositoryName: string;
  tasks: Array<{ role: ExecutableAgentRole }>;
};

function expectedLiveE2ERepositoryName(request: string) {
  const match = request.match(/Use the exact repository name\s+([a-z0-9-]+)/i);
  if (!match?.[1]) {
    throw new Error("Bloom live E2E PM repository contract is missing the exact repository name.");
  }
  return match[1];
}

export function enforceLiveE2ERepositoryName<T extends { repositoryName: string }>(
  request: string,
  plan: T,
): T {
  if (!request.includes(LIVE_E2E_MARKER)) return plan;
  plan.repositoryName = expectedLiveE2ERepositoryName(request);
  return plan;
}

export function validateLiveE2EImplementationPlan(
  request: string,
  plan: LiveE2EImplementationPlan,
) {
  if (!request.includes(LIVE_E2E_MARKER)) return;

  const expectedRepositoryName = expectedLiveE2ERepositoryName(request);
  if (plan.repositoryName !== expectedRepositoryName) {
    throw new Error(`Bloom live E2E PM repository mismatch: expected=${expectedRepositoryName}, actual=${plan.repositoryName}`);
  }

  const roles = new Set(plan.tasks.map((task) => task.role));
  const missingRoles = IMPLEMENTATION_ROLES.filter((role) => !roles.has(role));
  if (missingRoles.length > 0) {
    throw new Error(
      `Bloom live E2E PM 계획에 필수 구현 Agent role이 없습니다: ${missingRoles.join(", ")}`,
    );
  }
}

function compactTimestamp(now: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

export function createLiveE2ESmokeRequest(now = new Date()) {
  const runId = compactTimestamp(now);
  const repositoryName = `bloom-e2e-pulseboard-${runId.toLowerCase()}`;
  const request = `${LIVE_E2E_MARKER} Build a small but production-quality full-stack web product named ${LIVE_E2E_PRODUCT}. Use the exact repository name ${repositoryName}. The product is a lightweight feedback board for a small product team. Users can create feedback with title, details, and category; list feedback; filter by category and status; and move feedback between open, planned, and done. Use a web frontend plus an API with SQLite persistence. Do not use authentication, payments, realtime infrastructure, paid services, or external APIs. The repository must be a project monorepo with clear frontend/API separation, automated tests for meaningful behavior, responsive and accessible UI, loading/error/empty states, reproducible setup, and no fake production claims. The PM must include actual Frontend and Backend implementation work. Bloom's mandatory Data & Marketing -> Documentation -> Code Review -> Reviewer -> QA chain must remain intact. Data & Marketing must analyze the real built product and write docs/marketing/MARKETING_ANALYSIS.md; Documentation must independently verify it and write docs/marketing/GO_TO_MARKET.md. Finish only after every repository-writing Agent has commit and PR evidence, Code Review covers every writer PR, Reviewer and QA pass, and the integration PR set is merged. This is a Bloom live E2E smoke project, so prefer boring reliable dependencies and keep scope intentionally small.`;

  return {
    runId,
    repositoryName,
    title: `${LIVE_E2E_PRODUCT} Live E2E ${runId}`,
    command: `/start ${request}`,
    request,
  };
}

function parsePayload(value: string): ParsedSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { payload: null, error: "snapshot payload JSON을 파싱할 수 없습니다." };
  }

  if (!parsed || typeof parsed !== "object") {
    return { payload: null, error: "snapshot payload가 JSON object가 아닙니다." };
  }

  const payload = parsed as Partial<LiveE2EPayload>;
  if (payload.schemaVersion !== LIVE_E2E_SNAPSHOT_SCHEMA_VERSION
    || typeof payload.runId !== "number"
    || typeof payload.projectId !== "number"
    || typeof payload.runtimeProjectId !== "string"
    || typeof payload.intakeId !== "string"
    || typeof payload.request !== "string"
    || !Array.isArray(payload.taskRuns)
    || !Array.isArray(payload.integrationPullRequestNumbers)) {
    return { payload: null, error: "snapshot identity 또는 필수 필드가 Bloom E2E schema와 맞지 않습니다." };
  }

  return { payload: payload as LiveE2EPayload, error: null };
}

export function parseLiveE2ESnapshot(snapshot: LiveE2ESnapshotEnvelope | null): ParsedSnapshot {
  if (!snapshot) return { payload: null, error: null };
  if (snapshot.schemaVersion !== LIVE_E2E_SNAPSHOT_SCHEMA_VERSION) {
    return {
      payload: null,
      error: `지원하지 않는 snapshot schema입니다: ${snapshot.schemaVersion}`,
    };
  }
  return parsePayload(snapshot.payloadJson);
}

function check(
  id: string,
  label: string,
  condition: boolean,
  pending: boolean,
  passDetail: string,
  waitDetail: string,
): E2ECheck {
  return {
    id,
    label,
    status: condition ? "pass" : pending ? "pending" : "fail",
    detail: condition ? passDetail : waitDetail,
  };
}

function roleRuns(payload: LiveE2EPayload, role: ExecutableAgentRole) {
  return payload.taskRuns.filter((run) => run.role === role);
}

function allRolesDone(payload: LiveE2EPayload, roles: ExecutableAgentRole[]) {
  return roles.every((role) => {
    const runs = roleRuns(payload, role);
    return runs.length > 0 && runs.every((run) => run.status === "done");
  });
}

function writerRuns(payload: LiveE2EPayload) {
  return payload.taskRuns.filter((run) => REPOSITORY_WRITER_ROLES.includes(run.role));
}

function terminalStatus(runStatus: string) {
  return runStatus === "completed" || runStatus === "failed";
}

export function auditLiveE2ESnapshot(
  snapshot: LiveE2ESnapshotEnvelope | null,
  runStatus: string,
): E2EAudit {
  const parsed = parseLiveE2ESnapshot(snapshot);
  const payload = parsed.payload;
  const terminal = terminalStatus(runStatus);
  const waiting = !terminal;

  if (!payload) {
    const snapshotPresent = Boolean(snapshot);
    const snapshotCheck = check(
      "snapshot",
      "Bloom orchestration snapshot",
      false,
      waiting && !snapshotPresent,
      "",
      parsed.error ?? (snapshotPresent ? "snapshot을 읽을 수 없습니다." : "worker가 아직 첫 snapshot을 저장하지 않았습니다."),
    );
    const unavailable = [
      "intake",
      "pm",
      "repository",
      "implementation",
      "writer-prs",
      "governance",
      "review-coverage",
      "integration",
      "completion",
    ].map((id) => check(
      id,
      id,
      false,
      waiting,
      "",
      "snapshot이 준비된 뒤 확인할 수 있습니다.",
    ));
    const checks = [snapshotCheck, ...unavailable];
    return {
      runId: null,
      projectId: null,
      passed: false,
      completedChecks: 0,
      totalChecks: checks.length,
      checks,
    };
  }

  const writers = writerRuns(payload);
  const writerPrNumbers = writers
    .map((run) => run.pullRequestNumber)
    .filter((value): value is number => typeof value === "number");
  const writerPrsVerified = writers.length > 0
    && writers.every((run) =>
      run.status === "done"
      && Boolean(run.commitSha)
      && typeof run.pullRequestNumber === "number"
      && Boolean(run.pullRequestUrl));
  const reviewedPrNumbers = new Set(
    roleRuns(payload, "code-review").flatMap((run) => run.reviewedPullRequests),
  );
  const reviewCoverage = writerPrNumbers.length > 0
    && writerPrNumbers.every((number) => reviewedPrNumbers.has(number));
  const integrationExpected = payload.integrationPullRequestNumbers;
  const mergedNumbers = new Set(payload.integration?.mergedPullRequests.map((pullRequest) => pullRequest.number) ?? []);
  const integrationComplete = integrationExpected.length > 0
    && writerPrNumbers.every((number) => integrationExpected.includes(number))
    && integrationExpected.every((number) => mergedNumbers.has(number));

  const checks: E2ECheck[] = [
    check(
      "snapshot",
      "Bloom orchestration snapshot",
      payload.request.includes(LIVE_E2E_MARKER),
      false,
      `Run #${payload.runId} snapshot이 Bloom E2E marker와 함께 확인됨`,
      "snapshot request에 Bloom E2E marker가 없습니다.",
    ),
    check(
      "intake",
      "Organization Intake",
      Boolean(payload.intake?.analysis && payload.intake.sessionId),
      waiting,
      `Intake ${payload.intakeId}와 실제 session evidence가 기록됨`,
      "Intake analysis/session evidence가 아직 없습니다.",
    ),
    check(
      "pm",
      "PM plan",
      Boolean(payload.plan && payload.pm?.sessionId),
      waiting,
      `${payload.plan?.repositoryName ?? ""} PM plan과 session evidence가 기록됨`,
      "PM plan/session evidence가 아직 없습니다.",
    ),
    check(
      "repository",
      "Repository bootstrap",
      Boolean(payload.repository?.repository && payload.repository.workspacePath),
      waiting,
      `${payload.repository?.repository ?? ""} workspace가 bootstrap됨`,
      "repository/workspace evidence가 아직 없습니다.",
    ),
    check(
      "implementation",
      "Frontend + Backend implementation",
      allRolesDone(payload, IMPLEMENTATION_ROLES),
      waiting,
      "Frontend와 Backend Agent Task가 모두 완료됨",
      "Frontend/Backend Agent Task 완료를 기다리는 중입니다.",
    ),
    check(
      "writer-prs",
      "Writer commit / PR evidence",
      writerPrsVerified,
      waiting,
      `${writers.length}개 repository-writing Task의 commit과 PR이 검증됨`,
      "repository-writing Task의 commit/PR evidence가 불완전합니다.",
    ),
    check(
      "governance",
      "Data Marketing -> Documentation -> Review -> QA",
      allRolesDone(payload, GOVERNANCE_ROLES),
      waiting,
      "필수 governance Agent chain이 모두 완료됨",
      "Data Marketing/Documentation/Code Review/Reviewer/QA 중 미완료 Task가 있습니다.",
    ),
    check(
      "review-coverage",
      "Code Review PR coverage",
      reviewCoverage,
      waiting,
      `${writerPrNumbers.length}개 writer PR이 Code Review evidence에 포함됨`,
      "모든 writer PR이 Code Review evidence에 포함되지 않았습니다.",
    ),
    check(
      "integration",
      "Integration merge",
      integrationComplete,
      waiting,
      `${integrationExpected.length}개 PR이 integration 대상으로 기록되고 모두 merge됨`,
      "integration PR 집합 또는 merge evidence가 완전하지 않습니다.",
    ),
    check(
      "completion",
      "Run completion",
      runStatus === "completed" && snapshot?.phase === "completed" && !payload.blockedReason,
      waiting,
      "worker Run과 orchestration phase가 모두 completed 상태임",
      payload.blockedReason
        ? `blocked: ${payload.blockedReason}`
        : `현재 run=${runStatus}, phase=${snapshot?.phase ?? "none"}`,
    ),
  ];

  const completedChecks = checks.filter((item) => item.status === "pass").length;
  return {
    runId: payload.runId,
    projectId: payload.projectId,
    passed: checks.every((item) => item.status === "pass"),
    completedChecks,
    totalChecks: checks.length,
    checks,
  };
}
