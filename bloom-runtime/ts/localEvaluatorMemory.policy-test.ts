import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const setupScript = readFileSync(
  resolve(__dirname, "../../scripts/setup-bloom-evaluator-local-llm.sh"),
  "utf8",
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const match = setupScript.match(/LLAMA_MAX_MEMORY_RESTART_MB=(\d+)/);
assert(match, "production local llama must define a PM2 max-memory restart guard");
assert(/--max-memory-restart\s+"\$\{LLAMA_MAX_MEMORY_RESTART_MB\}M"/.test(setupScript),
  "production local llama startup must use the reconciled memory guard value as its single source of truth");

const limitMiB = Number(match[1]);
assert(
  limitMiB >= 4200,
  `production local llama memory guard must stay above the 3886 MiB long-run Agent inference peak with restart headroom; found ${limitMiB}M`,
);

const healthyFastPathStart = setupScript.indexOf("if pm2 describe bloom-evaluator-llm");
const healthyFastPathEnd = setupScript.indexOf("delete_stale_llm()", healthyFastPathStart);
assert(healthyFastPathStart >= 0 && healthyFastPathEnd > healthyFastPathStart,
  "production local llama setup must retain a healthy-process fast path");
const healthyFastPath = setupScript.slice(healthyFastPathStart, healthyFastPathEnd);
assert(/current_llm_max_memory_restart_bytes/.test(healthyFastPath),
  "healthy local llama reuse must inspect the currently applied PM2 memory limit");
assert(/LLAMA_MAX_MEMORY_RESTART_BYTES/.test(healthyFastPath),
  "healthy local llama reuse must compare PM2 state with the desired memory limit before keeping the process");
assert(/max_memory_restart/.test(setupScript) && /pm2 jlist/.test(setupScript),
  "production local llama setup must read PM2 max_memory_restart from the live process metadata");

console.log("PASS  Production local llama memory guard covers observed Agent inference peak and reconciles PM2 config drift.");
