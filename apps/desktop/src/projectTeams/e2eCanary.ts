import type {
  ExecutableAgentRole,
  ProjectState,
  ProjectTeamsState,
  ProjectTaskRun,
} from "./types";

export const E2E_CANARY_MARKER = "[LUNA-E2E-CANARY:v1]";

export const E2E_CANARY_REQUEST = `${E2E_CANARY_MARKER}
Build a deliberately small but production-quality full-stack web product named PulseNote so Luna can prove its complete project runtime end to end.

Product goal:
- A single user can create, edit, delete, and browse short daily notes.
- Each note has a required title, optional body, zero or more short tags, and created/updated timestamps.
- Persist notes in a local SQLite database behind a backend HTTP API.
- Provide a React web UI with loading, empty, success, validation, and recoverable error states.
- Provide a backend health endpoint and input validation.
- No authentication, payments, third-party APIs, background jobs, realtime features, or external production credentials are required for this canary.
- Keep feature scope intentionally narrow. The objective is to exercise Luna's real Intake, team allocation, PM, frontend, backend, Data & Marketing, Documentation, Code Review, Reviewer, QA, PR integration, retrospective, and Team Evolution flow rather than maximize product breadth.

Engineering acceptance criteria:
- Use the normal BloomBouquet project-monorepo structure and existing Luna repository/runtime conventions.
- Frontend and backend must both be real implementation tasks, not documentation-only placeholders.
- The API and UI must have automated tests appropriate to their stack.
- The app must have a reproducible local setup/run path.
- User-facing controls need basic keyboard/accessibility semantics.
- Secrets must not be required for the canary.
- Data & Marketing must produce evidence/hypothesis-separated launch analysis, and Documentation must independently produce the final go-to-market document through the mandatory review chain.
- Do not widen scope unless a requirement is necessary to make the product runnable or verifiable.`;

export type E2ECanaryStageId =
  | "intake"
  | "allocation"
  | "pm"
  | "development"
  | "marketing"
  | "documentation"
  | "code-review"
  | "reviewer"
  | "qa"
  | "merge"
  | "retrospective"
  | "evolution";

export type E2ECanaryStageStatus = "pending" | "running" | "passed" | "blocked";

export type E2ECanaryStage = {
  id: E2ECanaryStageId;
  label: string;
  status: E2ECanaryStageStatus;
  evidence: string;
};

export type E2ECanaryReport = {
  projectId: string;
  projectName: string;
  repositoryFullName: string | null;
  teamId: string;
  status: ProjectState["status"];
  passed: boolean;
  startedAt: string;
  completedAt: string | null;
  stages: E2ECanaryStage[];
  pullRequests: number[];
  commitShas: string[];
  failureRouteCount: number;
  replanCount: number;
  blockers: string[];
};

const REQUIRED_IMPLEMENTATION_ROLES: ExecutableAgentRole[] = ["frontend", "backend"];
const REQUIRED_GOVERNANCE_ROLES: ExecutableAgentRole[] = [
  "data-marketing",
  "documentation",
  "code-review",
  "reviewer",
  "qa",
];

function roleRuns(project: ProjectState, role: ExecutableAgentRole) {
  return project.taskRuns.filter((run) => run.role === role);
}

function allRunsDone(runs: ProjectTaskRun[]) {
  return runs.length > 0 && runs.every((run) => run.status === "done");
}

function anyRunsBlocked(runs: ProjectTaskRun[]) {
  return runs.some((run) => run.status === "blocked");
}

function blockedRunEvidence(run: ProjectTaskRun) {
  return run.lastError ?? (run.blockers.join(", ") || "blocked");
}

