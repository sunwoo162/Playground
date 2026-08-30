import {
  parseLunaDeliveryManifest,
  type LunaDeliveryManifest,
} from "./lunaDeliveryManifest";

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

const base = (): LunaDeliveryManifest => ({
  schemaVersion: 1,
  slug: "sample-app",
  platform: "web",
  runtimes: [
    {
      id: "web",
      type: "static",
      workingDirectory: ".",
      installCommand: "pnpm install --frozen-lockfile",
      buildCommand: "pnpm build",
      outputDirectory: "dist",
      healthPath: "/",
    },
  ],
  env: { required: ["PUBLIC_API_URL"] },
});

const parsed = parseLunaDeliveryManifest(base());
assert(parsed.slug === "sample-app", "valid manifest keeps the slug");
assert(parsed.runtimes[0]?.type === "static", "valid static runtime parses");
assert(parsed.runtimes[0]?.workingDirectory === ".", "root workingDirectory normalizes to dot");

assertThrows(
  () => parseLunaDeliveryManifest({ ...base(), slug: "Bad Slug" }),
  /slug/i,
  "invalid slug must be rejected",
);
assertThrows(
  () => parseLunaDeliveryManifest({ ...base(), schemaVersion: 2 }),
  /schemaVersion/i,
  "unsupported schema must be rejected",
);
assertThrows(
  () => parseLunaDeliveryManifest({ ...base(), platform: "desktop" }),
  /platform/i,
  "non-web platform must be rejected",
);
assertThrows(
  () => parseLunaDeliveryManifest({
    ...base(),
    runtimes: [{ ...base().runtimes[0], workingDirectory: "/tmp/outside" }],
  }),
  /workingDirectory/i,
  "absolute working directory must be rejected",
);
assertThrows(
  () => parseLunaDeliveryManifest({
    ...base(),
    runtimes: [{ ...base().runtimes[0], workingDirectory: "../outside" }],
  }),
  /workingDirectory/i,
  "working-directory traversal must be rejected",
);
assertThrows(
  () => parseLunaDeliveryManifest({
    ...base(),
    runtimes: [base().runtimes[0], { ...base().runtimes[0] }],
  }),
  /duplicate.*runtime|runtime.*duplicate/i,
  "duplicate runtime IDs must be rejected",
);
assertThrows(
  () => parseLunaDeliveryManifest({
    ...base(),
    runtimes: [{
      id: "web",
      type: "static",
      workingDirectory: ".",
      buildCommand: "pnpm build",
      healthPath: "/",
    }],
  }),
  /outputDirectory/i,
  "static runtime needs outputDirectory",
);
assertThrows(
  () => parseLunaDeliveryManifest({
    ...base(),
    runtimes: [{
      id: "api",
      type: "server",
      workingDirectory: ".",
      buildCommand: "pnpm build",
      healthPath: "/health",
    }],
  }),
  /startCommand/i,
  "server runtime needs startCommand",
);
assertThrows(
  () => parseLunaDeliveryManifest({ ...base(), env: { required: ["API_KEY=secret"] } }),
  /env|environment/i,
  "manifest env list must contain names only",
);
assertThrows(
  () => parseLunaDeliveryManifest({ ...base(), runtimes: [] }),
  /runtime/i,
  "manifest must declare at least one runtime",
);

console.log("PASS  Luna delivery manifest validation scenarios passed.");
