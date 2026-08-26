import { ensureBouquetAuthPlan, validateBouquetAuthPlan } from "./bouquetAuth";
import type { ProjectPlan } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function basePlan(needsAuth: boolean): ProjectPlan {
  return {
    projectName: "Example",
    repositoryName: "example",
    productSummary: "Example product",
    architectureSummary: "Example architecture",
    needsAuth,
    technologyDecisions: [],
    tasks: [
      {
        id: "FE-001",
        title: "Product frontend",
        role: "frontend",
        taskSlug: "product-frontend",
        summary: "Implement product frontend",
        dependsOn: [],
        acceptanceCriteria: ["build passes"],
      },
    ],
  };
}

const noAuth = basePlan(false);
assert(ensureBouquetAuthPlan(noAuth) === noAuth, "needsAuth=false plan must remain unchanged");

const injected = ensureBouquetAuthPlan(basePlan(true));
const server = injected.tasks.find((task) => task.taskSlug.startsWith("bouquet-auth-server"));
const client = injected.tasks.find((task) => task.taskSlug.startsWith("bouquet-auth-client"));
assert(Boolean(server), "needsAuth plan must receive Bouquet backend task");
assert(Boolean(client), "needsAuth plan must receive Bouquet frontend task");
assert(server?.role === "backend", "Bouquet server task must be owned by backend");
assert(client?.role === "frontend", "Bouquet client task must be owned by frontend");
assert(Boolean(server && client?.dependsOn.includes(server.id)), "Bouquet client task must depend on server contract");
assert(
  injected.technologyDecisions.some((decision) =>
    decision.area === "authentication" && decision.choice.includes("꽃다발"),
  ),
  "Bouquet auth decision must be recorded",
);
validateBouquetAuthPlan(injected);

const reinjected = ensureBouquetAuthPlan(injected);
assert(
  reinjected.tasks.filter((task) => task.taskSlug.startsWith("bouquet-auth-server")).length === 1,
  "Bouquet server task injection must be idempotent",
);
assert(
  reinjected.tasks.filter((task) => task.taskSlug.startsWith("bouquet-auth-client")).length === 1,
  "Bouquet client task injection must be idempotent",
);
assert(
  reinjected.technologyDecisions.filter((decision) =>
    decision.area === "authentication" && decision.choice.includes("꽃다발"),
  ).length === 1,
  "Bouquet auth technology decision must be idempotent",
);

const existingServerOnly = basePlan(true);
existingServerOnly.tasks.push({
  id: "AUTH-100",
  title: "Existing auth server",
  role: "backend",
  taskSlug: "bouquet-auth-server",
  summary: "Existing standardized server auth task",
  dependsOn: [],
  acceptanceCriteria: ["server auth works"],
});
const completedPair = ensureBouquetAuthPlan(existingServerOnly);
const existingServer = completedPair.tasks.find((task) => task.id === "AUTH-100");
const injectedClient = completedPair.tasks.find((task) => task.taskSlug.startsWith("bouquet-auth-client"));
assert(Boolean(existingServer && injectedClient?.dependsOn.includes(existingServer.id)), "existing Bouquet server must be reused");

const brokenDependency = ensureBouquetAuthPlan(basePlan(true));
const brokenClient = brokenDependency.tasks.find((task) => task.taskSlug.startsWith("bouquet-auth-client"));
if (!brokenClient) throw new Error("test setup missing Bouquet client task");
const repaired = ensureBouquetAuthPlan({
  ...brokenDependency,
  tasks: brokenDependency.tasks.map((task) =>
    task.id === brokenClient.id ? { ...task, dependsOn: [] } : task,
  ),
});
const repairedServer = repaired.tasks.find((task) => task.taskSlug.startsWith("bouquet-auth-server"));
const repairedClient = repaired.tasks.find((task) => task.taskSlug.startsWith("bouquet-auth-client"));
assert(Boolean(repairedServer && repairedClient?.dependsOn.includes(repairedServer.id)), "Bouquet dependency must be repaired");

let duplicateRejected = false;
try {
  validateBouquetAuthPlan({
    ...injected,
    tasks: [
      ...injected.tasks,
      {
        id: "AUTH-900",
        title: "Duplicate auth server",
        role: "backend",
        taskSlug: "bouquet-auth-server-duplicate",
        summary: "duplicate",
        dependsOn: [],
        acceptanceCriteria: ["duplicate"],
      },
    ],
  });
} catch {
  duplicateRejected = true;
}
assert(duplicateRejected, "duplicate Bouquet server tasks must be rejected");

console.log("bouquetAuth.policy-test: PASS");
