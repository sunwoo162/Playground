import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as path from "node:path";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUNTIME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_ENVIRONMENT_ROOT = "/run/bloombouquet/luna";
const RESERVED_ENVIRONMENT = new Set([
  "PORT",
  "LUNA_PUBLIC_BASE_PATH",
  "LUNA_DATA_DIR",
  "LUNA_RELEASE_PATH",
  "LUNA_START_COMMAND",
]);

export type LunaServerSlot = "A" | "B";
export type LunaPortProbe = (port: number) => Promise<boolean>;
export type LunaServerRuntimeSpawn = (
  command: string,
  args: string[],
) => Promise<void>;

export type RenderServerRuntimeEnvironmentInput = {
  slug: string;
  port: number;
  releasePath: string;
  dataDirectory: string;
  startCommand: string;
  env: Record<string, string | undefined>;
};

export type StartServerCandidateInput = RenderServerRuntimeEnvironmentInput & {
  runtimeId: string;
  slot: LunaServerSlot;
  environmentRoot?: string;
  portProbe?: LunaPortProbe;
  mkdirImpl?: (
    directory: string,
    options: { recursive: true; mode: number },
  ) => Promise<unknown>;
  writeFileImpl?: (
    filePath: string,
    content: string,
    options?: { encoding?: BufferEncoding; mode?: number },
  ) => Promise<unknown>;
  spawnImpl?: LunaServerRuntimeSpawn;
};

export type LunaServerCandidateResult = {
  instanceKey: string;
  serviceName: string;
  environmentFile: string;
  slot: LunaServerSlot;
  port: number;
};

function assertSlug(slug: string) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error("Luna server runtime slug is invalid.");
  }
}

function assertRuntimeId(runtimeId: string) {
  if (!RUNTIME_ID_PATTERN.test(runtimeId)) {
    throw new Error("Luna server runtime ID is invalid.");
  }
}

function assertPort(port: number) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Luna server runtime port ${port} is invalid.`);
  }
}

function assertRuntimeValue(value: string, label: string) {
  if (!value || /[\u0000\r\n]/.test(value)) {
    throw new Error(`${label} must be a non-empty single-line value.`);
  }
}

function quoteEnvironmentValue(value: string) {
  assertRuntimeValue(value, "Runtime environment value");
  return JSON.stringify(value);
}

export function chooseCandidateSlot(
  activeSlot: LunaServerSlot | null,
): LunaServerSlot {
  return activeSlot === "A" ? "B" : "A";
}

const defaultPortProbe: LunaPortProbe = async (port) => {
  assertPort(port);
  return await new Promise<boolean>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EADDRINUSE" || code === "EACCES") {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve(true);
      });
    });
  });
};

export async function assertPortAvailable(
  port: number,
  probeImpl: LunaPortProbe = defaultPortProbe,
): Promise<void> {
  assertPort(port);
  if (!(await probeImpl(port))) {
    throw new Error(`Registry-assigned Luna port ${port} is not available.`);
  }
}

export function renderServerRuntimeEnvironment(
  input: RenderServerRuntimeEnvironmentInput,
): string {
  assertSlug(input.slug);
  assertPort(input.port);
  if (!path.isAbsolute(input.releasePath)) {
    throw new Error("Luna server releasePath must be absolute.");
  }
  assertRuntimeValue(input.releasePath, "Luna server releasePath");
  if (!path.isAbsolute(input.dataDirectory)) {
    throw new Error("Luna server dataDirectory must be absolute.");
  }
  assertRuntimeValue(input.dataDirectory, "Luna server dataDirectory");
  assertRuntimeValue(input.startCommand, "Luna server startCommand");

  const values = new Map<string, string>();
  for (const [name, rawValue] of Object.entries(input.env).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      throw new Error(`Invalid Luna runtime environment name: ${name}`);
    }
    if (RESERVED_ENVIRONMENT.has(name)) {
      throw new Error(`Luna runtime environment ${name} is reserved.`);
    }
    if (rawValue === undefined) continue;
    assertRuntimeValue(rawValue, `Luna runtime environment ${name}`);
    values.set(name, rawValue);
  }

  values.set("PORT", String(input.port));
  values.set("LUNA_PUBLIC_BASE_PATH", `/apps/${input.slug}/`);
  values.set("LUNA_DATA_DIR", input.dataDirectory);
  values.set("LUNA_RELEASE_PATH", input.releasePath);
  values.set("LUNA_START_COMMAND", input.startCommand);

  return [...values.entries()]
    .map(([name, value]) => `${name}=${quoteEnvironmentValue(value)}`)
    .join("\n") + "\n";
}

const defaultSpawn: LunaServerRuntimeSpawn = async (command, args) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(
        signal
          ? `${command} terminated by signal ${signal}.`
          : `${command} failed with exit code ${code ?? "unknown"}.`,
      ));
    });
  });
};

export async function startServerCandidate(
  input: StartServerCandidateInput,
): Promise<LunaServerCandidateResult> {
  assertSlug(input.slug);
  assertRuntimeId(input.runtimeId);
  if (input.slot !== "A" && input.slot !== "B") {
    throw new Error("Luna server runtime slot must be A or B.");
  }

  await assertPortAvailable(input.port, input.portProbe ?? defaultPortProbe);

  const environmentRoot = path.resolve(
    input.environmentRoot ?? DEFAULT_ENVIRONMENT_ROOT,
  );
  const instanceKey = `${input.slug}-${input.runtimeId}-${input.slot}`;
  const serviceName = `bloombouquet-luna-app@${instanceKey}.service`;
  const environmentFile = path.join(environmentRoot, `${instanceKey}.env`);
  const environment = renderServerRuntimeEnvironment(input);
  const mkdirImpl = input.mkdirImpl ?? fs.mkdir;
  const writeFileImpl = input.writeFileImpl ?? fs.writeFile;
  const spawnImpl = input.spawnImpl ?? defaultSpawn;

  await mkdirImpl(input.dataDirectory, { recursive: true, mode: 0o770 });
  await mkdirImpl(environmentRoot, { recursive: true, mode: 0o700 });
  await writeFileImpl(environmentFile, environment, {
    encoding: "utf8",
    mode: 0o600,
  });
  if (!input.writeFileImpl) {
    await fs.chmod(environmentFile, 0o600);
  }

  await spawnImpl("systemctl", ["daemon-reload"]);
  await spawnImpl("systemctl", ["restart", serviceName]);

  return {
    instanceKey,
    serviceName,
    environmentFile,
    slot: input.slot,
    port: input.port,
  };
}
