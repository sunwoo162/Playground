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
  workflow.includes("install-deps chromium firefox webkit"),
  "production Bloom worker must provision Playwright host dependencies for Chromium, Firefox, and WebKit UAT",
);
assert(
  workflow.includes("Playwright browser host dependencies OK"),
  "production Bloom worker deploy must verify browser host dependency provisioning before starting builder workers",
);

console.log("PASS  Production Bloom workers provision browser host dependencies for UAT.");
