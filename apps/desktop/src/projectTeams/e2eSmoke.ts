import { REPOSITORY_WRITER_ROLES } from "./planTopology";
import type { ExecutableAgentRole, ProjectState, ProjectTeamsState } from "./types";

export const LIVE_E2E_MARKER = "[LUNA-E2E-SMOKE]";
export const LIVE_E2E_PRODUCT = "Pulseboard";

export type E2ECheckStatus = "pass" | "pending" | "fail";

export type E2ECheck = {
  id: string;
  label: string;
  status: E2ECheckStatus;
  detail: string;
};

export type E2EAudit = {
  projectId: string;
  passed: boolean;
  completedChecks: number;
  totalChecks: number;
  checks: E2ECheck[];
};

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
  const repositoryName = `luna-e2e-pulseboard-${runId.toLowerCase()}`;
  const request = `${LIVE_E2E_MARKER} Build a small but production-quality full-stack web product named ${LIVE_E2E_PRODUCT}. Use the exact repository name ${repositoryName}. The product is a lightweight feedback board for a small product team. Users can create feedback with title, details, and category; list feedback; filter by category and status; and move feedback between open, planned, and done. Use a web frontend plus an API with SQLite persistence. Do not use authentication, payments, realtime infrastructure, paid services, or external APIs. The repository must be a project monorepo with clear frontend/API separation, automated tests for meaningful behavior, responsive and accessible UI, loading/error/empty states, reproducible setup, and no fake production claims. The PM must include actual Frontend and Backend implementation work. Luna's mandatory Data & Marketing -> Documentation -> Code Review -> Reviewer -> QA chain must remain intact. Data & Marketing must analyze the real built product and write docs/marketing/MARKETING_ANALYSIS.md; Documentation must independently verify it and write docs/marketing/GO_TO_MARKET.md. Finish only after repository PRs are merged to develop, Agent retrospectives run, and Team Evolution is executed. This is a Luna live E2E smoke project, so prefer boring reliable dependencies and keep scope intentionally small.`;

  return {
    runId,
    repositoryName,
    command: `/start ${request}`,
    request,
  };
}

export function isLiveE2EProject(project: ProjectState) {
  return project.request.includes(LIVE_E2E_MARKER);
}

export function findLatestLiveE2EProject(state: ProjectTeamsState) {
  return state.projects
    .filter(isLiveE2EProject)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null;
}

function roleRuns(project: ProjectState, role: ExecutableAgentRole) {
  return project.taskRuns.filter((run) => run.role === role);
}

