"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const {
  completeJson,
  localResourceSnapshot,
  normalizeReport,
  parseJsonObject,
} = require("./local-codex-shim.js");

async function withFakeServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const previous = process.env.BLOOM_LOCAL_LLM_URL;
  process.env.BLOOM_LOCAL_LLM_URL = `http://127.0.0.1:${address.port}/v1/chat/completions`;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.BLOOM_LOCAL_LLM_URL;
    else process.env.BLOOM_LOCAL_LLM_URL = previous;
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  assert.deepEqual(parseJsonObject("```json\n{\"ok\":true}\n```"), { ok: true });
  assert.deepEqual(parseJsonObject("prefix {\"value\":3} suffix"), { value: 3 });

  const normalized = normalizeReport({
    status: "completed",
    summary: "done",
    verification: [{ name: "build", status: "passed", details: "ok" }],
  });
  assert.equal(normalized.status, "completed");
  assert.equal(normalized.commitSha, null);
  assert.equal(normalized.verification[0].status, "passed");

  const resources = localResourceSnapshot();
  assert.ok(resources.total > 0);
  assert.ok(resources.available >= 0);
  assert.ok(resources.usedRatio >= 0 && resources.usedRatio <= 1);
  assert.ok(resources.cpus >= 1);

  await withFakeServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const payload = JSON.parse(body);
      assert.equal(payload.stream, false);
      assert.ok(Array.isArray(payload.messages));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        choices: [{ message: { content: "{\"summary\":\"local ok\"}" } }],
      }));
    });
  }, async () => {
    const result = await completeJson("Return a summary.", "{\"type\":\"object\"}");
    assert.equal(result.value.summary, "local ok");
  });

  console.log("Bloom local LLM compatibility policy tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
