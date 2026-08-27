"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { resolveThroughExistingAncestor } = require("./local-path-compat.js");
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

  const nestedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bloom-local-path-"));
  try {
    const nested = path.join(nestedRoot, "src", "components", "App.tsx");
    assert.equal(resolveThroughExistingAncestor(nested), nested);
    fs.mkdirSync(path.dirname(nested), { recursive: true });
    fs.writeFileSync(nested, "export default null;\n", "utf8");
    assert.equal(fs.realpathSync(nested), nested);
  } finally {
    fs.rmSync(nestedRoot, { recursive: true, force: true });
  }

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
