import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = readFileSync(
  resolve(__dirname, "../../.github/workflows/deploy-bloom-worker.yml"),
  "utf8",
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  workflow.includes("cli.github.com/packages/githubcli-archive-keyring.gpg"),
  "production worker deploy must install GitHub CLI from the official GitHub package repository",
);
assert(
  workflow.includes("gh auth git-credential get"),
  "production worker deploy must verify the Git credential helper before starting builder workers",
);
assert(
  workflow.includes("GitHub credential helper smoke failed"),
  "production worker deploy must fail closed when Git credentials cannot be produced",
);

console.log("PASS  Production Bloom workers verify modern GitHub CLI credentials.");
