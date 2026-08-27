import { createInitialProjectTeamsState } from "./catalog";
import { ORCHESTRATION_MAX_PARALLEL_TASKS } from "./orchestrationCore";
import { REPOSITORY_WRITER_ROLES } from "./planTopology";
import {
  SPECIALIST_AGENT_ROLES,
  routeSpecialistAgentTasks,
} from "./specialistRouting";
import type { ProjectPlan } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function specialistPlan(): ProjectPlan {
  return {
    projectName: "Specialist routing",
    repositoryName: "specialist-routing",
    productSummary: "Route specialist implementation work without changing the PM DAG.",
    architectureSummary: "Keep the existing task graph and transfer specialist ownership only.",
    needsAuth: false,
    technologyDecisions: [],
    tasks: [
      {
        id: "IDEA-001",
        title: "Plan user interviews and usability research",
        role: "idea",
        taskSlug: "ux-research-user-interviews",
        summary: "Define personas, user interview questions, and usability research evidence.",
        dependsOn: [],
        acceptanceCriteria: ["Research plan and target personas are explicit."],
      },
      {
        id: "BE-001",
        title: "Create database schema and migrations",
        role: "backend",
        taskSlug: "database-schema-migrations",
        summary: "Implement PostgreSQL schema, migration, and persistence boundaries.",
        dependsOn: [],
        acceptanceCriteria: ["Database schema and rollback migration are verified."],
      },
      {
        id: "BE-002",
        title: "Implement OAuth permission boundary",
        role: "backend",
        taskSlug: "security-oauth-permissions",
        summary: "Implement authentication, authorization, session, and permission checks.",
        dependsOn: [],
        acceptanceCriteria: ["Unauthorized access is rejected."],
      },
      {
        id: "BE-003",
        title: "Prepare Docker deployment pipeline",
        role: "backend",
        taskSlug: "devops-deployment-pipeline",
        summary: "Add container deployment, monitoring, and CI pipeline configuration.",
        dependsOn: [],
        acceptanceCriteria: ["Deployment pipeline configuration is reproducible."],
      },
      {
        id: "BE-004",
        title: "Integrate third-party provider API",
        role: "backend",
        taskSlug: "external-api-webhook-integration",
        summary: "Implement an external API, webhook, and SDK integration boundary.",
        dependsOn: [],
        acceptanceCriteria: ["Provider failures are isolated and verified."],
      },
      {
        id: "FE-001",
        title: "Complete keyboard accessibility",
        role: "frontend",
        taskSlug: "accessibility-keyboard-focus",
        summary: "Verify ARIA semantics, keyboard navigation, focus order, and contrast.",
        dependsOn: [],
        acceptanceCriteria: ["Keyboard-only user flow is operable."],
      },
      {
        id: "FE-002",
        title: "Improve render performance",
        role: "frontend",
        taskSlug: "performance-render-bundle",
        summary: "Measure render performance, bundle cost, and caching bottlenecks.",
        dependsOn: [],
        acceptanceCriteria: ["Measured rendering bottlenecks are addressed."],
      },
      {
        id: "BE-005",
        title: "Build automated regression suite",
        role: "backend",
        taskSlug: "test-automation-regression-suite",
        summary: "Add integration test suite and end-to-end test automation.",
        dependsOn: [],
        acceptanceCriteria: ["Regression suite is reproducible."],
      },
      {
        id: "BE-006",
        title: "Implement general API endpoint",
        role: "backend",
        taskSlug: "api-endpoint",
        summary: "Implement a normal application API endpoint.",
        dependsOn: [],
        acceptanceCriteria: ["API contract is implemented."],
      },
    ],
  };
}

function run() {
  const state = createInitialProjectTeamsState();
  for (const team of state.teams) {
    assert(team.agents.length === 30, `${team.id} must expose 30 Agents`);
    assert(team.agents.filter((agent) => agent.role === "frontend").length === 3, `${team.id} must own three Frontend Agents`);
    assert(team.agents.filter((agent) => agent.role === "backend").length === 3, `${team.id} must own three Backend Agents`);
    assert(team.agents.filter((agent) => agent.role === "code-review").length === 2, `${team.id} must own two Code Review Agents`);
    assert(team.agents.filter((agent) => agent.role === "qa").length === 2, `${team.id} must own two QA Agents`);
    assert(team.agents.filter((agent) => agent.role === "documentation").length === 2, `${team.id} must own two Documentation Agents`);

    for (const role of SPECIALIST_AGENT_ROLES) {
      assert(
        team.agents.some((agent) => agent.id === `${team.id}:${role}` && agent.role === role),
        `${team.id} must expose independent ${role} Agent identity`,
      );
      if (role !== "ux-research") {
        assert(REPOSITORY_WRITER_ROLES.includes(role), `${role} must pass through PR review topology`);
      }
    }
  }

  const routed = routeSpecialistAgentTasks(specialistPlan());
  const roleByTask = new Map(routed.tasks.map((task) => [task.id, task.role]));
  assert(roleByTask.get("IDEA-001") === "ux-research", "research work must route to UX Research Agent");
  assert(roleByTask.get("BE-001") === "database", "database work must route to Database Agent");
  assert(roleByTask.get("BE-002") === "security", "security work must route to Security Agent");
  assert(roleByTask.get("BE-003") === "devops", "deployment work must route to DevOps Agent");
  assert(roleByTask.get("BE-004") === "api-integration", "external API work must route to API Integration Agent");
  assert(roleByTask.get("FE-001") === "accessibility", "a11y work must route to Accessibility Agent");
  assert(roleByTask.get("FE-002") === "performance", "performance work must route to Performance Agent");
  assert(roleByTask.get("BE-005") === "test-automation", "automated test work must route to Test Automation Agent");
  assert(roleByTask.get("BE-006") === "backend", "generic backend work must stay with Backend Agent");

  const original = specialistPlan();
  const routedAgain = routeSpecialistAgentTasks(routeSpecialistAgentTasks(original));
  assert(
    JSON.stringify(routedAgain) === JSON.stringify(routeSpecialistAgentTasks(original)),
    "specialist routing must be idempotent",
  );
  assert(ORCHESTRATION_MAX_PARALLEL_TASKS === 2, "team expansion must not raise the concurrency hard cap yet");

  console.log("PASS  Bloom 30-Agent team expansion and specialist routing scenarios passed.");
}

run();
