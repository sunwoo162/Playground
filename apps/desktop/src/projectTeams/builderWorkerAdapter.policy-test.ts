import {
  runBuilderWorkerOnce,
  type BuilderWorkerClaim,
  type BuilderWorkerClient,
  type BuilderWorkerExecutionResult,
  type BuilderWorkerRunState,
  type BuilderWorkerTimer,
} from "./builderWorkerAdapter";
import { createBuilderWorkerHttpClient } from "./builderWorkerHttpClient";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const CLAIM: BuilderWorkerClaim = {
  runId: 11,
  projectId: 7,
  workerId: "worker-01",
  status: "running",
  leaseExpiresAt: "2026-08-27T00:02:00",
  claimCount: 1,
  title: "테스트 프로젝트",
  brief: "테스트 웹을 만들어줘",
  platform: "web",
  features: ["auth", "maps"],
  authRequired: true,
  templateId: "community",
  repositoryFullName: null,
  previewUrl: null,
  orchestrationSnapshot: null,
};

function state(status: BuilderWorkerRunState["status"]): BuilderWorkerRunState {
  return {
    runId: CLAIM.runId,
    projectId: CLAIM.projectId,
    workerId: CLAIM.workerId,
    status,
    failureReason: status === "failed" ? "executor failed" : null,
    startedAt: "2026-08-27T00:00:00",
    heartbeatAt: "2026-08-27T00:00:30",
    leaseExpiresAt: status === "running" ? "2026-08-27T00:02:00" : null,
    finishedAt: status === "running" ? null : "2026-08-27T00:01:00",
    claimCount: 1,
  };
}

class FakeTimer implements BuilderWorkerTimer {
  callbacks: Array<() => void> = [];
  cleared = false;

  setInterval(callback: () => void) {
    this.callbacks.push(callback);
    return callback;
  }

  clearInterval() {
    this.cleared = true;
  }

  fire() {
    this.callbacks.forEach((callback) => callback());
  }
}

