import {
  verifyLocalHealth,
  verifyPublicHealth,
  type LunaHealthFetch,
} from "./lunaDeliveryHealth";
import {
  deliverProject,
  LunaDeliveryError,
  type LunaDeliveryControllerDependencies,
} from "./lunaDeliveryController";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  code: string,
  message: string,
) {
  let error: unknown = null;
  try {
    await run();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof LunaDeliveryError, message);
  assert(error.code === code, `${message}: expected ${code}, got ${error.code}`);
  return error;
}

type BuildEvidence = { artifact: string };
type CandidateEvidence = { runtime: string };
type GatewayEvidence = { previous: string };

async function run() {
  const seenHealthUrls: string[] = [];
  const healthyFetch: LunaHealthFetch = async (url) => {
    seenHealthUrls.push(url);
    return { status: 302 };
  };

  const local = await verifyLocalHealth({
    port: 3210,
    healthPath: "/health",
    timeoutMs: 500,
    fetchImpl: healthyFetch,
  });
  assert(local.url === "http://127.0.0.1:3210/health", "local health must target the candidate loopback port");
  assert(local.status === 302, "health verification accepts bounded 2xx/3xx responses");

  const publicHealth = await verifyPublicHealth({
    slug: "sample-app",
    healthPath: "/health",
    timeoutMs: 500,
    fetchImpl: healthyFetch,
  });
  assert(publicHealth.url === "https://bloombouquet.https.gsmsv.site/apps/sample-app/health", "public health must use the canonical BloomBouquet app URL");
  assert(seenHealthUrls.length === 2, "local and public health must each execute one bounded HTTP probe");

  let unhealthyRejected = false;
  try {
    await verifyLocalHealth({
      port: 3210,
      healthPath: "/health",
      fetchImpl: async () => ({ status: 500 }),
    });
  } catch (error) {
    unhealthyRejected = error instanceof Error && /500|health/i.test(error.message);
  }
  assert(unhealthyRejected, "HTTP 4xx/5xx health responses must fail closed");

  const successOrder: string[] = [];
  const successDeps: LunaDeliveryControllerDependencies<BuildEvidence, CandidateEvidence, GatewayEvidence> = {
    build: async () => {
      successOrder.push("build");
      return { artifact: "build-a" };
    },
    installCandidate: async () => {
      successOrder.push("candidate");
      return { runtime: "candidate-a" };
    },
    verifyLocal: async () => {
      successOrder.push("local-health");
    },
    activateGateway: async () => {
      successOrder.push("gateway-switch");
      return { previous: "healthy-a" };
    },
    verifyPublic: async () => {
      successOrder.push("public-health");
    },
    rollbackGateway: async () => {
      successOrder.push("rollback-gateway");
    },
    rollbackCandidate: async () => {
      successOrder.push("rollback-candidate");
    },
  };

  const delivered = await deliverProject({
    slug: "sample-app",
    gitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    dependencies: successDeps,
  });
  assert(successOrder.join(",") === "build,candidate,local-health,gateway-switch,public-health", "successful delivery must never switch the gateway before candidate health succeeds");
  assert(delivered.publicUrl === "https://bloombouquet.https.gsmsv.site/apps/sample-app/", "successful delivery returns the canonical public URL");
  assert(delivered.releaseSha === "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "successful delivery preserves the exact release SHA");
  assert(delivered.rollbackResult.gateway === "not-needed" && delivered.rollbackResult.candidate === "not-needed", "successful delivery must report that rollback was not needed");

  const localFailureOrder: string[] = [];
  const localFailureDeps: LunaDeliveryControllerDependencies<BuildEvidence, CandidateEvidence, GatewayEvidence> = {
    build: async () => {
      localFailureOrder.push("build");
      return { artifact: "build-b" };
    },
    installCandidate: async () => {
      localFailureOrder.push("candidate");
      return { runtime: "candidate-b" };
    },
    verifyLocal: async () => {
      localFailureOrder.push("local-health");
      throw new Error("candidate unhealthy");
    },
    activateGateway: async () => {
      localFailureOrder.push("gateway-switch");
      return { previous: "healthy-a" };
    },
    verifyPublic: async () => {
      localFailureOrder.push("public-health");
    },
    rollbackGateway: async () => {
      localFailureOrder.push("rollback-gateway");
    },
    rollbackCandidate: async () => {
      localFailureOrder.push("rollback-candidate");
    },
  };

  const localFailure = await assertRejectsCode(
    () => deliverProject({
      slug: "sample-app",
      gitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      dependencies: localFailureDeps,
    }),
    "HEALTH_FAILED",
    "local health failure must be typed as HEALTH_FAILED",
  );
  assert(!localFailureOrder.includes("gateway-switch"), "local health failure must leave the existing public gateway untouched");
  assert(localFailureOrder.join(",") === "build,candidate,local-health,rollback-candidate", "local health failure must clean up only the candidate runtime");
  assert(localFailure.rollbackResult.gateway === "not-needed" && localFailure.rollbackResult.candidate === "restored", "local failure rollback evidence must distinguish untouched gateway from candidate cleanup");

  const publicFailureOrder: string[] = [];
  const publicFailureDeps: LunaDeliveryControllerDependencies<BuildEvidence, CandidateEvidence, GatewayEvidence> = {
    build: async () => {
      publicFailureOrder.push("build");
      return { artifact: "build-c" };
    },
    installCandidate: async () => {
      publicFailureOrder.push("candidate");
      return { runtime: "candidate-c" };
    },
    verifyLocal: async () => {
      publicFailureOrder.push("local-health");
    },
    activateGateway: async () => {
      publicFailureOrder.push("gateway-switch");
      return { previous: "healthy-a" };
    },
    verifyPublic: async () => {
      publicFailureOrder.push("public-health");
      throw new Error("public route unhealthy");
    },
    rollbackGateway: async () => {
      publicFailureOrder.push("rollback-gateway");
    },
    rollbackCandidate: async () => {
      publicFailureOrder.push("rollback-candidate");
    },
  };

  const publicFailure = await assertRejectsCode(
    () => deliverProject({
      slug: "sample-app",
      gitSha: "cccccccccccccccccccccccccccccccccccccccc",
      dependencies: publicFailureDeps,
    }),
    "HEALTH_FAILED",
    "public health failure must be typed as HEALTH_FAILED",
  );
  assert(publicFailureOrder.join(",") === "build,candidate,local-health,gateway-switch,public-health,rollback-gateway,rollback-candidate", "public health failure must restore gateway before stopping/restoring the candidate");
  assert(publicFailure.rollbackResult.gateway === "restored" && publicFailure.rollbackResult.candidate === "restored", "public failure must expose both rollback outcomes");

  const blockedDeps: LunaDeliveryControllerDependencies<BuildEvidence, CandidateEvidence, GatewayEvidence> = {
    ...successDeps,
    build: async () => {
      throw new LunaDeliveryError("BLOCKED_MISSING_SECRET", "build", "DATABASE_URL is not configured");
    },
  };
  const blocked = await assertRejectsCode(
    () => deliverProject({
      slug: "sample-app",
      gitSha: "dddddddddddddddddddddddddddddddddddddddd",
      dependencies: blockedDeps,
    }),
    "BLOCKED_MISSING_SECRET",
    "typed blocked-secret errors must not be flattened into BUILD_FAILED",
  );
  assert(blocked.stage === "build", "typed delivery errors preserve their originating stage");

  console.log("PASS  Luna delivery health and rollback orchestration scenarios passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