function roleStage(
  project: ProjectState,
  id: E2ECanaryStageId,
  label: string,
  role: ExecutableAgentRole,
): E2ECanaryStage {
  const runs = roleRuns(project, role);
  if (!project.plan) {
    return { id, label, status: "pending", evidence: "PM 계획 생성 전" };
  }
  if (runs.length === 0) {
    return {
      id,
      label,
      status: "blocked",
      evidence: `E2E Canary 필수 역할 ${role} Task가 PM 계획에 없음`,
    };
  }
  if (anyRunsBlocked(runs)) {
    const failures = runs
      .filter((run) => run.status === "blocked")
      .map((run) => `${run.taskId}: ${blockedRunEvidence(run)}`)
      .join(" · ");
    return { id, label, status: "blocked", evidence: failures };
  }
  if (allRunsDone(runs)) {
    const prs = runs.flatMap((run) => run.pullRequestNumber ? [run.pullRequestNumber] : []);
    return {
      id,
      label,
      status: "passed",
      evidence: `${runs.length} Task 완료${prs.length > 0 ? ` · PR ${prs.map((pr) => `#${pr}`).join(", ")}` : ""}`,
    };
  }
  if (runs.some((run) => run.status === "running" || run.status === "ready")) {
    return { id, label, status: "running", evidence: `${runs.length} Task 진행 중` };
  }
  return { id, label, status: "pending", evidence: `${runs.length} Task dependency 대기` };
}

function implementationStage(project: ProjectState): E2ECanaryStage {
  if (!project.plan) {
    return { id: "development", label: "개발", status: "pending", evidence: "PM 계획 생성 전" };
  }

  const missing = REQUIRED_IMPLEMENTATION_ROLES.filter((role) => roleRuns(project, role).length === 0);
  if (missing.length > 0) {
    return {
      id: "development",
      label: "개발",
      status: "blocked",
      evidence: `E2E Canary 필수 구현 역할 누락: ${missing.join(", ")}`,
    };
  }

  const runs = REQUIRED_IMPLEMENTATION_ROLES.flatMap((role) => roleRuns(project, role));
  if (anyRunsBlocked(runs)) {
    return {
      id: "development",
      label: "개발",
      status: "blocked",
      evidence: runs
        .filter((run) => run.status === "blocked")
        .map((run) => `${run.taskId}: ${blockedRunEvidence(run)}`)
        .join(" · "),
    };
  }
  if (allRunsDone(runs)) {
    return {
      id: "development",
      label: "개발",
      status: "passed",
      evidence: `Frontend + Backend ${runs.length} Task 완료`,
    };
  }
  if (runs.some((run) => run.status === "running" || run.status === "ready")) {
    return { id: "development", label: "개발", status: "running", evidence: "Frontend/Backend 실행 중" };
  }
  return { id: "development", label: "개발", status: "pending", evidence: "Frontend/Backend dependency 대기" };
}

function simpleStage(
  id: E2ECanaryStageId,
  label: string,
  passed: boolean,
  running: boolean,
  blocked: boolean,
  passedEvidence: string,
  pendingEvidence: string,
): E2ECanaryStage {
  if (passed) return { id, label, status: "passed", evidence: passedEvidence };
  if (blocked) return { id, label, status: "blocked", evidence: pendingEvidence };
  if (running) return { id, label, status: "running", evidence: pendingEvidence };
  return { id, label, status: "pending", evidence: pendingEvidence };
}

export function isE2ECanaryProject(project: Pick<ProjectState, "request">) {
  return project.request.includes(E2E_CANARY_MARKER);
}

export function findLatestE2ECanaryProject(state: ProjectTeamsState) {
  return state.projects.find(isE2ECanaryProject) ?? null;
}

export function validateE2ECanaryPlan(project: ProjectState) {
  if (!isE2ECanaryProject(project) || !project.plan) return [];
  const roles = new Set(project.plan.tasks.map((task) => task.role));
  return [...REQUIRED_IMPLEMENTATION_ROLES, ...REQUIRED_GOVERNANCE_ROLES]
    .filter((role) => !roles.has(role))
    .map((role) => `필수 E2E 역할 ${role} Task가 PM 계획에 없습니다.`);
}

