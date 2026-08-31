import {
  automateLunaDelivery,
  type LunaDeliveryAutomationClient,
} from "./lunaDeliveryAutomation";
import {
  LunaDeliveryEvaluationPendingError,
  type LunaDeliveryRegistrationRequest,
} from "./lunaDeliveryHttpClient";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const registration: LunaDeliveryRegistrationRequest = {
  schemaVersion: 1,
  teamId: "lily",
  teamName: "백합",
  projectName: "Sample App",
  projectSlug: "sample-app",
  description: "sample",
  version: "1.0.0+aaaaaaaaaaaa",
  demoUrl: "https://bloombouquet.https.gsmsv.site/apps/sample-app/",
  repositoryUrl: "https://github.com/BloomBouquet/sample-app",
  requiresAuth: false,
};

function projectState(deliveryState: string) {
  return {
    id: 1,
    slug: "sample-app",
    repositoryFullName: "BloomBouquet/sample-app",
    mainSha: SHA,
    manifestDigest: null,
    adoptionState: "DISCOVERED",
    deliveryState,
    publicUrl: "https://bloombouquet.https.gsmsv.site/apps/sample-app/",
    activeReleaseSha: null,
    previousHealthyReleaseSha: null,
    lastLocalHealth: null,
    lastPublicHealth: null,
    bloomTeamId: null,
    bloomProjectId: null,
    bloomSubmissionId: null,
    bloomEvaluationRunId: null,
    lastFailureCode: null,
    lastFailureReason: null,
    retryCount: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
  };
}

function client(order: string[], register: LunaDeliveryAutomationClient["registerSubmission"]): LunaDeliveryAutomationClient {
  return {
    async upsertProject() {
      order.push("registry:upsert");
      return projectState("CODE_COMPLETE");
    },
    async transition(_slug, request) {
      order.push(`state:${request.state}`);
      return projectState(request.state);
    },
    registerSubmission: register,
  };
}

async function run() {
  const order: string[] = [];
  const successClient = client(order, async () => {
    order.push("register");
    return {
      teamId: 1,
      projectId: 2,
      submissionId: 3,
      evaluationRunId: 4,
      evaluationStatus: "QUEUED",
    };
  });

  const result = await automateLunaDelivery({
    slug: "sample-app",
    gitSha: SHA,
    workspacePath: "/tmp/sample-app",
    repositoryFullName: "BloomBouquet/sample-app",
    registration,
    client: successClient,
    dependencies: {
      build: async () => { order.push("build"); return { artifact: "a" }; },
      installCandidate: async () => { order.push("candidate"); return { runtime: "a" }; },
      verifyLocal: async () => { order.push("local-health"); },
      activateGateway: async () => { order.push("gateway"); return { route: "a" }; },
      verifyPublic: async () => { order.push("public-health"); },
      rollbackGateway: async () => { order.push("rollback-gateway"); },
      rollbackCandidate: async () => { order.push("rollback-candidate"); },
    },
  });

  assert(result.registration.evaluationStatus === "QUEUED", "successful automation must return queued evaluation evidence");
  assert(order.join(",") === [
    "registry:upsert",
    "state:MERGED",
    "state:DELIVERY_PLANNING",
    "state:BUILDING",
    "build",
    "candidate",
    "state:CANDIDATE_READY",
    "state:LOCAL_VERIFYING",
    "local-health",
    "state:GATEWAY_SWITCHING",
    "gateway",
    "state:PUBLIC_VERIFYING",
    "public-health",
    "state:DEPLOYED",
    "state:REGISTERING",
    "register",
    "state:BLOOMBOUQUET_REGISTERED",
    "state:EVALUATION_QUEUED",
    "state:COMPLETED",
  ].join(","), "successful automation must drive the exact delivery state machine");

  const failureOrder: string[] = [];
  let healthFailure: unknown = null;
  try {
    await automateLunaDelivery({
      slug: "sample-app",
      gitSha: SHA,
      repositoryFullName: "BloomBouquet/sample-app",
      registration,
      client: client(failureOrder, async () => { throw new Error("must not register"); }),
      dependencies: {
        build: async () => ({}),
        installCandidate: async () => ({}),
        verifyLocal: async () => {},
        activateGateway: async () => ({}),
        verifyPublic: async () => { throw new Error("broken public route"); },
        rollbackGateway: async () => {},
        rollbackCandidate: async () => {},
      },
    });
  } catch (error) {
    healthFailure = error;
  }
  assert(healthFailure instanceof Error, "public health failure must escape automation");
  assert(failureOrder.includes("state:HEALTH_FAILED"), "public health failure must persist HEALTH_FAILED");
  assert(!failureOrder.includes("register"), "failed deployment must never register BloomBouquet submission");

  const pendingOrder: string[] = [];
  let pending: unknown = null;
  try {
    await automateLunaDelivery({
      slug: "sample-app",
      gitSha: SHA,
      repositoryFullName: "BloomBouquet/sample-app",
      registration,
      client: client(pendingOrder, async () => {
        throw new LunaDeliveryEvaluationPendingError("FAILED", 44);
      }),
      dependencies: {
        build: async () => ({}),
        installCandidate: async () => ({}),
        verifyLocal: async () => {},
        activateGateway: async () => ({}),
        verifyPublic: async () => {},
        rollbackGateway: async () => {},
        rollbackCandidate: async () => {},
      },
    });
  } catch (error) {
    pending = error;
  }
  assert(pending instanceof LunaDeliveryEvaluationPendingError, "evaluation pending evidence must remain typed");
  assert(pendingOrder.slice(-2).join(",") === "state:BLOOMBOUQUET_REGISTERED,state:EVALUATION_PENDING", "evaluation evidence failure must distinguish registration success from queue failure");

  console.log("PASS  Luna automated delivery state flow scenarios passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
