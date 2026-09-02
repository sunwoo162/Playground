import * as assert from "node:assert/strict";

import { requestLocalModel, runLocalStructuredInference } from "./bloomLocalAgentRuntime";

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
async function main() {
  await testStreamsLongModelResponses();
  await testRetriesOneTransientFetchFailure();
  await testRetriesTruncatedJsonConcise();
  await testStructuredInferenceUsesServerSchema();
  console.log("Bloom local Agent inference transport policy tests passed");
}

void main();
