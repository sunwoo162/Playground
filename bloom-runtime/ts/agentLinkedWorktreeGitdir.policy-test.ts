import * as fs from "node:fs";
import * as path from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync(
  path.resolve(__dirname, "../../bloom-runtime/src/agent_runtime.rs"),
  "utf8",
);

assert(
  source.includes("fn resolve_worktree_git_metadata_root(worktree: &Path) -> Result<PathBuf, String>"),
  "agent runtime must resolve the concrete linked-worktree Git metadata directory",
);
assert(
  source.includes("let worktree_git_metadata_root = resolve_worktree_git_metadata_root(worktree)?;"),
  "agent runtime must resolve linked-worktree Git metadata before starting Codex",
);
assert(
  source.includes("worktree_git_metadata_root.to_string_lossy()"),
  "Codex workspaceWrite sandbox must explicitly allow the linked-worktree Git metadata directory",
);

console.log("PASS  Agent sandbox allows linked-worktree Git metadata writes.");
