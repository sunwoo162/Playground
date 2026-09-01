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
  source.includes("fn materialize_dependency_commits("),
  "Luna Runtime must materialize completed dependency commits before a downstream writer runs",
);
assert(
  source.includes("for dependency in &input.dependencies"),
  "dependency materialization must inspect every completed dependency artifact",
);
assert(
  source.includes('git_args(worktree, &["merge", "--no-edit", commit_sha])'),
  "dependency materialization must merge the exact dependency commit into the writer worktree",
);
assert(
  source.includes("materialize_dependency_commits(&input, &worktree)?;"),
  "dispatch must materialize dependency commits before starting the sandboxed Codex turn",
);

console.log("PASS  Downstream writer worktrees materialize completed dependency commits.");
