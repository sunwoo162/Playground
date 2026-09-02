import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const activeRuntimeFiles = [
  "bloom-worker/run.js",
  "bloom-runtime/src/agent_runtime.rs",
  "bloom-runtime/src/failure_router_runtime.rs",
  "bloom-runtime/src/intake_runtime.rs",
  "bloom-runtime/src/replan_runtime.rs",
  "bloom-runtime/src/retrospective_runtime.rs",
  "bloom-runtime/src/project_runtime.rs",
  "bloom-runtime/src/market_discovery_runtime.rs",
  "bloom-runtime/ts/bloomBouquetSeniorEvaluator.ts",
];

for (const file of activeRuntimeFiles) {
  const source = readFileSync(resolve(__dirname, "../..", file), "utf8");
  assert(!/Command::new\(\s*"codex"\s*\)/.test(source), `${file} must not spawn the Codex executable`);
  assert(!/run_checked_with_stdin\(\s*"codex"\s*,/.test(source), `${file} must not invoke Codex through a helper`);
  assert(!/command_output\(\s*"codex"\s*,/.test(source), `${file} must not probe Codex`);
  assert(!source.includes("createCodexSeniorEvaluatorRunner"), `${file} must not expose a Codex evaluator runner`);
}

const worker = readFileSync(resolve(__dirname, "../../bloom-worker/run.js"), "utf8");
assert(!/EVALUATOR_RUNTIMES\s*=\s*new Set\(\[[^\]]*codex/i.test(worker), "evaluator runtime must be local-only");
assert(!/BLOOM_EVALUATOR_RUNTIME[^\n]*codex/i.test(worker), "worker must not advertise a Codex evaluator mode");
assert(worker.includes("BLOOM_LOCAL_AGENT_RUNNER_PATH"), "builder worker must provide the compiled local Agent runner to Rust");

console.log("PASS  Active Bloom runtime is Codex-free and local-only.");
