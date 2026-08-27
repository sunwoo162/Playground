import {
  BLOOM_TEAM_AGENT_COUNT,
  agentIdsForRole,
  assignTaskRunAgentsPreservingStarted,
} from "./agentRoster";
import type { ProjectTaskRun } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function run(
  taskId: string,
  agentId: string,
  status: ProjectTaskRun["status"],
  attempts = 0,
): ProjectTaskRun {
  return {
    taskId,
    role: "frontend",
    agentId,
    status,
    attempts,
    branchName: attempts > 0 ? `agent/rose/frontend/${taskId.toLowerCase()}` : null,
    worktreePath: attempts > 0 ? `/workspace/${taskId}` : null,
    threadId: null,
    sessionId: null,
    turnId: null,
    eventsPath: null,
    stderrPath: null,
    commitSha: status === "done" ? `${taskId}-sha` : null,
    pullRequestNumber: status === "done" ? 10 : null,
    pullRequestUrl: status === "done" ? "https://example.invalid/pr" : null,
    reviewedPullRequests: [],
    summary: null,
    rationaleSummary: null,
    evidence: [],
    verification: [],
    blockers: [],
    lastError: null,
    startedAt: attempts > 0 ? "2026-08-27T00:00:00Z" : null,
    completedAt: status === "done" ? "2026-08-27T00:01:00Z" : null,
  };
}

assert(BLOOM_TEAM_AGENT_COUNT === 30, "Bloom team roster must total exactly 30 Agents");
assert(
  JSON.stringify(agentIdsForRole("rose", "frontend"))
    === JSON.stringify(["rose:frontend", "rose:frontend-2", "rose:frontend-3"]),
  "Frontend Agent IDs must retain the primary identity and add two stable replicas",
);

const distributed = assignTaskRunAgentsPreservingStarted([
  run("FE-001", "rose:frontend", "done", 1),
  run("FE-002", "rose:frontend-2", "running", 1),
  run("FE-003", "rose:frontend", "pending"),
  run("FE-004", "rose:frontend", "pending"),
]);

assert(distributed[0].agentId === "rose:frontend", "completed task ownership must never move");
assert(distributed[1].agentId === "rose:frontend-2", "running task ownership must never move");
assert(distributed[2].agentId === "rose:frontend-3", "untouched task should use the next Frontend Agent instance");
assert(distributed[3].agentId === "rose:frontend", "untouched allocation should continue deterministic round-robin");
assert(distributed[0].branchName?.includes("fe-001"), "completed task branch evidence must be preserved");
assert(distributed[1].worktreePath === "/workspace/FE-002", "running task worktree evidence must be preserved");

console.log("agentRoster.policy-test: PASS");
