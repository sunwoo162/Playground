import * as path from "node:path";

import {
  assertRequiredEnvironment,
  runDeliveryBuild,
  type LunaDeliverySpawn,
} from "./lunaDeliveryBuild";
import type { LunaDeliveryManifest } from "./lunaDeliveryManifest";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => unknown, pattern: RegExp, message: string) {
  let error: unknown = null;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof Error, message);
  assert(pattern.test(error.message), `${message}: ${error.message}`);
}

const staticManifest = (): LunaDeliveryManifest => ({
  schemaVersion: 1,
  slug: "sample-app",
  platform: "web",
  runtimes: [{
    id: "web",
    type: "static",
    routingMode: "static-files",
    workingDirectory: ".",
    installCommand: "pnpm install --frozen-lockfile",
    buildCommand: "pnpm build",
    outputDirectory: "dist",
    healthPath: "/",
  }],
  env: { required: ["PUBLIC_API_URL"] },
});

assertThrows(
  () => assertRequiredEnvironment(
    { ...staticManifest(), env: { required: ["DATABASE_URL"] } },
    {},
  ),
  /DATABASE_URL/,
  "missing required environment must block delivery before build",
);

async function run() {
  const calls: Array<{
    command: string;
    cwd: string;
    env: Record<string, string | undefined>;
  }> = [];
  const spawnImpl: LunaDeliverySpawn = async (command, options) => {
    calls.push({ command, cwd: options.cwd, env: { ...options.env } });
  };

  const workspacePath = path.resolve("/tmp/luna-build-sample");
  const result = await runDeliveryBuild({
    workspacePath,
    manifest: staticManifest(),
    slug: "sample-app",
    gitSha: "abc123",
    env: { PUBLIC_API_URL: "https://api.example.invalid" },
    spawnImpl,
  });

  assert(calls.length === 2, "install and build commands execute sequentially for one runtime");
  assert(calls[0]?.command === "pnpm install --frozen-lockfile", "install command runs first");
  assert(calls[1]?.command === "pnpm build", "build command runs second");
  assert(calls.every((call) => call.cwd === workspacePath), "commands execute only in the resolved runtime working directory");
  assert(calls.every((call) => call.env.LUNA_PUBLIC_BASE_PATH === "/apps/sample-app/"), "all build commands receive canonical Luna public base path");
  assert(calls.every((call) => call.env.PUBLIC_API_URL === "https://api.example.invalid"), "provided environment reaches build commands");
  assert(result.slug === "sample-app" && result.gitSha === "abc123", "build result retains release identity");
  assert(result.runtimes[0]?.runtimeId === "web", "build result identifies each runtime");
  assert(result.runtimes[0]?.outputPath === path.join(workspacePath, "dist"), "static output path resolves inside workspace");

  let escaped = false;
  try {
    await runDeliveryBuild({
      workspacePath,
      manifest: {
        ...staticManifest(),
        runtimes: [{ ...staticManifest().runtimes[0], workingDirectory: "../outside" }],
      },
      slug: "sample-app",
      gitSha: "abc123",
      env: { PUBLIC_API_URL: "https://api.example.invalid" },
      spawnImpl,
    });
  } catch (error) {
    escaped = error instanceof Error && /workspace|workingDirectory|outside/i.test(error.message);
  }
  assert(escaped, "build executor must independently reject working directories outside workspace");
  assert(calls.length === 2, "rejected workspace escape must not execute any additional command");

  console.log("PASS  Luna isolated delivery build scenarios passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
