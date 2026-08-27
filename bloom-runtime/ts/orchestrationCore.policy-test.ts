import {
  ORCHESTRATION_MAX_PARALLEL_TASKS,
  orchestrationConcurrencyTarget,
  prepareOrchestrationPlan,
  projectStatusForActiveRoles,
  refreshOrchestrationReadiness,
  selectAdaptiveOrchestrationWave,
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

function testBoundedAgentExclusiveWave() {
  const candidates = [
    taskRun("FE-001", "frontend", "ready", "rose:frontend"),
    taskRun("FE-002", "frontend", "ready", "rose:frontend-2"),
    taskRun("BE-001", "backend", "ready", "rose:backend"),
    taskRun("DS-001", "designer", "ready", "rose:designer"),
  ];
  const wave = selectOrchestrationWave(candidates);

  assert(ORCHESTRATION_MAX_PARALLEL_TASKS === 6, "orchestration hard cap must remain six");
  assert(wave.length === 4, "different Agent identities may share one wave even when their roles match");
  assert(wave[0].taskId === "FE-001", "base wave selection must preserve task order");
  assert(wave[1].taskId === "FE-002", "a second Frontend Agent must be independently schedulable");

  const withBusyAgent = selectOrchestrationWave([
    taskRun("FE-RUNNING", "frontend", "running", "rose:frontend"),
    taskRun("FE-SAME-ID", "frontend", "ready", "rose:frontend"),
    taskRun("FE-SECOND", "frontend", "ready", "rose:frontend-2"),
    taskRun("BE-READY", "backend", "ready", "rose:backend"),
  ]);
  assert(
    !withBusyAgent.some((run) => run.taskId === "FE-SAME-ID"),
    "an Agent identity already running must not receive another task",
  );
  assert(
    withBusyAgent.some((run) => run.taskId === "FE-SECOND"),
    "another idle Agent of the same role must remain schedulable",
  );
  assert(
    withBusyAgent.some((run) => run.taskId === "BE-READY"),
    "other idle Agent identities remain schedulable",
  );

  const sixReady = [
    taskRun("FE-001", "frontend", "ready", "rose:frontend"),
    taskRun("FE-002", "frontend", "ready", "rose:frontend-2"),
    taskRun("FE-003", "frontend", "ready", "rose:frontend-3"),
    taskRun("BE-001", "backend", "ready", "rose:backend"),
    taskRun("BE-002", "backend", "ready", "rose:backend-2"),
    taskRun("BE-003", "backend", "ready", "rose:backend-3"),
    taskRun("QA-001", "qa", "ready", "rose:qa"),
  ];
  const capped = selectOrchestrationWave(sixReady, 10);
  assert(
    capped.length === ORCHESTRATION_MAX_PARALLEL_TASKS,
    "caller-provided limit must never raise concurrency above the orchestration hard cap",
  );
}

function testAdaptiveConcurrencyTargets() {
  assert(
    orchestrationConcurrencyTarget([
      taskRun("FE-001", "frontend", "ready", "rose:frontend"),
      taskRun("BE-001", "backend", "ready", "rose:backend"),
    ]) === 2,
    "one or two runnable Agents must use the two-task target",
  );
  assert(
    orchestrationConcurrencyTarget([
      taskRun("FE-001", "frontend", "ready", "rose:frontend"),
      taskRun("FE-002", "frontend", "ready", "rose:frontend-2"),
      taskRun("BE-001", "backend", "ready", "rose:backend"),
    ]) === 4,
    "three or four runnable Agents must use the four-task target",
  );
  assert(
    orchestrationConcurrencyTarget([
      taskRun("FE-001", "frontend", "ready", "rose:frontend"),
      taskRun("FE-002", "frontend", "ready", "rose:frontend-2"),
      taskRun("FE-003", "frontend", "ready", "rose:frontend-3"),
      taskRun("BE-001", "backend", "ready", "rose:backend"),
      taskRun("BE-002", "backend", "ready", "rose:backend-2"),
    ]) === 6,
    "five or more runnable Agents must use the six-task target",
  );
  assert(
    orchestrationConcurrencyTarget([
      taskRun("FE-001", "frontend", "running", "rose:frontend"),
      taskRun("FE-002", "frontend", "ready", "rose:frontend-2"),
      taskRun("FE-003", "frontend", "ready", "rose:frontend-3"),
      taskRun("BE-001", "backend", "ready", "rose:backend"),
      taskRun("BE-002", "backend", "ready", "rose:backend-2"),
    ]) === 6,
    "running work must count toward total concurrency demand",
  );
}

function testDagAwarePriority() {
  const plan: ProjectPlan = {
    ...basePlan(),
    needsAuth: false,
    tasks: [
      { id: "LEAF-001", title: "Leaf", role: "frontend", taskSlug: "leaf", summary: "Leaf task", dependsOn: [], acceptanceCriteria: ["done"] },
      { id: "CHAIN-001", title: "Chain root", role: "backend", taskSlug: "chain-root", summary: "Chain root", dependsOn: [], acceptanceCriteria: ["done"] },
      { id: "FAN-001", title: "Fan root", role: "designer", taskSlug: "fan-root", summary: "Fan root", dependsOn: [], acceptanceCriteria: ["done"] },
      { id: "CHAIN-002", title: "Chain middle", role: "documentation", taskSlug: "chain-middle", summary: "Chain middle", dependsOn: ["CHAIN-001"], acceptanceCriteria: ["done"] },
      { id: "CHAIN-003", title: "Chain end", role: "qa", taskSlug: "chain-end", summary: "Chain end", dependsOn: ["CHAIN-002"], acceptanceCriteria: ["done"] },
      { id: "FAN-002", title: "Fan child A", role: "code-review", taskSlug: "fan-child-a", summary: "Fan child A", dependsOn: ["FAN-001"], acceptanceCriteria: ["done"] },
      { id: "FAN-003", title: "Fan child B", role: "reviewer", taskSlug: "fan-child-b", summary: "Fan child B", dependsOn: ["FAN-001"], acceptanceCriteria: ["done"] },
    ],
  };
  const runs = [
    taskRun("LEAF-001", "frontend", "ready", "rose:frontend"),
    taskRun("CHAIN-001", "backend", "ready", "rose:backend"),
    taskRun("FAN-001", "designer", "ready", "rose:designer"),
    taskRun("CHAIN-002", "documentation", "pending", "rose:documentation"),
    taskRun("CHAIN-003", "qa", "pending", "rose:qa"),
    taskRun("FAN-002", "code-review", "pending", "rose:code-review"),
    taskRun("FAN-003", "reviewer", "pending", "rose:reviewer"),
  ];

  const wave = selectAdaptiveOrchestrationWave(plan, runs, 2);
  assert(wave.length === 2, "explicit narrow adaptive wave must honor the caller limit");
  assert(wave[0].taskId === "FAN-001", "task that immediately unlocks more downstream work must run first");
  assert(wave[1].taskId === "CHAIN-001", "critical-path task must outrank an unrelated leaf task");
}

function testAdaptiveFairnessSlot() {
  const roots = ["A", "B", "C", "D", "E", "F"];
  const plan: ProjectPlan = {
    ...basePlan(),
    needsAuth: false,
    tasks: [
      { id: "LEAF-001", title: "Old leaf", role: "idea", taskSlug: "old-leaf", summary: "Old ready leaf", dependsOn: [], acceptanceCriteria: ["done"] },
      ...roots.flatMap((prefix, index) => [
        {
          id: `${prefix}-001`,
          title: `${prefix} root`,
          role: index % 2 === 0 ? "frontend" as const : "backend" as const,
          taskSlug: `${prefix.toLowerCase()}-root`,
          summary: `${prefix} root`,
          dependsOn: [],
          acceptanceCriteria: ["done"],
        },
        {
          id: `${prefix}-002`,
          title: `${prefix} child`,
          role: "documentation" as const,
          taskSlug: `${prefix.toLowerCase()}-child`,
          summary: `${prefix} child`,
          dependsOn: [`${prefix}-001`],
          acceptanceCriteria: ["done"],
        },
      ]),
    ],
  };
  const runs = [
    taskRun("LEAF-001", "idea", "ready", "rose:idea"),
    ...roots.map((prefix, index) => taskRun(
      `${prefix}-001`,
      index % 2 === 0 ? "frontend" : "backend",
      "ready",
      `rose:${index % 2 === 0 ? "frontend" : "backend"}-${index + 10}`,
    )),
    ...roots.map((prefix) => taskRun(`${prefix}-002`, "documentation", "pending", `rose:documentation-${prefix.toLowerCase()}`)),
  ];

  const wave = selectAdaptiveOrchestrationWave(plan, runs, 4);
  assert(wave.length === 4, "medium adaptive wave must fill its four available slots");
  assert(
    wave.some((run) => run.taskId === "LEAF-001"),
    "wide contested waves must reserve one FIFO fairness slot for older ready work",
  );
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
  testBoundedAgentExclusiveWave();
  testAdaptiveConcurrencyTargets();
  testDagAwarePriority();
  testAdaptiveFairnessSlot();
  testTaskSummaryAndPhase();
  console.log("orchestrationCore policy tests passed");
}

run();
