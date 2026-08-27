import { BOUQUET_AUTH_STANDARD, ensureBouquetAuthPlan, validateBouquetAuthPlan } from "./bouquetAuth";
import { ensureMarketingDocumentationPlan } from "./dataMarketing";
import { validateProjectPlanReviewTopology } from "./planTopology";
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
assert(
  injected.technologyDecisions.some((decision) => decision.choice.includes("PKCE S256")),
  "Bouquet auth decision must require Authorization Code + PKCE S256",
);
assert(
  Boolean(server?.acceptanceCriteria.some((criterion) => criterion.includes("자체 꽃다발 회원가입/비밀번호 저장소"))),
  "generated projects must not implement a separate Bouquet credential store",
);
assert(
  Boolean(server?.acceptanceCriteria.some((criterion) => criterion.includes("authorization code 교환") && criterion.includes("Backend/BFF"))),
  "authorization code exchange must remain server-side",
);
assert(
  Boolean(client?.acceptanceCriteria.some((criterion) => criterion.includes("credential form은 만들지 않고") || criterion.includes("이메일/비밀번호를 직접 받지 않고"))),
  "generated frontend must redirect to the central Bouquet auth portal instead of collecting credentials",
);
assert(
  BOUQUET_AUTH_STANDARD.routeContract.callback === "/auth/bouquet/callback",
  "Bouquet project callback route must remain stable",
);
validateBouquetAuthPlan(injected);

const governed = ensureMarketingDocumentationPlan(injected);
validateProjectPlanReviewTopology(governed);
const marketingTask = governed.tasks.find((task) => task.role === "data-marketing");
assert(Boolean(marketingTask), "governed auth plan must include Data & Marketing quality gate");
assert(
  Boolean(client && marketingTask?.dependsOn.includes(client.id)),
  "marketing/documentation quality chain must wait for Bouquet client auth implementation",
);

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
assert(
  Boolean(existingServer?.acceptanceCriteria.includes("server auth works")),
  "existing project-specific auth criteria must be preserved",
);
assert(
  Boolean(existingServer?.acceptanceCriteria.some((criterion) => criterion.includes("HttpOnly/Secure"))),
  "existing Bouquet server task must receive mandatory cookie/session criteria",
);
assert(
  Boolean(existingServer?.acceptanceCriteria.some((criterion) => criterion.includes("returnTo/redirect"))),
  "existing Bouquet server task must receive mandatory redirect validation criteria",
);
validateBouquetAuthPlan(completedPair);

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

let strippedCriteriaRejected = false;
try {
  validateBouquetAuthPlan({
    ...injected,
    tasks: injected.tasks.map((task) =>
      task.taskSlug.startsWith("bouquet-auth-server")
        ? { ...task, acceptanceCriteria: ["server auth works"] }
        : task,
    ),
  });
} catch {
  strippedCriteriaRejected = true;
}
assert(strippedCriteriaRejected, "Bouquet tasks without mandatory security criteria must be rejected");

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
