import { routeSpecialistAgentTasks } from "./specialistRouting";
import type { ExecutableAgentRole, ProjectPlan } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const DIRECT_SPECIALIST_ROLES: ExecutableAgentRole[] = [
  "ux-research",
  "database",
  "security",
  "devops",
  "accessibility",
  "performance",
  "api-integration",
  "data-marketing",
  "test-automation",
];

function directSpecialistPlan(): ProjectPlan {
  return {
    projectName: "PM specialist ownership",
    repositoryName: "pm-specialist-ownership",
    productSummary: "PM assigns specialist roles directly before shared orchestration policies run.",
    architectureSummary: "Direct specialist ownership must remain stable through compatibility routing.",
    needsAuth: false,
    technologyDecisions: [],
    tasks: DIRECT_SPECIALIST_ROLES.map((role, index) => ({
      id: `SP-${String(index + 1).padStart(3, "0")}`,
      title: `${role} direct PM task`,
      role,
      taskSlug: `${role}-direct-ownership`,
      summary: `The PM intentionally assigned this task to the ${role} specialist.`,
      dependsOn: [],
      acceptanceCriteria: [`${role} ownership is preserved.`],
    })),
  };
}

function run() {
  const plan = directSpecialistPlan();
  const routed = routeSpecialistAgentTasks(plan);

  for (const task of routed.tasks) {
    const original = plan.tasks.find((candidate) => candidate.id === task.id);
    assert(Boolean(original), `missing original task ${task.id}`);
    assert(
      task.role === original?.role,
      `PM-native specialist ownership must remain stable for ${task.id}: ${original?.role} -> ${task.role}`,
    );
  }

  assert(
    JSON.stringify(routeSpecialistAgentTasks(routed)) === JSON.stringify(routed),
    "PM-native specialist plans must remain idempotent through fallback routing",
  );

  console.log("PASS  PM-native specialist Agent ownership survives shared orchestration routing.");
}

run();
