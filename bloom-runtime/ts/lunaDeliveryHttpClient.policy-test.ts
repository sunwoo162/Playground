import {
  createLunaDeliveryHttpClient,
  LunaDeliveryEvaluationPendingError,
  LunaDeliveryHttpError,
  type LunaDeliveryFetch,
} from "./lunaDeliveryHttpClient";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => unknown, pattern: RegExp, message: string) {
  let error: unknown = null;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof Error, message);
  assert(pattern.test(error.message), `${message}: ${error.message}`);
}

const TOKEN = "luna-delivery-http-client-token-0123456789abcdef";

assertThrows(
  () => createLunaDeliveryHttpClient({ baseUrl: "http://example.com", token: TOKEN }),
  /https|loopback/i,
  "non-loopback HTTP must be rejected",
);
assertThrows(
  () => createLunaDeliveryHttpClient({ baseUrl: "https://example.com/?token=nope", token: TOKEN }),
  /query|hash|credential/i,
  "base URL query data must be rejected",
);
assertThrows(
  () => createLunaDeliveryHttpClient({ baseUrl: "https://example.com", token: "short" }),
  /32/,
  "delivery token shorter than 32 characters must be rejected",
);

type Call = {
  input: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

const calls: Call[] = [];
const fetchImpl: LunaDeliveryFetch = async (input, init) => {
  calls.push({ input, method: init.method, headers: { ...init.headers }, body: init.body });
  return {
    ok: true,
    status: input.endsWith("/internal/luna/delivery/register") ? 201 : 200,
    async json() {
      if (input.endsWith("/internal/luna/delivery/register")) {
        return {
          teamId: 10,
          projectId: 20,
          submissionId: 30,
          evaluationRunId: 40,
          evaluationStatus: "QUEUED",
        };
      }
      return input.endsWith("/sample-app") && init.method === "GET"
        ? { project: { slug: "sample-app", deliveryState: "MERGED" }, runtimes: [] }
        : { slug: "sample-app", deliveryState: "CODE_COMPLETE", runtimeId: "web" };
    },
    async text() { return ""; },
  };
};

async function run() {
  const client = createLunaDeliveryHttpClient({
    baseUrl: "http://127.0.0.1:8080/",
    token: TOKEN,
    fetchImpl,
  });

  await client.upsertProject("sample-app", {
    slug: "sample-app",
    repositoryFullName: "BloomBouquet/sample-app",
    mainSha: "0123456789abcdef0123456789abcdef01234567",
    publicUrl: "https://bloombouquet.https.gsmsv.site/apps/sample-app/",
  });
  await client.getProject("sample-app");
  await client.transition("sample-app", {
    state: "MERGED",
    localHealth: "not-run",
    publicHealth: "not-run",
  });
  await client.upsertRuntime("sample-app", "web", {
    runtimeType: "server",
    slotAPort: 3200,
    slotBPort: 3201,
    activeSlot: "A",
    candidateSlot: "B",
  });
  const registration = await client.registerSubmission({
    schemaVersion: 1,
    teamId: "lily",
    teamName: "백합",
    projectName: "Sample App",
    projectSlug: "sample-app",
    description: "Luna automatic delivery test project",
    version: "1.2.3+0123456789ab",
    demoUrl: "https://bloombouquet.https.gsmsv.site/apps/sample-app/",
    repositoryUrl: "https://github.com/BloomBouquet/sample-app",
    requiresAuth: false,
    authRedirectUri: null,
  });

  assert(calls.length === 5, "Registry operations plus machine registration must issue one HTTP request each");
  assert(calls[0]?.method === "PUT", "project upsert uses PUT");
  assert(calls[0]?.input === "http://127.0.0.1:8080/internal/luna/delivery/projects/sample-app", "project upsert uses exact endpoint");
  assert(calls[1]?.method === "GET", "project detail uses GET");
  assert(calls[1]?.input === "http://127.0.0.1:8080/internal/luna/delivery/projects/sample-app", "project detail uses exact endpoint");
  assert(calls[2]?.method === "POST", "state transition uses POST");
  assert(calls[2]?.input === "http://127.0.0.1:8080/internal/luna/delivery/projects/sample-app/transition", "transition uses exact endpoint");
  assert(calls[3]?.method === "PUT", "runtime upsert uses PUT");
  assert(calls[3]?.input === "http://127.0.0.1:8080/internal/luna/delivery/projects/sample-app/runtimes/web", "runtime upsert uses exact endpoint");
  assert(calls[4]?.method === "POST", "machine registration uses POST");
  assert(calls[4]?.input === "http://127.0.0.1:8080/internal/luna/delivery/register", "machine registration uses exact internal endpoint");

  for (const call of calls) {
    assert(call.headers["X-Luna-Delivery-Token"] === TOKEN, "every request uses dedicated Luna delivery token header");
    assert(call.headers["X-Builder-Worker-Token"] === undefined, "delivery client must never reuse Builder worker token header");
  }
  assert(calls[0]?.headers["Content-Type"] === "application/json", "JSON writes set content type");
  assert(calls[1]?.headers["Content-Type"] === undefined, "GET request does not add a JSON content type");
  assert(JSON.parse(calls[0]?.body ?? "{}").repositoryFullName === "BloomBouquet/sample-app", "project body is serialized as JSON");
  assert(JSON.parse(calls[2]?.body ?? "{}").state === "MERGED", "transition body is serialized as JSON");
  assert(JSON.parse(calls[3]?.body ?? "{}").slotAPort === 3200, "runtime body is serialized as JSON");
  assert(JSON.parse(calls[4]?.body ?? "{}").version === "1.2.3+0123456789ab", "registration body preserves deterministic release version");
  assert(registration.evaluationRunId === 40, "machine registration returns evaluation run evidence");
  assert(registration.evaluationStatus === "QUEUED", "QUEUED evaluation is valid completion-link evidence");

  const pendingClient = createLunaDeliveryHttpClient({
    baseUrl: "https://example.invalid",
    token: TOKEN,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          teamId: 1,
          projectId: 2,
          submissionId: 3,
          evaluationRunId: 4,
          evaluationStatus: "FAILED",
        };
      },
      async text() { return ""; },
    }),
  });
  let pending: unknown = null;
  try {
    await pendingClient.registerSubmission({
      schemaVersion: 1,
      teamId: "lily",
      teamName: "백합",
      projectName: "Sample App",
      projectSlug: "sample-app",
      description: "test",
      version: "git-0123456789ab",
      demoUrl: "https://bloombouquet.https.gsmsv.site/apps/sample-app/",
      repositoryUrl: "https://github.com/BloomBouquet/sample-app",
      requiresAuth: false,
      authRedirectUri: null,
    });
  } catch (error) {
    pending = error;
  }
  assert(pending instanceof LunaDeliveryEvaluationPendingError, "FAILED evaluation state must block completion with a typed pending error");
  assert(pending.code === "EVALUATION_PENDING", "invalid evaluation state maps to EVALUATION_PENDING");
  assert(pending.evaluationStatus === "FAILED", "pending error preserves rejected evaluation state");

  const missingRunClient = createLunaDeliveryHttpClient({
    baseUrl: "https://example.invalid",
    token: TOKEN,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          teamId: 1,
          projectId: 2,
          submissionId: 3,
          evaluationRunId: null,
          evaluationStatus: "QUEUED",
        };
      },
      async text() { return ""; },
    }),
  });
  let missingRun: unknown = null;
  try {
    await missingRunClient.registerSubmission({
      schemaVersion: 1,
      teamId: "lily",
      teamName: "백합",
      projectName: "Sample App",
      projectSlug: "sample-app",
      description: "test",
      version: "git-0123456789ab",
      demoUrl: "https://bloombouquet.https.gsmsv.site/apps/sample-app/",
      repositoryUrl: "https://github.com/BloomBouquet/sample-app",
      requiresAuth: false,
      authRedirectUri: null,
    });
  } catch (error) {
    missingRun = error;
  }
  assert(missingRun instanceof LunaDeliveryEvaluationPendingError, "evaluation status without a run ID must not satisfy completion evidence");

  const failingClient = createLunaDeliveryHttpClient({
    baseUrl: "https://example.invalid",
    token: TOKEN,
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      async json() { return {}; },
      async text() { return "temporary registry failure"; },
    }),
  });
  let failure: unknown = null;
  try {
    await failingClient.getProject("sample-app");
  } catch (error) {
    failure = error;
  }
  assert(failure instanceof LunaDeliveryHttpError, "non-2xx response must throw dedicated LunaDeliveryHttpError");
  assert(failure.status === 503, "typed delivery HTTP error retains status");

  console.log("PASS  Luna delivery Registry HTTP client scenarios passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
