import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const setupScript = readFileSync(
  resolve(__dirname, "../../scripts/setup-bloom-evaluator-local-llm.sh"),
  "utf8",
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const match = setupScript.match(/--max-memory-restart\s+(\d+)M/);
assert(match, "production local llama must retain a PM2 max-memory restart guard");

const limitMiB = Number(match[1]);
assert(
  limitMiB >= 3200,
  `production local llama memory guard must stay above observed Agent inference peak; found ${limitMiB}M`,
);

console.log("PASS  Production local llama memory guard covers observed Agent inference peak.");
