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

assert(
  source.includes('.env("PNPM_HOME", &pnpm_home)'),
  "agent tooling must redirect pnpm state into a writable task-scoped directory",
);
assert(
  source.includes('.env("XDG_DATA_HOME", &xdg_data_home)'),
  "agent tooling must redirect XDG data writes away from the read-only user home",
);
assert(
  source.includes(
    "Formatting, lint, and test failures caused by your task changes are defects to fix before returning completed",
  ),
  "repository writers must remediate task-caused verification failures before completion",
);
assert(
  source.includes(
    "A missing CI check on an early or partial writer PR is not by itself a blocker",
  ),
  "code review must not require impossible CI evidence from writer PRs created before CI exists",
);

console.log("PASS  Luna Runtime owns publishing and supplies a verifiable agent environment.");
