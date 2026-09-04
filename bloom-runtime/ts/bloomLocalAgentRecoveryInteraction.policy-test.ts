import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { runLocalAgent } from "./bloomLocalAgentRuntime";

const encoder = new TextEncoder();

function streamingResponse(content: string): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function schemaActions(body: Record<string, unknown>): string[] {
  const responseFormat = body.response_format as Record<string, unknown> | undefined;
  const schema = responseFormat?.schema as Record<string, unknown> | undefined;
  const variants = schema?.oneOf as Array<Record<string, unknown>> | undefined;
  return variants?.flatMap((variant) => {
    const properties = variant.properties as Record<string, unknown> | undefined;
    const action = properties?.action as Record<string, unknown> | undefined;
    return Array.isArray(action?.enum) && typeof action.enum[0] === "string" ? [action.enum[0]] : [];
  }) ?? [];
}

const completed = JSON.stringify({
  action: "final",
  report: {
    status: "completed",
    summary: "backend implementation complete",
    rationaleSummary: "repository changes exist",
    evidence: [],
    verification: [],
    commitSha: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    reviewedPullRequests: [],
    blockers: [],
  },
});

async function main() {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "bloom-recovery-ping-pong-"));
  const bodies: Array<Record<string, unknown>> = [];
  let calls = 0;
  const appWrite = JSON.stringify({
    action: "write",
    path: "backend/src/App.js",
    content: "export default function App(){ return 'ready'; }",
  });

  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    bodies.push(body);
    calls += 1;

    let content: string;
    if (calls === 1) content = completed;
    else if (calls === 2 || calls === 3) content = appWrite;
    else if (calls === 4 || calls === 5) content = JSON.stringify({ action: "read", path: ".git/diff" });
    else {
      const actions = schemaActions(body);
      content = actions.includes("final") ? completed : appWrite;
    }
    return streamingResponse(content);
  };

  try {
    await fs.writeFile(path.join(worktree, "README.md"), "baseline\n", "utf8");
    execFileSync("git", ["init"], { cwd: worktree, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "policy@example.com"], { cwd: worktree, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "Bloom Policy"], { cwd: worktree, stdio: "ignore" });
    execFileSync("git", ["add", "README.md"], { cwd: worktree, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "baseline"], { cwd: worktree, stdio: "ignore" });

    const result = await runLocalAgent({
      projectId: "policy",
      taskId: "RECOVERY-PING-PONG",
      worktree,
      prompt: "implement the backend and finish after real repository changes exist",
      requireMutation: true,
    }, { fetchImpl, maxSteps: 6 });

    assert.equal(result.report.status, "completed");
    assert.equal(calls, 6);
    const recoveryActions = schemaActions(bodies[5] ?? {});
    assert.ok(!recoveryActions.includes("read"), "the repeatedly failing read must remain suppressed for the recovery turn");
    assert.ok(recoveryActions.includes("list"), "recovery must keep a safe alternate inspection action available");
    assert.ok(recoveryActions.includes("final"),
      "once real repository changes exist, repeated inspection failure must not remove final and force the writer back into a duplicate write");
    assert.equal(await fs.readFile(path.join(worktree, "backend", "src", "App.js"), "utf8"),
      "export default function App(){ return 'ready'; }");
  } finally {
    await fs.rm(worktree, { recursive: true, force: true });
  }
}

void main();
