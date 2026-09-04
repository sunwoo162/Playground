import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { requestLocalModel, runLocalAgent, runLocalStructuredInference, validateRelativePath } from "./bloomLocalAgentRuntime";

const encoder = new TextEncoder();

function streamingResponse(chunks: string[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function successResponse(): Response {
  return streamingResponse([
    'data: {"choices":[{"delta":{"content":"{\\"ok\\":"}}]}\n',
    '\ndata: {"choices":[{"delta":{"content":"true}"}}]}\n\n',
    'data: [DONE]\n\n',
  ]);
}

async function testStreamsLongModelResponses() {
  let body: Record<string, unknown> | null = null;
  let signal: AbortSignal | null = null;
  const fetchImpl: typeof fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    signal = init?.signal instanceof AbortSignal ? init.signal : null;
    return successResponse();
  };

  const result = await requestLocalModel({
    endpoint: "http://127.0.0.1:8091/v1/chat/completions",
    model: "qwen2.5-coder-1.5b-instruct",
    messages: [{ role: "user", content: "return json" }],
    fetchImpl,
    timeoutMs: 1_000,
    maxRetries: 0,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal((body as Record<string, unknown> | null)?.stream, true, "Local Agent inference must stream tokens so long generations do not wait for one final HTTP response");
  assert.ok(signal, "Local Agent inference must bound every model request with an AbortSignal");
}

async function testRetriesOneTransientFetchFailure() {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("fetch failed");
    return successResponse();
  };

  const result = await requestLocalModel({
    endpoint: "http://127.0.0.1:8091/v1/chat/completions",
    model: "qwen2.5-coder-1.5b-instruct",
    messages: [{ role: "user", content: "return json" }],
    fetchImpl,
    timeoutMs: 1_000,
    maxRetries: 1,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2, "a transient local fetch failure should retry once instead of failing the whole Builder run");
}

function truncatedLengthResponse(): Response {
  return streamingResponse([
    'data: {"choices":[{"delta":{"content":"{\\"ok\\":"},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
    'data: [DONE]\n\n',
  ]);
}

async function testRetriesTruncatedJsonConcise() {
  const bodies: Array<Record<string, unknown>> = [];
  let calls = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    calls += 1;
    bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return calls === 1 ? truncatedLengthResponse() : successResponse();
  };

  const result = await requestLocalModel({
    endpoint: "http://127.0.0.1:8091/v1/chat/completions",
    model: "qwen2.5-coder-1.5b-instruct",
    messages: [{ role: "user", content: "return json" }],
    fetchImpl,
    timeoutMs: 1_000,
    maxRetries: 1,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2, "a token-limit truncated JSON response should retry once");
  const retryMessages = bodies[1]?.messages as Array<{ role?: string; content?: string }> | undefined;
  assert.match(retryMessages?.[retryMessages.length - 1]?.content ?? "", /concise|token limit|valid JSON/i,
    "the retry must explicitly ask for a shorter complete JSON object");
}

async function testStructuredInferenceUsesServerSchema() {
  let body: Record<string, unknown> | null = null;
  const outputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["requiredField"],
    properties: { requiredField: { type: "string", pattern: "^forced$" } },
  };
  const fetchImpl: typeof fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return streamingResponse([
      'data: {"choices":[{"delta":{"content":"{\\"requiredField\\":\\"forced\\"}"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
  };

  const result = await runLocalStructuredInference({
    mode: "structured",
    title: "schema-probe",
    prompt: "return structured output",
    outputSchema,
  }, { fetchImpl });

  assert.deepEqual(result.output, { requiredField: "forced" });
  assert.deepEqual(
    (body as Record<string, unknown> | null)?.response_format,
    { type: "json_object", schema: outputSchema },
    "structured inference must pass its JSON schema to llama.cpp response_format so required fields and patterns are grammar-constrained",
  );
}

async function testLocalAgentBoundsToolHistoryBeforeModelCalls() {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "bloom-local-agent-context-"));
  const largeContent = "x".repeat(128 * 1024);
  const bodies: Array<Record<string, unknown>> = [];
  let calls = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    calls += 1;
    if (calls <= 4) {
      return streamingResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: '{"action":"read","path":"large.txt"}' } }] })}\n\n`,
        "data: [DONE]\n\n",
      ]);
    }
    return streamingResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: '{"action":"final","report":{"status":"completed","summary":"done","rationaleSummary":"done","evidence":[],"verification":[],"commitSha":null,"pullRequestNumber":null,"pullRequestUrl":null,"reviewedPullRequests":[],"blockers":[]}}' } }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  };

  try {
    await fs.writeFile(path.join(worktree, "large.txt"), largeContent, "utf8");
    await runLocalAgent({
      projectId: "policy",
      taskId: "BLOOM-CONTEXT",
      worktree,
      prompt: "inspect the large file repeatedly, then finish",
    }, { fetchImpl, maxSteps: 5 });

    assert.equal(bodies.length, 5);
    const requestSizes = bodies.map((body) => Buffer.byteLength(JSON.stringify(body.messages ?? []), "utf8"));
    assert.ok(Math.max(...requestSizes) < 32 * 1024,
      `normal Local Agent requests must keep rolling tool history below 32KB; got ${requestSizes.join(", ")}`);
    const finalMessages = bodies[bodies.length - 1]?.messages as Array<{ content?: string }> | undefined;
    assert.match(finalMessages?.map((message) => message.content ?? "").join("\n") ?? "", /truncated|omitted|history/i,
      "bounded Agent context must make omitted tool output explicit instead of silently dropping it");
  } finally {
    await fs.rm(worktree, { recursive: true, force: true });
  }
}

async function testLocalAgentUsesServerActionSchema() {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "bloom-local-agent-schema-"));
  let body: Record<string, unknown> | null = null;
  const fetchImpl: typeof fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return streamingResponse([
      'data: {"choices":[{"delta":{"content":"{\\"action\\":\\"final\\",\\"report\\":{\\"status\\":\\"completed\\",\\"summary\\":\\"done\\",\\"rationaleSummary\\":\\"done\\",\\"evidence\\":[],\\"verification\\":[],\\"commitSha\\":null,\\"pullRequestNumber\\":null,\\"pullRequestUrl\\":null,\\"reviewedPullRequests\\":[],\\"blockers\\":[]}}"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
  };

  try {
    const result = await runLocalAgent({
      projectId: "policy",
      taskId: "BLOOM-001",
      worktree,
      prompt: "finish",
    }, { fetchImpl, maxSteps: 1 });

    assert.equal(result.report.status, "completed");
    const responseFormat = (body as Record<string, unknown> | null)?.response_format as Record<string, unknown> | undefined;
    assert.equal(responseFormat?.type, "json_object");
    const schema = responseFormat?.schema as Record<string, unknown> | undefined;
    assert.ok(schema, "normal Local Agent turns must pass an action JSON schema to llama.cpp instead of relying on unconstrained json_object output");
    const properties = schema.properties as Record<string, unknown> | undefined;
    const action = properties?.action as Record<string, unknown> | undefined;
    assert.deepEqual(action?.enum, ["list", "read", "write", "delete", "run", "final"],
      "the Agent action schema must constrain the protocol to the six supported actions");
    const command = properties?.command as Record<string, unknown> | undefined;
    assert.deepEqual(command?.enum, ["pnpm", "npm", "yarn", "bun", "cargo", "git", "node", "./gradlew", "gradlew", "gradlew.bat", "./mvnw", "mvnw", "mvnw.cmd"],
      "the run command schema must constrain command to real allowed executables");
  } finally {
    await fs.rm(worktree, { recursive: true, force: true });
  }
}

async function testLocalAgentRejectsImmediateDuplicateSuccessfulWrite() {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "bloom-local-agent-duplicate-write-"));
  const bodies: Array<Record<string, unknown>> = [];
  let calls = 0;
  const duplicateWrite = '{"action":"write","path":"frontend/src/main.tsx","content":"export default function App(){ return null; }"}';
  const fetchImpl: typeof fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    calls += 1;
    const content = calls <= 2
      ? duplicateWrite
      : '{"action":"final","report":{"status":"completed","summary":"done","rationaleSummary":"done","evidence":[],"verification":[],"commitSha":null,"pullRequestNumber":null,"pullRequestUrl":null,"reviewedPullRequests":[],"blockers":[]}}';
    return streamingResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  };

  try {
    await runLocalAgent({
      projectId: "policy",
      taskId: "GREENFIELD-DUPLICATE",
      worktree,
      prompt: "implement a real frontend in this empty repository",
    }, { fetchImpl, maxSteps: 3 });

    const thirdRequestMessages = bodies[2]?.messages as Array<{ role?: string; content?: string }> | undefined;
    const transcript = thirdRequestMessages?.map((message) => message.content ?? "").join("\n") ?? "";
    assert.match(transcript, /already succeeded|no new progress|different action/i,
      "an immediately repeated successful write must be rejected as no progress so the model is forced to choose a different action");
  } finally {
    await fs.rm(worktree, { recursive: true, force: true });
  }
}

async function testLocalAgentFailsFastOnRepeatedSuccessfulWriteLoop() {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "bloom-local-agent-stalled-write-"));
  let calls = 0;
  const duplicateWrite = '{"action":"write","path":"frontend/src/main.tsx","content":"export default function App(){ return null; }"}';
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return streamingResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: duplicateWrite } }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  };

  try {
    await assert.rejects(
      runLocalAgent({
        projectId: "policy",
        taskId: "GREENFIELD-STALLED",
        worktree,
        prompt: "implement a real frontend in this empty repository",
      }, { fetchImpl, maxSteps: 64 }),
      /stalled.*identical.*write|repeated.*write.*progress/i,
      "a model that ignores duplicate-write correction must fail fast instead of consuming the full 64-step budget",
    );
    assert.ok(calls <= 4, `duplicate-write stall detection must stop within four model turns; got ${calls}`);
  } finally {
    await fs.rm(worktree, { recursive: true, force: true });
  }
}

async function testLocalAgentFailsFastOnRepeatedRejectedWriteLoop() {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "bloom-local-agent-rejected-write-loop-"));
  let calls = 0;
  const invalidWrite = '{"action":"write","path":"frontend/src","content":"# copied task spec"}';
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return streamingResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: invalidWrite } }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  };

  try {
    await assert.rejects(
      runLocalAgent({
        projectId: "policy",
        taskId: "GREENFIELD-REJECTED-WRITE-LOOP",
        worktree,
        prompt: "implement a real frontend in this empty repository",
      }, { fetchImpl, maxSteps: 8 }),
      /stalled.*(?:identical write|failed write path)|repeated.*write.*progress/i,
      "a model that repeats the same rejected write must fail fast instead of exhausting the safety budget",
    );
    assert.ok(calls <= 4, `rejected duplicate-write stall detection must stop within four model turns; got ${calls}`);
  } finally {
    await fs.rm(worktree, { recursive: true, force: true });
  }
}

async function testLocalAgentFailsFastWhenRejectedWriteChangesOnlyContent() {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "bloom-local-agent-rejected-write-path-loop-"));
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    const content = JSON.stringify({
      action: "write",
      path: "frontend/src",
      content: `# copied task spec attempt ${calls}`,
    });
    return streamingResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  };

  try {
    await assert.rejects(
      runLocalAgent({
        projectId: "policy",
        taskId: "GREENFIELD-REJECTED-WRITE-PATH-LOOP",
        worktree,
        prompt: "implement a real frontend in this empty repository",
      }, { fetchImpl, maxSteps: 8 }),
      /stalled.*write.*path|repeated.*failed.*path|no progress/i,
      "changing content must not bypass stall detection when the same write path is deterministically rejected",
    );
    assert.ok(calls <= 4, `rejected write-path stall detection must stop within four model turns; got ${calls}`);
  } finally {
    await fs.rm(worktree, { recursive: true, force: true });
  }
}

