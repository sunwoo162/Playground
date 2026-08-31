import * as fs from "node:fs";
import * as path from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, "../../bloom-runtime");
const schemaSources = [
  "src/intake_runtime.rs",
  "src/market_discovery_runtime.rs",
];

for (const relativePath of schemaSources) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert(
    !source.includes('"uniqueItems"'),
    `${relativePath} must not send unsupported uniqueItems to Codex Structured Outputs`,
  );
}

console.log("PASS  Codex output schemas avoid unsupported uniqueItems.");
