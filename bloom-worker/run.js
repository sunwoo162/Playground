const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runBuilderWorkerOnce } = require("../.tmp/bloom-worker/builderWorkerAdapter.js");
const { createBuilderWorkerHttpClient } = require("../.tmp/bloom-worker/builderWorkerHttpClient.js");
const { createObservedHeadlessBuilderExecutor } = require("../.tmp/bloom-worker/observedHeadlessBuilderExecutor.js");

const MAX_BRIDGE_OUTPUT_BYTES = 16 * 1024 * 1024;
const TEAM_IDS = new Set(["rose", "lily", "tulip", "sunflower", "cherry-blossom"]);

function configValue(primary, legacy) {
  return process.env[primary]?.trim() || (legacy ? process.env[legacy]?.trim() : "") || "";
}

function requiredConfig(primary, legacy) {
  const value = configValue(primary, legacy);
  if (!value) {
    const legacyHint = legacy ? ` (legacy: ${legacy})` : "";
    throw new Error(`${primary}${legacyHint} 환경변수가 필요합니다.`);
  }
  return value;
}

function integerConfig(primary, legacy, fallback, minimum) {
  const raw = configValue(primary, legacy);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${primary}은 ${minimum} 이상의 정수여야 합니다.`);
  }
  return value;
}

function defaultBridgePath() {
  const filename = process.platform === "win32"
    ? "bloom-runtime-bridge.exe"
    : "bloom-runtime-bridge";
  return path.resolve(__dirname, "../bloom-runtime/target/release", filename);
}

function parseBridgeResponse(stdout, stderr, exitCode) {
  let response;
  try {
    response = JSON.parse(stdout.trim());
  } catch {
    const detail = stderr.trim() || stdout.trim() || `exit code ${exitCode}`;
    throw new Error(`Bloom Runtime bridge 응답 파싱 실패: ${detail}`);
  }
  if (!response || response.ok !== true) {
    throw new Error(response?.error || stderr.trim() || `Bloom Runtime bridge 실패 (exit ${exitCode})`);
  }
  return response.result;
}

function createRuntimeBridge(binaryPath) {
  if (!fs.existsSync(binaryPath)) {
    throw new Error(
      `Bloom Runtime bridge binary를 찾을 수 없습니다: ${binaryPath}\n`
      + "먼저 `pnpm run build:bloom-runtime-bridge`를 실행하거나 BLOOM_RUNTIME_BRIDGE_PATH를 지정하세요.",
    );
  }

  const call = (request) => new Promise((resolve, reject) => {
    const child = spawn(binaryPath, [], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(error);
    };

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_BRIDGE_OUTPUT_BYTES) {
        rejectOnce(new Error("Bloom Runtime bridge stdout가 16MB 안전 한도를 초과했습니다."));
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_BRIDGE_OUTPUT_BYTES) {
        rejectOnce(new Error("Bloom Runtime bridge stderr가 16MB 안전 한도를 초과했습니다."));
        return;
      }
      stderrChunks.push(chunk);
    });
    child.on("error", rejectOnce);
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      try {
        resolve(parseBridgeResponse(
          Buffer.concat(stdoutChunks).toString("utf8"),
          Buffer.concat(stderrChunks).toString("utf8"),
          code,
        ));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.on("error", rejectOnce);
    child.stdin.end(JSON.stringify(request));
  });

  return {
    analyzeIntake: (input) => call({ command: "analyzeIntake", ...input }),
    planProject: (input) => call({ command: "planProject", ...input }),
    bootstrapRepository: (input) => call({ command: "bootstrapProjectRepository", ...input }),
    dispatchTask: (input) => call({ command: "dispatchAgentTask", input }),
    reconcileTask: (input) => call({ command: "reconcileInterruptedAgentTask", input }),
    mergePullRequests: (input) => call({ command: "mergePullRequests", input }),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const baseUrl = configValue("BLOOM_API_BASE_URL", "BUILDER_API_BASE_URL") || "http://localhost:8080";
  // Backend worker authentication still uses the existing Builder protocol token.
  const token = requiredConfig("BUILDER_WORKER_TOKEN");
  const organization = requiredConfig("BLOOM_GITHUB_ORGANIZATION", "BUILDER_GITHUB_ORGANIZATION");
  const workspaceRoot = requiredConfig("BLOOM_WORKSPACE_ROOT", "BUILDER_WORKSPACE_ROOT");
  const teamId = configValue("BLOOM_TEAM_ID", "BUILDER_TEAM_ID") || "rose";
  if (!TEAM_IDS.has(teamId)) {
    throw new Error(`BLOOM_TEAM_ID가 허용된 Team ID가 아닙니다: ${teamId}`);
  }
  const teamName = configValue("BLOOM_TEAM_NAME", "BUILDER_TEAM_NAME") || teamId;
  const workerId = configValue("BLOOM_WORKER_ID", "BUILDER_WORKER_ID")
    || `bloom-${os.hostname()}-${process.pid}`;
  const pollIntervalMs = integerConfig(
    "BLOOM_WORKER_POLL_INTERVAL_MS",
    "BUILDER_WORKER_POLL_INTERVAL_MS",
    5000,
    1000,
  );
  const heartbeatIntervalMs = integerConfig(
    "BLOOM_WORKER_HEARTBEAT_INTERVAL_MS",
    "BUILDER_WORKER_HEARTBEAT_INTERVAL_MS",
    30000,
    1000,
  );
  if (heartbeatIntervalMs >= 90000) {
    throw new Error("BLOOM_WORKER_HEARTBEAT_INTERVAL_MS는 90초 lease보다 짧아야 합니다.");
  }

  const binaryPath = path.resolve(
    configValue("BLOOM_RUNTIME_BRIDGE_PATH", "BUILDER_RUNTIME_BRIDGE_PATH") || defaultBridgePath(),
  );
  const runtime = createRuntimeBridge(binaryPath);
  const client = createBuilderWorkerHttpClient({ baseUrl, token });
  const execute = createObservedHeadlessBuilderExecutor({
    organization,
    workspaceRoot,
    teamId,
    teamName,
    runtime,
  });

  let stopping = false;
  const stop = (signal) => {
    stopping = true;
    console.log(`[bloom-worker] ${signal} received; current cycle will finish before exit.`);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  console.log(`[bloom-worker] started workerId=${workerId} team=${teamId} api=${baseUrl}`);
  while (!stopping) {
    try {
      const outcome = await runBuilderWorkerOnce(client, workerId, execute, {
        heartbeatIntervalMs,
      });
      if (outcome.status !== "idle") {
        console.log(`[bloom-worker] run ${outcome.claim?.runId ?? "-"} -> ${outcome.status}`);
      }
      if (
        outcome.status === "idle"
        || outcome.status === "failed"
        || outcome.status === "lease-lost"
        || outcome.status === "terminal-report-failed"
      ) {
        await sleep(pollIntervalMs);
      }
    } catch (error) {
      console.error(`[bloom-worker] cycle error: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(pollIntervalMs);
    }
  }
}

main().catch((error) => {
  console.error(`[bloom-worker] fatal: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
