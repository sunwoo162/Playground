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
  source.includes("fn publish_repository_writer_result("),
  "Luna Runtime must own repository-writer publishing outside the Codex sandbox",
);
assert(
  source.includes('git_args(worktree, &["add", "-A"])'),
  "Luna Runtime must stage the writer worktree itself",
);
assert(
  source.includes('git_args(worktree, &["push", "-u", "origin", branch])'),
  "Luna Runtime must push the dedicated agent branch itself",
);
assert(
  source.includes("Luna Runtime will publish your completed work after this turn"),
  "writer prompt must tell Codex not to work around protected Git metadata",
);
assert(
  source.includes("publish_repository_writer_result(&input, &worktree, branch_name, &mut report)?;"),
  "dispatch must publish and verify writer work after the sandboxed turn completes",
);

console.log("PASS  Luna Runtime owns repository-writer Git publishing.");
