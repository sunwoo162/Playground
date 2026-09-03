import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { runLocalAgent } from "./bloomLocalAgentRuntime";

const encoder = new TextEncoder();

function streamingAction(content: string): Response {
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

const repeatedWrite = JSON.stringify({
  action: "write",
  path: "frontend/src",
  content: "# copied task spec",
});
const correctedWrite = JSON.stringify({
  action: "write",
  path: "frontend/src/main.tsx",
  content: "export default function App(){ return null; }",
});

const finalAction = JSON.stringify({
  action: "final",
  report: {
    status: "completed",
    summary: "done",
    rationaleSummary: "done",
    evidence: [],
    verification: [],
    commitSha: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    reviewedPullRequests: [],
    blockers: [],
  },
});

async function testRepeatedFailureReceivesRecoveryInstruction() {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "bloom-local-agent-recovery-"));
  const bodies: Array<Record<string, unknown>> = [];
  let corrected = false;
  let calls = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    bodies.push(body);
    calls += 1;
    const messages = body.messages as Array<{ content?: string }> | undefined;
    const context = messages?.map((message) => message.content ?? "").join("\n") ?? "";
    if (!corrected && calls >= 3 && /RECOVERY_REQUIRED/.test(context)) {
      corrected = true;
      return streamingAction(correctedWrite);
    }
    if (corrected) return streamingAction(finalAction);
    return streamingAction(repeatedWrite);
  };

  try {
    await runLocalAgent({
      projectId: "policy",
      taskId: "GREENFIELD-RECOVERY-001",
      worktree,
      prompt: "implement a React frontend",
    }, { fetchImpl, maxSteps: 5 });
    assert.equal(
      await fs.readFile(path.join(worktree, "frontend", "src", "main.tsx"), "utf8"),
      "export default function App(){ return null; }",
    );
    const thirdMessages = bodies[2]?.messages as Array<{ content?: string }> | undefined;
    const thirdContext = thirdMessages?.map((message) => message.content ?? "").join("\n") ?? "";
    assert.match(
      thirdContext,
      /RECOVERY_REQUIRED.*do not repeat|do not repeat.*RECOVERY_REQUIRED/i,
      "the second identical failed action must force a different next action",
    );
  } finally {
    await fs.rm(worktree, { recursive: true, force: true });
  }
}

async function testSuccessfulMutationResetsRepeatedFailureCount() {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "bloom-local-agent-progress-reset-"));
  let calls = 0;
  let fourthHadRecovery = false;
  const validWrite = JSON.stringify({ action: "write", path: "frontend/src/App.tsx", content: "export const App = () => null;" });
  const fetchImpl: typeof fetch = async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const messages = body.messages as Array<{ content?: string }> | undefined;
    const context = messages?.map((message) => message.content ?? "").join("\n") ?? "";
    if (calls === 1 || calls === 3) return streamingAction(repeatedWrite);
    if (calls === 2) return streamingAction(validWrite);
    if (calls === 4) {
      fourthHadRecovery = /RECOVERY_REQUIRED/.test(context);
      return streamingAction(repeatedWrite);
    }
    if (calls === 5 && /RECOVERY_REQUIRED/.test(context)) return streamingAction(correctedWrite);
    return streamingAction(finalAction);
  };
  try {
    await runLocalAgent({
      projectId: "policy",
      taskId: "GREENFIELD-PROGRESS-RESET-001",
      worktree,
      prompt: "implement a React frontend",
    }, { fetchImpl, maxSteps: 6 });
    assert.equal(fourthHadRecovery, false, "a successful source mutation must reset prior failure repetition");
    assert.equal(await fs.readFile(path.join(worktree, "frontend", "src", "main.tsx"), "utf8"), "export default function App(){ return null; }");
  } finally {
    await fs.rm(worktree, { recursive: true, force: true });
  }
}

async function testPersistentRepeatedFailureStopsEarly() {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "bloom-local-agent-no-progress-"));
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return streamingAction(repeatedWrite);
  };

  try {
    await assert.rejects(
      runLocalAgent({
        projectId: "policy",
        taskId: "GREENFIELD-NO-PROGRESS-001",
        worktree,
        prompt: "implement a React frontend",
      }, { fetchImpl, maxSteps: 10 }),
      /repeated.*failed.*action|no[- ]progress/i,
      "persistent identical failures must stop before the global step limit",
    );
    assert.ok(calls <= 3, `expected no more than 3 repeated calls, got ${calls}`);
  } finally {
    await fs.rm(worktree, { recursive: true, force: true });
  }
}

async function main() {
  await testRepeatedFailureReceivesRecoveryInstruction();
  await testSuccessfulMutationResetsRepeatedFailureCount();
  await testPersistentRepeatedFailureStopsEarly();
  console.log("Bloom local Agent no-progress recovery policy tests passed");
}

void main();
