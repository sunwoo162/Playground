import * as fs from "node:fs";
import * as path from "node:path";
import { REPOSITORY_WRITER_ROLES } from "./planTopology";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync(
  path.resolve(__dirname, "../../bloom-runtime/src/agent_runtime.rs"),
  "utf8",
);
const reconciliationSource = fs.readFileSync(
  path.resolve(__dirname, "../../bloom-runtime/src/agent_reconciliation.rs"),
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
  source.includes('git_args(worktree, &["push", "origin", branch])'),
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
  source.includes("struct AgentToolStateGuard"),
  "agent tooling must guard task-scoped temporary state with lifecycle cleanup",
);
assert(
  source.includes("impl Drop for AgentToolStateGuard"),
  "agent tool state cleanup must run on success and every early-return failure path",
);
assert(
  source.includes("fs::remove_dir_all(&self.root)"),
  "agent tool state cleanup must recursively remove task-scoped caches such as Playwright downloads",
);
assert(
  source.includes("AgentToolStateGuard::prepare(tool_state_root.clone())?"),
  "agent runtime must activate tool-state cleanup before spawning Codex",
);
assert(
  source.includes("if root.exists()"),
  "agent runtime must clear stale task-scoped tool state left by an interrupted prior attempt",
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

assert(
  source.includes("fn recover_runtime_owned_publication_blocker("),
  "Runtime must recover writer reports blocked only by Luna-owned commit/PR publication",
);
assert(
  source.includes("Runtime-owned Git publication is not a task blocker"),
  "writer prompt must explicitly prohibit treating Luna-owned publication as a blocker",
);
assert(
  source.includes("verification.status == \"failed\" || verification.status == \"blocked\""),
  "publication recovery must not hide failed or blocked verification",
);
assert(
  source.includes("report.blockers.iter().all(is_runtime_owned_publication_blocker)"),
  "publication recovery must apply only when every blocker is publication-ownership noise",
);
assert(
  source.includes("recover_runtime_owned_publication_blocker(&input, &worktree, &mut report)?;"),
  "dispatch must normalize safe publication-only blockers before Runtime publishes the writer result",
);

const noTrackBranchCreations = source.match(
  /"worktree", "add", "-b", branch_name\.as_str\(\), "--no-track"/g,
) ?? [];
assert(
  noTrackBranchCreations.length >= 2,
  "parallel agent worktree creation must not write shared upstream configuration",
);
assert(
  source.includes('git_args(worktree, &["push", "origin", branch])'),
  "parallel agent publication must push explicitly without writing shared upstream configuration",
);
assert(
  !source.includes('git_args(worktree, &["push", "-u", "origin", branch])'),
  "parallel agent publication must not use push -u because it writes shared repository config",
);

const rustWriterRoleBlock = reconciliationSource.match(
  /const WRITER_ROLES: &\[&str\] = &\[([\s\S]*?)\];/,
)?.[1] ?? "";
const rustWriterRoles = new Set(
  [...rustWriterRoleBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]),
);
for (const role of REPOSITORY_WRITER_ROLES) {
  assert(
    rustWriterRoles.has(role),
    `interrupted-task reconciliation must fail closed for repository writer role: ${role}`,
  );
}

assert(
  source.includes("reuse or update your existing prefixed top-level comment instead of creating a duplicate"),
  "review retries must make GitHub comment publication idempotent",
);
assert(
  source.includes("Do not merge, close, label, retarget, or otherwise mutate pull requests"),
  "review agents must not perform non-idempotent GitHub mutations outside their review comment",
);

console.log("PASS  Luna Runtime owns publishing and cleans task-scoped tool state.");