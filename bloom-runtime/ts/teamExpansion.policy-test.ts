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

function roleCount(team: ReturnType<typeof createInitialProjectTeamsState>["teams"][number], role: string) {
  return team.agents.filter((agent) => agent.role === role).length;
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
        title: "Improve rendering performance",
        role: "frontend",
        taskSlug: "performance-rendering-bundle-size",
        summary: "Profile rendering performance and reduce bundle size bottlenecks.",
        dependsOn: [],
        acceptanceCriteria: ["Measured rendering bottleneck is addressed."],
      },
      {
        id: "BE-004",
        title: "Integrate external webhook API",
        role: "backend",
        taskSlug: "api-integration-webhook",
        summary: "Implement external API webhook contract and retry boundaries.",
        dependsOn: [],
        acceptanceCriteria: ["Webhook contract and failure handling are verified."],
      },
      {
        id: "FE-003",
        title: "Automate browser regression flow",
        role: "frontend",
        taskSlug: "test-automation-playwright",
        summary: "Add Playwright E2E test automation for the critical user flow.",
        dependsOn: [],
        acceptanceCriteria: ["Playwright regression runs reproducibly."],
      },
      {
        id: "DS-001",
        title: "Validate onboarding usability",
        role: "designer",
        taskSlug: "ux-research-usability",
        summary: "Use usability evidence and journey mapping to validate the onboarding design.",
        dependsOn: [],
        acceptanceCriteria: ["Design decisions cite usability evidence."],
      },
      {
        id: "BE-005",
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
    assert(roleCount(team, "frontend") === 3, `${team.id} must expose three Frontend Agents`);
    assert(roleCount(team, "backend") === 3, `${team.id} must expose three Backend Agents`);
    assert(roleCount(team, "code-review") === 2, `${team.id} must expose two Code Review Agents`);
    assert(roleCount(team, "qa") === 2, `${team.id} must expose two QA Agents`);
    assert(roleCount(team, "documentation") === 2, `${team.id} must expose two Documentation Agents`);

    for (const role of SPECIALIST_AGENT_ROLES) {
      assert(
        team.agents.some((agent) => agent.id === `${team.id}:${role}` && agent.role === role),
        `${team.id} must expose independent ${role} Agent identity`,
      );
      assert(REPOSITORY_WRITER_ROLES.includes(role), `${role} must pass through PR review topology`);
    }
  }

  const routed = routeSpecialistAgentTasks(specialistPlan());
  const roleByTask = new Map(routed.tasks.map((task) => [task.id, task.role]));
  assert(roleByTask.get("BE-001") === "database", "database work must route to Database Agent");
  assert(roleByTask.get("BE-002") === "security", "security work must route to Security Agent");
  assert(roleByTask.get("BE-003") === "devops", "deployment work must route to DevOps Agent");
  assert(roleByTask.get("FE-001") === "accessibility", "a11y work must route to Accessibility Agent");
  assert(roleByTask.get("FE-002") === "performance", "performance work must route to Performance Agent");
  assert(roleByTask.get("BE-004") === "api-integration", "external API work must route to API Integration Agent");
  assert(roleByTask.get("FE-003") === "test-automation", "browser automation work must route to Test Automation Agent");
  assert(roleByTask.get("DS-001") === "ux-research", "usability work must route to UX Research Agent");
  assert(roleByTask.get("BE-005") === "backend", "generic backend work must stay with Backend Agent");

  const original = specialistPlan();
  const routedAgain = routeSpecialistAgentTasks(routeSpecialistAgentTasks(original));
  assert(
    JSON.stringify(routedAgain) === JSON.stringify(routeSpecialistAgentTasks(original)),
    "specialist routing must be idempotent",
  );
  assert(ORCHESTRATION_MAX_PARALLEL_TASKS === 2, "30-Agent roster expansion must keep concurrency optimization deferred");

  console.log("PASS  Bloom 30-Agent team capacity and specialist routing scenarios passed.");
}

run();
