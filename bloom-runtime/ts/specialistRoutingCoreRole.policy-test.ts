import { routeSpecialistAgentTasks } from "./specialistRouting";
import type { ProjectPlan } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const plan: ProjectPlan = {
  projectName: "Core role ownership",
  repositoryName: "core-role-ownership",
  productSummary: "Keep general API implementation with Backend while Database owns persistence.",
  architectureSummary: "Backend consumes a separate SQLite persistence task through a dependency boundary.",
  needsAuth: false,
  technologyDecisions: [],
  tasks: [
    {
      id: "T-DB",
      title: "Implement SQLite persistence and migrations",
      role: "database",
      taskSlug: "sqlite-persistence",
      summary: "Own SQLite schema, migrations, queries, and persistence behavior.",
      dependsOn: [],
      acceptanceCriteria: ["SQLite persistence and migrations are verified."],
    },
    {
      id: "T-BE",
      title: "Implement feedback API and production server",
      role: "backend",
      taskSlug: "feedback-api-server",
      summary: "Implement the application API server and consume the SQLite persistence layer from T-DB.",
      dependsOn: ["T-DB"],
      acceptanceCriteria: [
        "HTTP validation and status-transition business rules are implemented server-side.",
        "Database failures from the SQLite persistence dependency are mapped to safe API responses.",
      ],
    },
  ],
};

const routed = routeSpecialistAgentTasks(plan);
const roleByTask = new Map(routed.tasks.map((task) => [task.id, task.role]));

assert(roleByTask.get("T-DB") === "database", "explicit Database ownership must remain Database");
assert(
  roleByTask.get("T-BE") === "backend",
  "a general API/server task must remain Backend when specialist terms are only incidental dependency details",
);

console.log("PASS  Specialist routing preserves explicit Backend API/server ownership.");
