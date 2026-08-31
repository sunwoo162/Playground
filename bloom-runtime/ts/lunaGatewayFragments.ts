import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import {
  renderLunaGatewayConfig,
  type LunaGatewayRoute,
} from "./lunaGateway";

const DEFAULT_ROUTES_DIRECTORY = "/etc/nginx/bloombouquet-apps.d";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type CommandRunner = (command: string, args: string[]) => Promise<void>;

export type LunaGatewayFragmentActivation = {
  routePath: string;
  previousConfig: string | null;
  activeConfig: string;
};

export type ActivateLunaGatewayRouteFragmentInput = {
  route: LunaGatewayRoute;
  routesDirectory?: string;
  validateCandidateImpl?: (candidatePath: string) => Promise<void>;
  validateActiveImpl?: () => Promise<void>;
  reloadImpl?: () => Promise<void>;
};

export type RollbackLunaGatewayRouteFragmentInput = {
  activation: LunaGatewayFragmentActivation;
  validateActiveImpl?: () => Promise<void>;
  reloadImpl?: () => Promise<void>;
};

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
    `pid /tmp/luna-nginx-fragment-${process.pid}.pid;`,
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
  await runCommand("sudo", ["-n", "nginx", "-t"]);
}

async function reloadNginx() {
  await runCommand("sudo", ["-n", "systemctl", "reload", "nginx"]);
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function routePathFor(slug: string, routesDirectory: string) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error("Luna gateway fragment slug is invalid.");
  }
  const root = path.resolve(routesDirectory);
  return path.join(root, `${slug}.conf`);
}

async function restoreFragment(
  routePath: string,
  previousConfig: string | null,
) {
  if (previousConfig === null) {
    await fs.rm(routePath, { force: true });
    return;
  }
  const restorePath = `${routePath}.restore-${process.pid}-${Date.now()}`;
  await fs.writeFile(restorePath, previousConfig, { encoding: "utf8", mode: 0o644 });
  await fs.rename(restorePath, routePath);
}

export async function activateLunaGatewayRouteFragment(
  input: ActivateLunaGatewayRouteFragmentInput,
): Promise<LunaGatewayFragmentActivation> {
  const routesDirectory = path.resolve(input.routesDirectory ?? DEFAULT_ROUTES_DIRECTORY);
  const routePath = routePathFor(input.route.slug, routesDirectory);
  const candidatePath = `${routePath}.candidate-${process.pid}-${Date.now()}`;
  const rendered = renderLunaGatewayConfig([input.route]);
  const previousConfig = await readOptional(routePath);
  const validateCandidateImpl = input.validateCandidateImpl ?? validateCandidate;
  const validateActiveImpl = input.validateActiveImpl ?? validateActive;
  const reloadImpl = input.reloadImpl ?? reloadNginx;

  await fs.mkdir(routesDirectory, { recursive: true });
  await fs.writeFile(candidatePath, rendered, { encoding: "utf8", mode: 0o644 });

  let activated = false;
  try {
    await validateCandidateImpl(candidatePath);
    await fs.rename(candidatePath, routePath);
    activated = true;
    await validateActiveImpl();
    await reloadImpl();
    return {
      routePath,
      previousConfig,
      activeConfig: rendered,
    };
  } catch (error) {
    if (activated) {
      try {
        await restoreFragment(routePath, previousConfig);
        await validateActiveImpl();
        await reloadImpl();
      } catch {
        // Keep the original activation error. The next delivery retry will
        // re-render this slug from authoritative Registry state.
      }
    }
    throw error;
  } finally {
    await fs.rm(candidatePath, { force: true });
  }
}

export async function rollbackLunaGatewayRouteFragment(
  input: RollbackLunaGatewayRouteFragmentInput,
): Promise<void> {
  const validateActiveImpl = input.validateActiveImpl ?? validateActive;
  const reloadImpl = input.reloadImpl ?? reloadNginx;
  await restoreFragment(
    input.activation.routePath,
    input.activation.previousConfig,
  );
  await validateActiveImpl();
  await reloadImpl();
}