async function testLocalAgentTreatsMissingGreenfieldPathsAsCreatable() {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "bloom-local-agent-greenfield-"));
  let body: Record<string, unknown> | null = null;
  const fetchImpl: typeof fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return streamingResponse([
      'data: {"choices":[{"delta":{"content":"{\\"action\\":\\"final\\",\\"report\\":{\\"status\\":\\"completed\\",\\"summary\\":\\"done\\",\\"rationaleSummary\\":\\"done\\",\\"evidence\\":[],\\"verification\\":[],\\"commitSha\\":null,\\"pullRequestNumber\\":null,\\"pullRequestUrl\\":null,\\"reviewedPullRequests\\":[],\\"blockers\\":[]}}"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
  };

  try {
    await runLocalAgent({
      projectId: "policy",
      taskId: "GREENFIELD-001",
      worktree,
      prompt: "create the frontend in this new repository",
    }, { fetchImpl, maxSteps: 1 });

    const messages = (body as Record<string, unknown> | null)?.messages as Array<{ role?: string; content?: string }> | undefined;
    const system = messages?.find((message) => message.role === "system")?.content ?? "";
    assert.match(system, /greenfield|empty repository/i,
      "Local Agent must explicitly recognize that a new project repository can start empty");
    assert.match(system, /missing.*(directory|file).*not.*block|create.*write/i,
      "missing task-owned application paths must be described as creatable work, not a blocker");
    assert.match(system, /write action.*regular file/i,
      "Local Agent must know that write creates a regular file, not a directory");
    assert.match(system, /parent director(?:y|ies).*automatic/i,
      "Local Agent must know parent directories are created automatically by write");
    assert.match(system, /never.*write.*directory path|never.*directory path.*write/i,
      "Local Agent must not use write with directory paths such as frontend/src");
    assert.match(system, /readme|documentation/i,
      "implementation guidance must distinguish product source work from README-style documentation");
    assert.doesNotMatch(system, /relative\/(?:path|file)|full file content|pnpm\|npm\|yarn\|bun/i,
      "Local Agent tool examples must not expose abstract placeholder values that a small model can copy as real actions");
    assert.doesNotMatch(system, /\{\"action\":\"(?:list|read|write|delete|run)\"/,
      "Local Agent prompt must not expose copyable JSON action examples to the small model");
    assert.match(system, /start.*(?:inspect|list).*worktree.*root|first.*action.*list.*root/i,
      "Local Agent must begin by inspecting the worktree root before guessing task paths");
    assert.match(system, /list.*path.*[\"']\.['\"]|path.*[\"']\.['\"].*list/i,
      "Local Agent root-inspection guidance must name the safe dot path explicitly");
    assert.match(system, /command.*exactly one.*allowed|never.*(?:alternatives|pipe).*command/i,
      "Local Agent run guidance must prohibit copying an alternatives expression into command");
  } finally {
    await fs.rm(worktree, { recursive: true, force: true });
  }
}

async function testLocalAgentRejectsLiteralProtocolPlaceholders() {
  assert.throws(() => validateRelativePath("relative/path"), /placeholder|actual.*path/i,
    "runtime must reject the literal path placeholder emitted in production run #56");
  assert.throws(() => validateRelativePath("relative/file"), /placeholder|actual.*path/i,
    "runtime must reject the literal file placeholder from the legacy protocol contract");
}

async function testFailedLocalAgentPersistsActionJournal() {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "bloom-local-agent-journal-"));
  const eventsPath = path.join(worktree, "local-agent-events.jsonl");
  const invalidWrite = '{"action":"write","path":"frontend/src","content":"# copied task spec"}';
  const fetchImpl: typeof fetch = async () => streamingResponse([`data: ${JSON.stringify({ choices: [{ delta: { content: invalidWrite } }] })}\n\n`, "data: [DONE]\n\n"]);
  try {
    await assert.rejects(runLocalAgent({ projectId: "policy", taskId: "GREENFIELD-JOURNAL", worktree, prompt: "implement a frontend", eventsPath } as Parameters<typeof runLocalAgent>[0] & { eventsPath: string }, { fetchImpl, maxSteps: 8 }), /stalled/i);
    const journal = await fs.readFile(eventsPath, "utf8");
    assert.match(journal, /"action":"write"/, "failed runs must preserve the attempted action");
    assert.match(journal, /"path":"frontend\/src"/, "journal must preserve the sanitized write path");
    assert.match(journal, /"ok":false/, "journal must preserve the first failed tool result");
    assert.match(journal, /directory|regular file|file path/i, "journal must preserve the corrective tool error");
    assert.doesNotMatch(journal, /copied task spec/, "journal must not persist write contents");
  } finally { await fs.rm(worktree, { recursive: true, force: true }); }
}

