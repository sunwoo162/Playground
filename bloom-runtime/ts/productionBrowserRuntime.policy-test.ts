import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = readFileSync(
  resolve(__dirname, "../../.github/workflows/deploy-bloom-worker.yml"),
  "utf8",
);
const ecosystem = readFileSync(
  resolve(__dirname, "../../ecosystem.config.js"),
  "utf8",
);
const evaluatorSetup = readFileSync(
  resolve(__dirname, "../../scripts/setup-bloom-evaluator-local-llm.sh"),
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
assert(
  workflow.includes("command_timeout: 150m"),
  "production Bloom worker provisioning must allow enough time for an in-flight Builder cycle to drain gracefully",
);
const gracefulWorkerTimeouts = ecosystem.match(/kill_timeout:\s*7_200_000/g) ?? [];
assert(
  gracefulWorkerTimeouts.length >= 2,
  "production evaluator and builder workers must wait up to two hours before PM2 escalates SIGINT to SIGKILL",
);
assert(
  evaluatorSetup.includes("--kill-timeout 7200000"),
  "local evaluator LLM must also use the two-hour graceful PM2 shutdown timeout",
);

const existingHealthProbeIndex = evaluatorSetup.indexOf('curl --fail --silent --show-error --max-time 3 "$HEALTH_URL"');
const firstLlmDeleteIndex = evaluatorSetup.indexOf('pm2 delete bloom-evaluator-llm');
assert(
  existingHealthProbeIndex >= 0 && firstLlmDeleteIndex >= 0 && existingHealthProbeIndex < firstLlmDeleteIndex,
  "healthy local evaluator LLM must be reused before any PM2 delete is attempted",
);
assert(
  evaluatorSetup.includes("existing local evaluator model is healthy and configured; keeping it"),
  "healthy local evaluator LLM with matching PM2 configuration must stay online across worker-only deploys",
);
assert(
  evaluatorSetup.includes("local evaluator PM2 memory guard drift detected"),
  "healthy local evaluator LLM may be recreated only when its applied PM2 memory guard has drifted from the deployed configuration",
);
assert(
  evaluatorSetup.includes("pm2 delete bloom-evaluator-llm >/dev/null 2>&1 &"),
  "stale local evaluator cleanup must not block the deploy shell indefinitely",
);
assert(
  evaluatorSetup.includes('kill -KILL "$llm_pid"'),
  "stale local evaluator cleanup must have a bounded force-kill fallback",
);

console.log("PASS  Production Bloom workers provision browser dependencies and drain gracefully during deploys.");
