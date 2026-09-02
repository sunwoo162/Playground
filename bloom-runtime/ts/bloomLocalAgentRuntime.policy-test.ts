import * as assert from "node:assert/strict";

import {
  isAllowedCommand,
  resolveLocalEndpoint,
  validateRelativePath,
} from "./bloomLocalAgentRuntime";

function main() {
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
  console.log("Bloom local agent runtime policy tests passed");
}

main();