export function evaluateE2ECanaryProject(project: ProjectState): E2ECanaryReport {
  const intake = simpleStage(
    "intake",
    "Organization Intake",
    Boolean(project.intake),
    project.status === "queued" && !project.intake,
    project.status === "blocked" && !project.intake,
    project.intake ? `Intake ${project.intake.id} · ${project.intake.complexity}` : "Intake 완료",
    project.runtimeMessage,
  );
  const allocation = simpleStage(
    "allocation",
    "팀 배정",
    Boolean(project.teamAllocation),
    Boolean(project.intake) && !project.teamAllocation,
    project.status === "blocked" && Boolean(project.intake) && !project.teamAllocation,
    project.teamAllocation?.reason ?? `Team ${project.teamId}`,
    project.runtimeMessage,
  );
  const pmPassed = Boolean(project.plan && project.repositoryFullName && project.workspacePath);
  const pm = simpleStage(
    "pm",
    "PM / Repository",
    pmPassed,
    project.status === "planning",
    project.status === "blocked" && project.runtimeFailureSource === "pm",
    `${project.plan?.projectName ?? "project"} · ${project.repositoryFullName ?? "repository"}`,
    project.runtimeMessage,
  );

  const development = implementationStage(project);
  const marketing = roleStage(project, "marketing", "Data & Marketing", "data-marketing");
  const documentation = roleStage(project, "documentation", "Documentation", "documentation");
  const codeReview = roleStage(project, "code-review", "Code Review", "code-review");
  const reviewer = roleStage(project, "reviewer", "Reviewer", "reviewer");
  const qa = roleStage(project, "qa", "QA", "qa");

  const allTasksDone = project.taskRuns.length > 0 && project.taskRuns.every((run) => run.status === "done");
  const merged = project.status === "retrospective" || project.status === "completed";
  const merge = simpleStage(
    "merge",
    "develop 통합",
    merged,
    allTasksDone && !merged,
    project.status === "blocked" && allTasksDone,
    "필수 PR gate 통과 후 develop 통합 완료",
    allTasksDone ? project.runtimeMessage : "전체 Task 완료 대기",
  );
  const retrospective = simpleStage(
    "retrospective",
    "Agent 회고",
    project.status === "completed",
    project.status === "retrospective",
    false,
    "참여 Agent 회고 저장 완료",
    project.runtimeMessage,
  );
  const evolution = simpleStage(
    "evolution",
    "Team Evolution",
    project.status === "completed",
    project.status === "retrospective",
    false,
    project.runtimeMessage,
    "회고 완료 후 Team Evolution 결과 대기",
  );

  const stages = [
    intake,
    allocation,
    pm,
    development,
    marketing,
    documentation,
    codeReview,
    reviewer,
    qa,
    merge,
    retrospective,
    evolution,
  ];
  const pullRequests = Array.from(new Set(
    project.taskRuns.flatMap((run) => run.pullRequestNumber ? [run.pullRequestNumber] : []),
  )).sort((left, right) => left - right);
  const commitShas = Array.from(new Set(
    project.taskRuns.flatMap((run) => run.commitSha ? [run.commitSha] : []),
  ));
  const planBlockers = validateE2ECanaryPlan(project);
  const stageBlockers = stages
    .filter((stage) => stage.status === "blocked")
    .map((stage) => `${stage.label}: ${stage.evidence}`);
  const blockers = Array.from(new Set([...planBlockers, ...stageBlockers]));

  return {
    projectId: project.id,
    projectName: project.plan?.projectName ?? "PulseNote E2E Canary",
    repositoryFullName: project.repositoryFullName,
    teamId: project.teamId,
    status: project.status,
    passed: project.status === "completed" && blockers.length === 0 && stages.every((stage) => stage.status === "passed"),
    startedAt: project.createdAt,
    completedAt: project.completedAt ?? null,
    stages,
    pullRequests,
    commitShas,
    failureRouteCount: project.failureRoutes?.length ?? 0,
    replanCount: project.replans?.length ?? 0,
    blockers,
  };
}
