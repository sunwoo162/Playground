import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import {
  classifyRuntimeCommand,
  isAllowedCommand,
  resolveLocalEndpoint,
  runLocalAgent,
  validateRelativePath,
} from "./bloomLocalAgentRuntime";

function jsonResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function testSafeCommandJournal() {
  const eventsPath = path.resolve(".tmp", "runtime-command-observation-test.jsonl");
  await fs.mkdir(path.dirname(eventsPath), { recursive: true });
  await fs.rm(eventsPath, { force: true });
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse(JSON.stringify({
        action: "run", command: "git",
        args: ["status", "--porcelain", "SECRET_TOKEN=should-not-leak"], cwd: ".",
      }));
    }
    return jsonResponse(JSON.stringify({
      action: "final",
      report: {
        status: "blocked", summary: "probe complete", rationaleSummary: "policy probe",
        evidence: [], verification: [], commitSha: null, pullRequestNumber: null,
        pullRequestUrl: null, reviewedPullRequests: [], blockers: ["intentional stop"],
      },
    }));
  };
  try {
    const result = await runLocalAgent({
      projectId: "policy",
      taskId: "COMMAND-JOURNAL",
      worktree: process.cwd(),
      prompt: "run a harmless status probe then stop",
      eventsPath,
    }, { fetchImpl, maxSteps: 2 });

    const serializedEvents = JSON.stringify(result.events);
    const journal = await fs.readFile(eventsPath, "utf8");
    assert.match(serializedEvents, /"command":"git"/);
    assert.match(serializedEvents, /"commandClass":"other"/);
    assert.match(journal, /"command":"git"/);
    assert.match(journal, /"commandClass":"other"/);
    assert.doesNotMatch(serializedEvents, /SECRET_TOKEN|should-not-leak/);
    assert.doesNotMatch(journal, /SECRET_TOKEN|should-not-leak/);
  } finally {
    await fs.rm(eventsPath, { force: true });
  }
}

async function main() {
  assert.equal(resolveLocalEndpoint("http://127.0.0.1:8091/v1/chat/completions").hostname, "127.0.0.1");
  assert.throws(() => resolveLocalEndpoint("https://example.com/v1/chat/completions"), /loopback/i);
  assert.throws(() => validateRelativePath("../outside"), /worktree/i);
  assert.throws(() => validateRelativePath("/etc/passwd"), /worktree/i);
  assert.equal(isAllowedCommand("git", ["status"]), true);
  assert.equal(isAllowedCommand("git", ["diff"]), true);
  assert.equal(isAllowedCommand("git", ["push", "origin", "main"]), false);
  assert.equal(isAllowedCommand("gh", ["pr", "create"]), false);
  assert.equal(isAllowedCommand("node", ["-e", "process.exit(0)"]), false);
  assert.equal(isAllowedCommand("pnpm", ["test"]), true);
  assert.equal(classifyRuntimeCommand("pnpm", ["test"]), "test");
  assert.equal(classifyRuntimeCommand("pnpm", ["run", "test:bloom-runtime"]), "test");
  assert.equal(classifyRuntimeCommand("npm", ["run", "build"]), "build");
  assert.equal(classifyRuntimeCommand("cargo", ["test"]), "test");
  assert.equal(classifyRuntimeCommand("cargo", ["build"]), "build");
  assert.equal(classifyRuntimeCommand("pnpm", ["lint"]), "lint");
  assert.equal(classifyRuntimeCommand("pnpm", ["typecheck"]), "typecheck");
  assert.equal(classifyRuntimeCommand("node", ["scripts/check.js"]), "other");
  await testSafeCommandJournal();
  console.log("Bloom local agent runtime policy tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});