function allDone(project: ProjectState, roles: ExecutableAgentRole[]) {
  return roles.every((role) => {
    const runs = roleRuns(project, role);
    return runs.length > 0 && runs.every((run) => run.status === "done");
  });
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

export function auditLiveE2EProject(state: ProjectTeamsState, project: ProjectState): E2EAudit {
  const planned = Boolean(project.plan);
  const finished = project.status === "completed";
  const writerRuns = project.taskRuns.filter((run) => REPOSITORY_WRITER_ROLES.includes(run.role));
  const writerPrsVerified = writerRuns.length > 0
    && writerRuns.every((run) => run.status === "done" && Boolean(run.commitSha) && Boolean(run.pullRequestNumber));
  const implementationRoles: ExecutableAgentRole[] = ["frontend", "backend"];
  const governanceRoles: ExecutableAgentRole[] = [
    "data-marketing",
    "documentation",
    "code-review",
    "reviewer",
    "qa",
  ];
  const reviewRuns = roleRuns(project, "code-review");
  const allWriterPrNumbers = writerRuns
    .map((run) => run.pullRequestNumber)
    .filter((value): value is number => value !== null);
  const reviewedPrNumbers = new Set(reviewRuns.flatMap((run) => run.reviewedPullRequests));
  const reviewCoverage = allWriterPrNumbers.length > 0
    && allWriterPrNumbers.every((number) => reviewedPrNumbers.has(number));
  const team = state.teams.find((candidate) => candidate.id === project.teamId) ?? null;
  const evolutionEvidence = (state.evolutionExperiments ?? []).some(
    (experiment) => experiment.sourceProjectId === project.id || experiment.targetProjectId === project.id,
  ) || (finished && project.runtimeMessage.includes("Team Evolution"));

  const checks: E2ECheck[] = [
    check(
      "intake",
      "Organization Intake",
      Boolean(project.intake?.id && project.intake.sessionId),
      !planned,
      `Intake ${project.intake?.id ?? ""}와 Codex session이 기록됨`,
      "실제 Intake record/session이 아직 확인되지 않음",
    ),
    check(
      "allocation",
      "팀 배정",
      Boolean(project.teamAllocation && project.teamId),
      !planned,
      `${project.teamId} 팀 배정 evidence가 기록됨`,
      "팀 배정 evidence가 아직 없음",
    ),
    check(
      "pm",
      "PM 계획 / repository bootstrap",
      Boolean(project.plan && project.pmSessionId && project.repositoryFullName && project.workspacePath),
      !planned || project.status === "planning" || project.status === "queued",
      `${project.repositoryFullName} · PM session 및 workspace 기록됨`,
      "PM plan/session/repository/workspace 중 일부가 없음",
    ),
    check(
      "implementation",
      "Frontend + Backend 실제 구현",
      allDone(project, implementationRoles),
      !finished,
      "Frontend와 Backend Task가 모두 완료됨",
      "Frontend/Backend Task가 모두 done인지 확인 필요",
    ),
    check(
      "writer-prs",
      "Writer commit / PR",
      writerPrsVerified,
      !finished,
      `${writerRuns.length}개 repository-writing Task의 commit과 PR이 검증됨`,
      "repository-writing Task의 commit/PR evidence가 불완전함",
    ),
    check(
      "marketing-docs",
      "Data Marketing + Documentation",
      allDone(project, ["data-marketing", "documentation"]),
      !finished,
      "시장/제품 분석과 GO_TO_MARKET 문서 Task가 완료됨",
      "Data Marketing 또는 Documentation Task가 완료되지 않음",
    ),
    check(
      "governance",
      "Code Review -> Reviewer -> QA",
      allDone(project, governanceRoles),
      !finished,
      "필수 marketing/review/QA governance role이 모두 완료됨",
      "필수 governance role 중 미완료 Task가 있음",
    ),
    check(
      "review-coverage",
      "Code Review PR coverage",
      reviewCoverage,
      !finished,
      `${allWriterPrNumbers.length}개 writer PR이 Code Review evidence에 포함됨`,
      "모든 writer PR이 Code Review evidence에 포함됐는지 확인 필요",
    ),
    check(
      "integration",
      "develop 통합",
      finished || project.status === "retrospective",
      project.taskRuns.some((run) => run.status !== "done"),
      "Agent Task 완료 후 develop 통합 gate를 통과함",
      "develop 통합 단계가 아직 확인되지 않음",
    ),
    check(
      "retrospective-evolution",
      "회고 + Team Evolution",
      finished && Boolean(project.completedAt) && evolutionEvidence,
      !finished,
      "프로젝트 완료 시각과 Team Evolution 실행 evidence가 있음",
      "회고/Team Evolution 완료 evidence가 아직 없음",
    ),
    check(
      "team-release",
      "팀 idle 복귀",
      finished && Boolean(team) && team?.status === "idle" && team.activeProjectId === null,
      !finished,
      `${team?.name ?? project.teamId} 팀이 프로젝트 완료 후 idle로 복귀함`,
      "완료 후 팀 idle 복귀가 확인되지 않음",
    ),
  ];

  const completedChecks = checks.filter((item) => item.status === "pass").length;
  return {
    projectId: project.id,
    passed: checks.every((item) => item.status === "pass"),
    completedChecks,
    totalChecks: checks.length,
    checks,
  };
}