function fakeClient(overrides: Partial<BuilderWorkerClient> = {}) {
  const calls = {
    claim: 0,
    heartbeat: 0,
    complete: 0,
    fail: 0,
    failureReason: "",
  };
  const client: BuilderWorkerClient = {
    async claim() {
      calls.claim += 1;
      return CLAIM;
    },
    async heartbeat() {
      calls.heartbeat += 1;
      return state("running");
    },
    async loadSnapshot() {
      return CLAIM.orchestrationSnapshot;
    },
    async saveSnapshot(_runId, workerId, snapshot) {
      return {
        ...snapshot,
        version: snapshot.expectedVersion + 1,
        updatedByWorkerId: workerId,
        updatedAt: "2026-08-27T00:00:30",
      };
    },
    async complete() {
      calls.complete += 1;
      return state("completed");
    },
    async fail(_runId, _workerId, reason) {
      calls.fail += 1;
      calls.failureReason = reason;
      return { ...state("failed"), failureReason: reason };
    },
    ...overrides,
  };
  return { client, calls };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function testIdleQueueDoesNotExecute() {
  let executed = false;
  const { client, calls } = fakeClient({
    async claim() {
      calls.claim += 1;
      return null;
    },
  });

  const outcome = await runBuilderWorkerOnce(client, "worker-01", async () => {
    executed = true;
    return { repositoryFullName: null, previewUrl: null };
  });

  assert(outcome.status === "idle", "empty queue must return idle");
  assert(!executed, "executor must not run without a claim");
  assert(calls.complete === 0 && calls.fail === 0, "idle cycle must not report terminal state");
}

async function testSuccessfulExecutionMaintainsLeaseBeforeComplete() {
  const timer = new FakeTimer();
  const { client, calls } = fakeClient();
  const result: BuilderWorkerExecutionResult = {
    repositoryFullName: "BloomBouquet/sample",
    previewUrl: "https://preview.example.com/sample",
  };

  const outcome = await runBuilderWorkerOnce(
    client,
    "worker-01",
    async () => {
      timer.fire();
      await flushMicrotasks();
      return result;
    },
    { heartbeatIntervalMs: 10, timer },
  );

  assert(outcome.status === "completed", "successful executor must complete the claimed run");
  assert(calls.heartbeat >= 2, "cycle must heartbeat during execution and again before terminal update");
  assert(calls.complete === 1 && calls.fail === 0, "successful execution must only report complete");
  assert(timer.cleared, "heartbeat timer must be cleared after execution");
}

async function testExecutionFailureReportsFailAfterLeaseCheck() {
  const { client, calls } = fakeClient();
  const outcome = await runBuilderWorkerOnce(
    client,
    "worker-01",
    async () => {
      throw new Error("Codex runtime failed\nwith details");
    },
    { heartbeatIntervalMs: 10, timer: new FakeTimer() },
  );

  assert(outcome.status === "failed", "executor exception must report failed while lease is valid");
  assert(calls.heartbeat === 1, "failed execution must perform a final lease check");
  assert(calls.fail === 1 && calls.complete === 0, "failed execution must not report complete");
  assert(calls.failureReason === "Codex runtime failed with details", "failure reason must be normalized");
}

async function testHeartbeatLossPreventsStaleTerminalUpdate() {
  const timer = new FakeTimer();
  const { client, calls } = fakeClient({
    async heartbeat() {
      calls.heartbeat += 1;
      throw new Error("409 lease expired");
    },
  });

  const outcome = await runBuilderWorkerOnce(
    client,
    "worker-01",
    async () => {
      timer.fire();
      await flushMicrotasks();
      return { repositoryFullName: null, previewUrl: null };
    },
    { heartbeatIntervalMs: 10, timer },
  );

  assert(outcome.status === "lease-lost", "heartbeat failure must be treated as lost lease");
  assert(calls.complete === 0 && calls.fail === 0, "lost lease must never send stale terminal updates");
}

async function testFinalLeaseCheckPreventsLateCompletion() {
  const { client, calls } = fakeClient({
    async heartbeat() {
      calls.heartbeat += 1;
      throw new Error("lease no longer owned");
    },
  });

  const outcome = await runBuilderWorkerOnce(
    client,
    "worker-01",
    async () => ({ repositoryFullName: null, previewUrl: null }),
    { heartbeatIntervalMs: 10, timer: new FakeTimer() },
  );

  assert(outcome.status === "lease-lost", "terminal transition must require a fresh lease check");
  assert(calls.complete === 0, "late completion must not be reported after lease check fails");
}

async function testHttpClientUsesWorkerHeaderAndHandlesNoContent() {
  const requests: Array<{ input: string; method: string; headers: Record<string, string>; body: string }> = [];
  const token = "0123456789abcdef0123456789abcdef";
  const client = createBuilderWorkerHttpClient({
    baseUrl: "http://localhost:8080/",
    token,
    fetchImpl: async (input, init) => {
      requests.push({ input, method: init.method, headers: init.headers, body: init.body ?? "" });
      return {
        ok: true,
        status: 204,
        async json() { throw new Error("no content"); },
        async text() { return ""; },
      };
    },
  });

  const claim = await client.claim("worker-01");
  assert(claim === null, "204 claim response must map to an idle queue");
  assert(requests.length === 1, "claim must issue exactly one request");
  assert(
    requests[0].input === "http://localhost:8080/internal/builder/worker/runs/claim",
    "claim must target the internal worker endpoint",
  );
  assert(requests[0].method === "POST", "claim must use POST");
  assert(requests[0].headers["X-Builder-Worker-Token"] === token, "worker token must be sent only in its header");
  assert(!requests[0].input.includes(token) && !requests[0].body.includes(token), "worker token must not enter URL or JSON body");
}

async function testHttpClientLoadsAndSavesSnapshot() {
  const requests: Array<{ input: string; method: string; body: string }> = [];
  const token = "0123456789abcdef0123456789abcdef";
  const client = createBuilderWorkerHttpClient({
    baseUrl: "http://localhost:8080",
    token,
    fetchImpl: async (input, init) => {
      requests.push({ input, method: init.method, body: init.body ?? "" });
      const payload = init.method === "PUT"
        ? { schemaVersion: 1, version: 3, phase: "building", payloadJson: "{\"tasks\":[]}", updatedByWorkerId: "worker-01", updatedAt: null }
        : { schemaVersion: 1, version: 2, phase: "planning", payloadJson: "{\"tasks\":[]}", updatedByWorkerId: "worker-old", updatedAt: null };
      return {
        ok: true,
        status: 200,
        async json() { return payload; },
        async text() { return ""; },
      };
    },
  });

  const loaded = await client.loadSnapshot(11, "worker-01");
  assert(loaded?.version === 2, "snapshot GET must return persisted version");
  const saved = await client.saveSnapshot(11, "worker-01", {
    expectedVersion: 2,
    schemaVersion: 1,
    phase: "building",
    payloadJson: "{\"tasks\":[]}",
  });
  assert(saved.version === 3, "snapshot PUT must return incremented version");
  assert(requests[0].method === "GET" && requests[0].body === "", "snapshot load must use bodyless GET");
  assert(requests[0].input.endsWith("/internal/builder/worker/runs/11/snapshot?workerId=worker-01"), "snapshot load endpoint must include workerId");
  assert(requests[1].method === "PUT", "snapshot save must use PUT");
  assert(requests[1].body.includes('"expectedVersion":2'), "snapshot save must send optimistic version");
  assert(!requests[0].input.includes(token) && !requests[1].body.includes(token), "worker token must remain out of URL and snapshot payload");
}

function testHttpClientRejectsUnsafeConfiguration() {
  let insecureRejected = false;
  try {
    createBuilderWorkerHttpClient({
      baseUrl: "http://builder.example.com",
      token: "0123456789abcdef0123456789abcdef",
      fetchImpl: async () => { throw new Error("not called"); },
    });
  } catch {
    insecureRejected = true;
  }
  assert(insecureRejected, "remote cleartext HTTP must be rejected for worker credentials");

  let shortTokenRejected = false;
  try {
    createBuilderWorkerHttpClient({
      baseUrl: "https://builder.example.com",
      token: "short",
      fetchImpl: async () => { throw new Error("not called"); },
    });
  } catch {
    shortTokenRejected = true;
  }
  assert(shortTokenRejected, "short worker tokens must be rejected before network use");
}

async function run() {
  await testIdleQueueDoesNotExecute();
  await testSuccessfulExecutionMaintainsLeaseBeforeComplete();
  await testExecutionFailureReportsFailAfterLeaseCheck();
  await testHeartbeatLossPreventsStaleTerminalUpdate();
  await testFinalLeaseCheckPreventsLateCompletion();
  await testHttpClientUsesWorkerHeaderAndHandlesNoContent();
  await testHttpClientLoadsAndSavesSnapshot();
  testHttpClientRejectsUnsafeConfiguration();
  console.log("builderWorkerAdapter policy tests passed");
}

void run();
