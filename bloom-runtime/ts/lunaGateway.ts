import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUNTIME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_GENERATED_CONFIG = "/etc/nginx/bloombouquet-apps.generated.conf";
const EMPTY_GENERATED_CONFIG = "# MACHINE-OWNED: Luna generated app routes\n";

export type LunaStaticGatewayRoute = {
  slug: string;
  runtimeId: string;
  type: "static";
  releaseRoot: string;
};

export type LunaServerGatewayRoute = {
  slug: string;
  runtimeId: string;
  type: "server";
  activePort: number;
};

export type LunaGatewayRoute = LunaStaticGatewayRoute | LunaServerGatewayRoute;

export type ActivateLunaGatewayConfigInput = {
  routes: LunaGatewayRoute[];
  generatedConfigPath?: string;
  validateCandidateImpl?: (candidatePath: string) => Promise<void>;
  validateActiveImpl?: () => Promise<void>;
  reloadImpl?: () => Promise<void>;
};

export type LunaGatewayActivation = {
  generatedConfigPath: string;
  routeCount: number;
};

type CommandRunner = (command: string, args: string[]) => Promise<void>;

function assertSafeIdentity(value: string, pattern: RegExp, label: string) {
  if (!pattern.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
}

function assertPort(port: number) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Luna gateway active port ${port} is invalid.`);
  }
}

function normalizeReleaseRoot(releaseRoot: string) {
  if (!path.posix.isAbsolute(releaseRoot) || /[\s;{}\r\n]/.test(releaseRoot)) {
    throw new Error("Luna static gateway releaseRoot is invalid.");
  }
  return releaseRoot.replace(/\/+$/, "");
}

function assertGeneratedConfigPath(configPath: string) {
  if (!path.isAbsolute(configPath) || /[\u0000\r\n]/.test(configPath)) {
    throw new Error("Luna generated gateway path must be a safe absolute path.");
  }
}

function renderStaticRoute(route: LunaStaticGatewayRoute) {
  const releaseRoot = normalizeReleaseRoot(route.releaseRoot);
  return [
    `location = /apps/${route.slug} {`,
    `    return 308 /apps/${route.slug}/;`,
    "}",
    "",
    `location ^~ /apps/${route.slug}/ {`,
    `    alias ${releaseRoot}/current/;`,
    "    try_files $uri $uri/ =404;",
    "}",
  ].join("\n");
}

function renderServerRoute(route: LunaServerGatewayRoute) {
  assertPort(route.activePort);
  return [
    `location = /apps/${route.slug} {`,
    `    return 308 /apps/${route.slug}/;`,
    "}",
    "",
    `location ^~ /apps/${route.slug}/ {`,
    `    proxy_pass http://127.0.0.1:${route.activePort}/;`,
    "    proxy_http_version 1.1;",
    "    proxy_set_header Upgrade $http_upgrade;",
    "    proxy_set_header Connection 'upgrade';",
    "    proxy_set_header Host $host;",
    "    proxy_set_header X-Forwarded-Host $host;",
    "    proxy_set_header X-Forwarded-Proto https;",
    `    proxy_set_header X-Forwarded-Prefix /apps/${route.slug};`,
    "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    "    proxy_set_header X-Real-IP $remote_addr;",
    "    proxy_cache_bypass $http_upgrade;",
    "}",
  ].join("\n");
}

export function renderLunaGatewayConfig(routes: LunaGatewayRoute[]): string {
  const ordered = [...routes].sort((left, right) =>
    left.slug.localeCompare(right.slug) || left.runtimeId.localeCompare(right.runtimeId),
  );
  const slugs = new Set<string>();
  const blocks: string[] = [];

  for (const route of ordered) {
    assertSafeIdentity(route.slug, SLUG_PATTERN, "Luna gateway slug");
    assertSafeIdentity(route.runtimeId, RUNTIME_ID_PATTERN, "Luna gateway runtime ID");
    if (slugs.has(route.slug)) {
      throw new Error(`Duplicate Luna public slug: ${route.slug}`);
    }
    slugs.add(route.slug);
    blocks.push(route.type === "static" ? renderStaticRoute(route) : renderServerRoute(route));
  }

  return [
    "# MACHINE-OWNED: Luna generated app routes",
    "# Do not edit manually. The Luna delivery controller replaces this file atomically.",
    ...(blocks.length > 0 ? ["", blocks.join("\n\n")] : []),
    "",
  ].join("\n");
}

const runCommand: CommandRunner = async (command, args) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: "inherit" });
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

async function validateCandidate(candidatePath: string) {
  const validationPath = `${candidatePath}.nginx-test.conf`;
  const validationConfig = [
    `pid /tmp/luna-nginx-validation-${process.pid}.pid;`,
    "error_log stderr;",
    "events {}",
    "http {",
    "    access_log off;",
    "    server {",
    "        listen 127.0.0.1:65534;",
    "        server_name _;",
    `        include ${candidatePath};`,
    "    }",
    "}",
    "",
  ].join("\n");

  await fs.writeFile(validationPath, validationConfig, { encoding: "utf8", mode: 0o600 });
  try {
    await runCommand("nginx", ["-t", "-c", validationPath]);
  } finally {
    await fs.rm(validationPath, { force: true });
  }
}

async function validateActive() {
  await runCommand("sudo", ["nginx", "-t"]);
}

async function reloadNginx() {
  await runCommand("sudo", ["systemctl", "reload", "nginx"]);
}

async function readPreviousConfig(configPath: string) {
  try {
    return await fs.readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return EMPTY_GENERATED_CONFIG;
    }
    throw error;
  }
}

export async function activateLunaGatewayConfig(
  input: ActivateLunaGatewayConfigInput,
): Promise<LunaGatewayActivation> {
  const generatedConfigPath = path.resolve(
    input.generatedConfigPath ?? DEFAULT_GENERATED_CONFIG,
  );
  assertGeneratedConfigPath(generatedConfigPath);

  const directory = path.dirname(generatedConfigPath);
  const nonce = `${process.pid}-${Date.now()}`;
  const candidatePath = `${generatedConfigPath}.candidate-${nonce}`;
  const backupPath = `${generatedConfigPath}.previous-${nonce}`;
  const rendered = renderLunaGatewayConfig(input.routes);
  const validateCandidateImpl = input.validateCandidateImpl ?? validateCandidate;
  const validateActiveImpl = input.validateActiveImpl ?? validateActive;
  const reloadImpl = input.reloadImpl ?? reloadNginx;
  const previousConfig = await readPreviousConfig(generatedConfigPath);

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(candidatePath, rendered, { encoding: "utf8", mode: 0o644 });
  await fs.writeFile(backupPath, previousConfig, { encoding: "utf8", mode: 0o644 });

  let activated = false;
  try {
    await validateCandidateImpl(candidatePath);
    await fs.rename(candidatePath, generatedConfigPath);
    activated = true;
    await validateActiveImpl();
    await reloadImpl();
    await fs.rm(backupPath, { force: true });
    return {
      generatedConfigPath,
      routeCount: input.routes.length,
    };
  } catch (error) {
    if (activated) {
      try {
        await fs.rename(backupPath, generatedConfigPath);
      } catch {
        await fs.writeFile(generatedConfigPath, previousConfig, { encoding: "utf8", mode: 0o644 });
      }
      try {
        await validateActiveImpl();
        await reloadImpl();
      } catch {
        // Preserve the original delivery error. The restored file remains authoritative
        // for the next operator/controller retry even if the recovery reload also fails.
      }
    }
    throw error;
  } finally {
    await fs.rm(candidatePath, { force: true });
    await fs.rm(backupPath, { force: true });
  }
}
