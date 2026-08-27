import { classifyWorktreeCleanupTask } from "./worktreeLifecyclePolicy";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const base = {
  status: "done" as const,
  role: "frontend" as const,
  worktreePath: "C:/workspace/.luna-worktrees/PROJECT-1/TASK-001",
  branchName: "agent/rose/frontend/task",
  commitSha: "abc123",
  pullRequestNumber: 42,
};

assert(
  classifyWorktreeCleanupTask(base).action === "cleanup",
  "completed repository writer with branch/commit/PR evidence should be eligible",
);
assert(
  classifyWorktreeCleanupTask({ ...base, status: "blocked" }).action === "skip",
  "blocked task worktree must never be removed",
);
assert(
  classifyWorktreeCleanupTask({ ...base, commitSha: null }).action === "skip",
  "repository writer without commit evidence must be preserved",
);
assert(
  classifyWorktreeCleanupTask({ ...base, pullRequestNumber: null }).action === "skip",
  "repository writer without PR evidence must be preserved",
);
assert(
  classifyWorktreeCleanupTask({ ...base, worktreePath: null }).action === "ignore",
  "task without a worktree should be ignored",
);
assert(
  classifyWorktreeCleanupTask({ ...base, role: "database" }).action === "cleanup",
  "completed specialist repository writer should use the same cleanup evidence contract",
);
assert(
  classifyWorktreeCleanupTask({
    ...base,
    role: "qa",
    branchName: null,
    commitSha: null,
    pullRequestNumber: null,
  }).action === "cleanup",
  "completed detached QA worktree should be eligible after project integration",
);
assert(
  classifyWorktreeCleanupTask({
    ...base,
    role: "reviewer",
    branchName: "unexpected/reviewer/branch",
    commitSha: null,
    pullRequestNumber: null,
  }).action === "skip",
  "review worker with unexpected branch metadata should be preserved",
);

console.log("worktreeLifecycle.policy-test: PASS");
