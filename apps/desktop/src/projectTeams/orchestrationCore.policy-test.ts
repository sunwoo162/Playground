import {
  ORCHESTRATION_MAX_PARALLEL_TASKS,
  prepareOrchestrationPlan,
  projectStatusForActiveRoles,
  refreshOrchestrationReadiness,
  selectOrchestrationWave,
  summarizeTaskRuns,
} from "./orchestrationCore";
import type { ExecutableAgentRole, ProjectPlan, ProjectTaskRun, TaskRunStatus } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function taskRun(
  taskId: string,
  role: ExecutableAgentRole,
  status: TaskRunStatus,
): ProjectTaskRun {
  return {
    taskId,
    role,
    agentId: `rose:${role}`,
    status,
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
  };
}

function basePlan(): ProjectPlan {
  return {
    projectName: "Sample Builder Project",
    repositoryName: "sample-builder-project",
    productSummary: "A sample project used to validate the shared orchestration core.",
    architectureSummary: "A production web application planned and delivered by independent Agents.",
    needsAuth: true,
    technologyDecisions: [],
    tasks: [
      {
        id: "IDEA-001",
        title: "요구사항 구체화",
        role: "idea",
        taskSlug: "refine-product-idea",
        summary: "사용자 요구사항과 제품 범위를 구체화합니다.",
        dependsOn: [],
        acceptanceCriteria: ["핵심 사용자와 사용자 가치가 명확하다."],
      },
    ],
  };
}

function testPlanPreparation() {
  const prepared = prepareOrchestrationPlan(basePlan());
  const authServer = prepared.tasks.find((task) => task.taskSlug.startsWith("bouquet-auth-server"));
  const authClient = prepared.tasks.find((task) => task.taskSlug.startsWith("bouquet-auth-client"));
  const marketing = prepared.tasks.find((task) => task.role === "data-marketing");
  const qa = prepared.tasks.find((task) => task.role === "qa");

  assert(authServer, "needsAuth plan must inject the shared Bouquet backend task");
  assert(authClient, "needsAuth plan must inject the shared Bouquet frontend task");
  assert(authClient.dependsOn.includes(authServer.id), "Bouquet frontend must depend on Bouquet backend");
  assert(marketing, "prepared plan must include the mandatory Data & Marketing task");
  assert(qa, "prepared plan must include the mandatory QA gate");
  assert(
    prepared.technologyDecisions.some((decision) =>
      decision.area.toLowerCase() === "authentication" && decision.choice.includes("꽃다발"),
    ),
    "prepared plan must record the Bouquet authentication decision",
  );
}

function testDependencyReadiness() {
  const plan: ProjectPlan = {
    ...basePlan(),
    needsAuth: false,
    tasks: [
      {
        id: "FE-001",
        title: "Frontend",
        role: "frontend",
        taskSlug: "frontend-shell",
        summary: "Frontend shell",
        dependsOn: [],
        acceptanceCriteria: ["build passes"],
      },
      {
        id: "QA-001",
        title: "QA",
        role: "qa",
        taskSlug: "qa-shell",
        summary: "QA shell",
        dependsOn: ["FE-001"],
        acceptanceCriteria: ["flow passes"],
      },
    ],
  };
  const before = [
    taskRun("FE-001", "frontend", "done"),
    taskRun("QA-001", "qa", "pending"),
  ];
  const after = refreshOrchestrationReadiness(plan, before);
  assert(after[1].status === "ready", "pending task must become ready when every dependency is done");

  const stillPending = refreshOrchestrationReadiness(plan, [
    taskRun("FE-001", "frontend", "running"),
    taskRun("QA-001", "qa", "pending"),
  ]);
  assert(stillPending[1].status === "pending", "task must remain pending while a dependency is unfinished");
}

function testBoundedRoleExclusiveWave() {
  const wave = selectOrchestrationWave([
    taskRun("FE-001", "frontend", "ready"),
    taskRun("FE-002", "frontend", "ready"),
    taskRun("BE-001", "backend", "ready"),
    taskRun("DS-001", "designer", "ready"),
  ]);

  assert(ORCHESTRATION_MAX_PARALLEL_TASKS === 2, "default orchestration concurrency must remain two");
  assert(wave.length === 2, "default wave must contain at most two tasks");
  assert(wave[0].taskId === "FE-001", "wave selection must preserve task order");
  assert(wave[1].taskId === "BE-001", "same-role ready task must be skipped within the same wave");

  const withBusyFrontend = selectOrchestrationWave([
    taskRun("FE-RUNNING", "frontend", "running"),
    taskRun("FE-READY", "frontend", "ready"),
    taskRun("BE-READY", "backend", "ready"),
  ]);
  assert(withBusyFrontend.length === 1, "a role already running must not receive another task");
  assert(withBusyFrontend[0].taskId === "BE-READY", "other idle roles remain schedulable");
}

function testTaskSummaryAndPhase() {
  const summary = summarizeTaskRuns([
    taskRun("A", "frontend", "done"),
    taskRun("B", "backend", "blocked"),
  ]);
  assert(summary.hasBlocked, "blocked run must be reflected in terminal summary");
  assert(!summary.allDone, "mixed done/blocked runs are not all done");
  assert(summary.doneCount === 1 && summary.blockedCount === 1, "summary counts must be deterministic");

  assert(projectStatusForActiveRoles(["frontend", "qa"]) === "qa", "QA must outrank development phase");
  assert(projectStatusForActiveRoles(["designer", "frontend"]) === "development", "development must outrank design");
  assert(projectStatusForActiveRoles(["idea"]) === "planning", "Idea-only work must map to planning");
}

function run() {
  testPlanPreparation();
  testDependencyReadiness();
  testBoundedRoleExclusiveWave();
  testTaskSummaryAndPhase();
  console.log("orchestrationCore policy tests passed");
}

run();
