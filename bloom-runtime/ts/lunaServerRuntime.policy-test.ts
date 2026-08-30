import * as fs from "node:fs";
import * as path from "node:path";

import {
  assertPortAvailable,
  chooseCandidateSlot,
  renderServerRuntimeEnvironment,
  startServerCandidate,
  type LunaServerRuntimeSpawn,
} from "./lunaServerRuntime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function assertRejects(
  run: () => Promise<unknown>,
  pattern: RegExp,
  message: string,
) {
  let error: unknown = null;
  try {
    await run();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof Error, message);
  assert(pattern.test(error.message), `${message}: ${error.message}`);
}

assert(chooseCandidateSlot("A") === "B", "active slot A must deploy to candidate slot B");
assert(chooseCandidateSlot("B") === "A", "active slot B must deploy to candidate slot A");
assert(chooseCandidateSlot(null) === "A", "first server delivery must start with slot A");

const environment = renderServerRuntimeEnvironment({
  slug: "sample-app",
  port: 3210,
  releasePath: "/srv/bloombouquet/apps/sample-app/releases/abc1234",
  startCommand: "pnpm start",
  env: {
    DATABASE_URL: "postgres://runtime-secret",
  },
});
assert(environment.includes("PORT=\"3210\""), "runtime environment must include the Registry-assigned port");
assert(environment.includes("LUNA_PUBLIC_BASE_PATH=\"/apps/sample-app/\""), "runtime environment must include the canonical public base path");
assert(environment.includes("DATABASE_URL=\"postgres://runtime-secret\""), "runtime environment must include approved central environment values");

const unitTemplate = fs.readFileSync(
  path.resolve("deploy/systemd/bloombouquet-luna-app@.service"),
  "utf8",
);
assert(unitTemplate.includes("EnvironmentFile=/run/bloombouquet/luna/%i.env"), "systemd template must consume the protected per-instance environment file");
assert(!unitTemplate.includes("postgres://runtime-secret"), "committed systemd template must never contain application secret values");

async function run() {
  await assertPortAvailable(3210, async (port) => port === 3210);
  await assertRejects(
    () => assertPortAvailable(3210, async () => false),
    /port|available|3210/i,
    "unavailable Registry-assigned ports must block candidate start",
  );

  const calls: Array<{ command: string; args: string[] }> = [];
  const writes: Array<{ filePath: string; content: string; mode?: number }> = [];
  const spawnImpl: LunaServerRuntimeSpawn = async (command, args) => {
    calls.push({ command, args: [...args] });
  };

  const result = await startServerCandidate({
    slug: "sample-app",
    runtimeId: "web",
    slot: "B",
    port: 3210,
    releasePath: "/srv/bloombouquet/apps/sample-app/releases/abc1234",
    startCommand: "pnpm start",
    env: { DATABASE_URL: "postgres://runtime-secret" },
    portProbe: async () => true,
    mkdirImpl: async () => undefined,
    writeFileImpl: async (filePath, content, options) => {
      writes.push({ filePath, content, mode: options?.mode });
    },
    spawnImpl,
  });

  assert(result.instanceKey === "sample-app-web-B", "systemd instance key must be slug-runtime-slot");
  assert(result.serviceName === "bloombouquet-luna-app@sample-app-web-B.service", "candidate must use the Luna systemd template instance");
  assert(result.environmentFile === "/run/bloombouquet/luna/sample-app-web-B.env", "candidate must use an instance-scoped runtime environment file");
  assert(writes.length === 1, "candidate start must write one protected runtime environment file");
  assert(writes[0]?.mode === 0o600, "runtime environment file must be owner-readable only");
  assert(writes[0]?.content.includes("DATABASE_URL=\"postgres://runtime-secret\""), "runtime secret must be written only to the protected environment file");
  assert(calls.some((call) => call.command === "systemctl" && call.args.join(" ") === "daemon-reload"), "candidate start must refresh systemd configuration");
  assert(calls.some((call) => call.command === "systemctl" && call.args.join(" ") === "restart bloombouquet-luna-app@sample-app-web-B.service"), "candidate start must restart only the inactive candidate service");

  console.log("PASS  Luna A/B server runtime scenarios passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
