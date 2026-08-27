import { ensureSpecialistAgentPlan, SPECIALIST_AGENT_ROLES } from "./specialistPlanning";
import type { ProjectPlan, ProjectTaskPlan } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fullStackPlan(): ProjectPlan {
  return {
    projectName: "Specialist Fixture",
    repositoryName: "specialist-fixture",
    productSummary: "A user-facing full-stack web application with authentication and SQLite persistence.",
    architectureSummary: "React frontend, API backend, SQLite database, CI build and production deployment path.",
    needsAuth: true,
    technologyDecisions: [
      { area: "database", choice: "SQLite", reason: "small durable relational store" },
      { area: "delivery", choice: "CI", reason: "reproducible build and test gate" },
    ],
    tasks: [
      {
        id: "FE-001",
        title: "Frontend",
        role: "frontend",
        taskSlug: "frontend-app",
        summary: "Implement the accessible user interface.",
        dependsOn: [],
        acceptanceCriteria: ["frontend build passes"],
      },
      {
        id: "BE-001",
        title: "Backend",
        role: "backend",
        taskSlug: "backend-api",
        summary: "Implement authenticated API and persistence.",
        dependsOn: [],
        acceptanceCriteria: ["API tests pass"],
      },
    ],
  };
}

function testFullStackSpecialists() {
  const prepared = ensureSpecialistAgentPlan(fullStackPlan());
  const roles = new Set(prepared.tasks.map((task) => task.role));

  for (const role of SPECIALIST_AGENT_ROLES) {
    assert(roles.has(role), `full-stack plan must activate ${role} Agent`);
  }

  const database = prepared.tasks.find((task) => task.role === "database");
  const security = prepared.tasks.find((task) => task.role === "security");
  const accessibility = prepared.tasks.find((task) => task.role === "accessibility");
  const devops = prepared.tasks.find((task) => task.role === "devops");

  assert(database?.dependsOn.includes("BE-001"), "Database Agent must wait for backend implementation evidence");
  assert(security?.dependsOn.includes(database.id), "Security Agent must inspect the database specialist result when present");
  assert(accessibility?.dependsOn.includes("FE-001"), "Accessibility Agent must inspect frontend implementation evidence");
  assert(devops?.dependsOn.includes(security.id), "DevOps Agent must consume security hardening evidence when present");
}

function testSpecialistRoutingIsIdempotent() {
  const once = ensureSpecialistAgentPlan(fullStackPlan());
  const twice = ensureSpecialistAgentPlan(once);

  for (const role of SPECIALIST_AGENT_ROLES) {
    assert(
      twice.tasks.filter((task) => task.role === role).length === 1,
      `${role} specialist routing must not duplicate an existing specialist task`,
    );
  }
}

function testSmallNonImplementationPlanStaysSmall() {
  const plan: ProjectPlan = {
    projectName: "Research Note",
    repositoryName: "research-note",
    productSummary: "Clarify a product idea without implementation.",
    architectureSummary: "No application implementation is in scope.",
    needsAuth: false,
    technologyDecisions: [],
    tasks: [
      {
        id: "IDEA-001",
        title: "Clarify scope",
        role: "idea",
        taskSlug: "clarify-scope",
        summary: "Clarify the product scope.",
        dependsOn: [],
        acceptanceCriteria: ["scope is documented"],
      },
    ],
  };

  const prepared = ensureSpecialistAgentPlan(plan);
  assert(prepared.tasks.length === 1, "specialists must not be forced into a non-implementation plan without relevant signals");
}

function testMarketingTaskBudgetIsProtected() {
  const tasks: ProjectTaskPlan[] = Array.from({ length: 35 }, (_, index) => ({
    id: `IDEA-${String(index + 1).padStart(3, "0")}`,
    title: `Task ${index + 1}`,
    role: "idea",
    taskSlug: `task-${index + 1}`,
    summary: index === 0 ? "database security deployment accessibility frontend backend" : "planning task",
    dependsOn: [],
    acceptanceCriteria: ["complete"],
  }));
  const plan: ProjectPlan = {
    ...fullStackPlan(),
    tasks,
  };

  const prepared = ensureSpecialistAgentPlan(plan);
  assert(prepared.tasks.length === 35, "specialist routing must preserve the mandatory marketing task budget");
}

function run() {
  testFullStackSpecialists();
  testSpecialistRoutingIsIdempotent();
  testSmallNonImplementationPlanStaysSmall();
  testMarketingTaskBudgetIsProtected();
  console.log("specialistPlanning policy tests passed");
}

run();
