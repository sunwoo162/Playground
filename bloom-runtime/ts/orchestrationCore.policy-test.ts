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
  agentId = `rose:${role}`,
): ProjectTaskRun {
  return {
    taskId,
    role,
    agentId,
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

function testInitialAgentDistribution() {
  const plan: ProjectPlan = {
    ...basePlan(),
    needsAuth: false,
    tasks: [
      { id: "FE-001", title: "A", role: "frontend", taskSlug: "a", summary: "A", dependsOn: [], acceptanceCriteria: ["A"] },
      { id: "FE-002", title: "B", role: "frontend", taskSlug: "b", summary: "B", dependsOn: [], acceptanceCriteria: ["B"] },
      { id: "FE-003", title: "C", role: "frontend", taskSlug: "c", summary: "C", dependsOn: [], acceptanceCriteria: ["C"] },
      { id: "FE-004", title: "D", role: "frontend", taskSlug: "d", summary: "D", dependsOn: [], acceptanceCriteria: ["D"] },
      { id: "QA-001", title: "Q1", role: "qa", taskSlug: "q1", summary: "Q1", dependsOn: [], acceptanceCriteria: ["Q1"] },
      { id: "QA-002", title: "Q2", role: "qa", taskSlug: "q2", summary: "Q2", dependsOn: [], acceptanceCriteria: ["Q2"] },
    ],
  };
  const distributed = refreshOrchestrationReadiness(
    plan,
    plan.tasks.map((task) => taskRun(task.id, task.role, "pending")),
  );

  assert(distributed[0].agentId === "rose:frontend", "first frontend task must use primary Frontend Agent");
  assert(distributed[1].agentId === "rose:frontend-2", "second frontend task must use Frontend Agent 2");
  assert(distributed[2].agentId === "rose:frontend-3", "third frontend task must use Frontend Agent 3");
  assert(distributed[3].agentId === "rose:frontend", "frontend allocation must round-robin after three instances");
  assert(distributed[4].agentId === "rose:qa", "first QA task must use primary QA Agent");
  assert(distributed[5].agentId === "rose:qa-2", "second QA task must use QA Agent 2");
}

function testBoundedAgentExclusiveWave() {
  const candidates = [
    taskRun("FE-001", "frontend", "ready", "rose:frontend"),
    taskRun("FE-002", "frontend", "ready", "rose:frontend-2"),
    taskRun("BE-001", "backend", "ready", "rose:backend"),
  ];
  const wave = selectOrchestrationWave(candidates);

  assert(ORCHESTRATION_MAX_PARALLEL_TASKS === 2, "default orchestration concurrency must remain two");
  assert(wave.length === 2, "default wave must contain at most two tasks");
  assert(wave[0].taskId === "FE-001", "wave selection must preserve task order");
  assert(wave[1].taskId === "FE-002", "different Frontend Agent instances may run same-role tasks together");

  const oversizedRequest = selectOrchestrationWave(candidates, 10);
  assert(
    oversizedRequest.length === ORCHESTRATION_MAX_PARALLEL_TASKS,
    "caller-provided limit must never raise concurrency above the orchestration hard cap",
  );

  const withBusyAgent = selectOrchestrationWave([
    taskRun("FE-RUNNING", "frontend", "running", "rose:frontend"),
    taskRun("FE-SAME", "frontend", "ready", "rose:frontend"),
    taskRun("FE-SECOND", "frontend", "ready", "rose:frontend-2"),
  ]);
  assert(withBusyAgent.length === 1, "a running Agent instance must not receive a second task");
  assert(withBusyAgent[0].taskId === "FE-SECOND", "another idle instance of the same role remains schedulable");
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
  assert(projectStatusForActiveRoles(["ux-research"]) === "planning", "UX research must map to planning");
  assert(projectStatusForActiveRoles(["performance"]) === "development", "Performance work must map to development");
}

function run() {
  testPlanPreparation();
  testDependencyReadiness();
  testInitialAgentDistribution();
  testBoundedAgentExclusiveWave();
  testTaskSummaryAndPhase();
  console.log("orchestrationCore policy tests passed");
}

run();