async function testLocalAgentRejectsDirectoryLikeWriteTargetsAndRecovers() {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "bloom-local-agent-write-target-"));
  const bodies: Array<Record<string, unknown>> = [];
  let call = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    call += 1;
    const content = call === 1
      ? '{"action":"write","path":"frontend/src","content":"# copied task spec"}'
      : call === 2
        ? '{"action":"write","path":"frontend/src/main.tsx","content":"export default function App(){ return null; }"}'
        : '{"action":"final","report":{"status":"completed","summary":"done","rationaleSummary":"done","evidence":[],"verification":[],"commitSha":null,"pullRequestNumber":null,"pullRequestUrl":null,"reviewedPullRequests":[],"blockers":[]}}';
    return streamingResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
      'data: [DONE]\n\n',
    ]);
  };

  try {
    await runLocalAgent({ projectId: "policy", taskId: "GREENFIELD-WRITE-001", worktree, prompt: "implement a React frontend" }, { fetchImpl, maxSteps: 3 });
    const src = path.join(worktree, "frontend", "src");
    const stat = await fs.stat(src);
    assert.ok(stat.isDirectory(), "directory-like write target must not become a regular file");
    assert.equal(await fs.readFile(path.join(src, "main.tsx"), "utf8"), "export default function App(){ return null; }");
    const secondMessages = bodies[1]?.messages as Array<{ content?: string }> | undefined;
    const secondContext = secondMessages?.map((message) => message.content ?? "").join("\n") ?? "";
    assert.match(secondContext, /TOOL_RESULT.*false.*(directory|file path|regular file)/i,
      "invalid directory-like write must return a corrective tool error before the next model turn");
  } finally {
    await fs.rm(worktree, { recursive: true, force: true });
  }
}

async function main() {
  await testStreamsLongModelResponses();
  await testRetriesOneTransientFetchFailure();
  await testRetriesTruncatedJsonConcise();
  await testStructuredInferenceUsesServerSchema();
  await testLocalAgentBoundsToolHistoryBeforeModelCalls();
  await testLocalAgentUsesServerActionSchema();
  await testLocalAgentRejectsImmediateDuplicateSuccessfulWrite();
  await testLocalAgentFailsFastOnRepeatedSuccessfulWriteLoop();
  await testLocalAgentFailsFastOnRepeatedRejectedWriteLoop();
  await testLocalAgentFailsFastWhenRejectedWriteChangesOnlyContent();
  await testLocalAgentTreatsMissingGreenfieldPathsAsCreatable();
  await testLocalAgentRejectsLiteralProtocolPlaceholders();
  await testFailedLocalAgentPersistsActionJournal();
  await testLocalAgentRejectsDirectoryLikeWriteTargetsAndRecovers();
  console.log("Bloom local Agent inference transport policy tests passed");
}

void main();
