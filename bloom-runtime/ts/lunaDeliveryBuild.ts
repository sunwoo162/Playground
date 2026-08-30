import { spawn } from "node:child_process";
import * as path from "node:path";

import type {
  LunaDeliveryManifest,
  LunaDeliveryRuntimeManifest,
} from "./lunaDeliveryManifest";

export type LunaDeliverySpawnOptions = {
  cwd: string;
  env: Record<string, string | undefined>;
};

export type LunaDeliverySpawn = (
  command: string,
  options: LunaDeliverySpawnOptions,
) => Promise<void>;

export type LunaDeliveryBuildRuntimeResult = {
  runtimeId: string;
  type: "static" | "server";
  workingDirectory: string;
  outputPath: string | null;
  startCommand: string | null;
};

export type LunaDeliveryBuildResult = {
  slug: string;
  gitSha: string;
  runtimes: LunaDeliveryBuildRuntimeResult[];
};

export type RunDeliveryBuildInput = {
  workspacePath: string;
  manifest: LunaDeliveryManifest;
  slug: string;
  gitSha: string;
  env: Record<string, string | undefined>;
  spawnImpl?: LunaDeliverySpawn;
};

function isInside(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function resolveInsideWorkspace(
  workspacePath: string,
  relativePath: string,
  label: string,
) {
  const root = path.resolve(workspacePath);
  const candidate = path.resolve(root, relativePath);
  if (!isInside(root, candidate)) {
    throw new Error(`${label} must stay inside the delivery workspace.`);
  }
  return candidate;
}

export function assertRequiredEnvironment(
  manifest: LunaDeliveryManifest,
  env: Record<string, string | undefined>,
): void {
  const missing = manifest.env.required.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.length === 0;
  });
  if (missing.length > 0) {
    throw new Error(`Missing required delivery environment: ${missing.join(", ")}`);
  }
}

const defaultSpawn: LunaDeliverySpawn = async (command, options) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
      cwd: options.cwd,
      env: options.env,
      shell: true,
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
          ? `Delivery build command terminated by signal ${signal}.`
          : `Delivery build command failed with exit code ${code ?? "unknown"}.`,
      ));
    });
  });
};

function runtimeResult(
  workspacePath: string,
  runtime: LunaDeliveryRuntimeManifest,
): LunaDeliveryBuildRuntimeResult {
  const workingDirectory = resolveInsideWorkspace(
    workspacePath,
    runtime.workingDirectory,
    `Runtime ${runtime.id} workingDirectory`,
  );
  const outputPath = runtime.outputDirectory
    ? resolveInsideWorkspace(
        workspacePath,
        path.relative(workspacePath, path.resolve(workingDirectory, runtime.outputDirectory)),
        `Runtime ${runtime.id} outputDirectory`,
      )
    : null;

  return {
    runtimeId: runtime.id,
    type: runtime.type,
    workingDirectory,
    outputPath,
    startCommand: runtime.startCommand ?? null,
  };
}

export async function runDeliveryBuild(
  input: RunDeliveryBuildInput,
): Promise<LunaDeliveryBuildResult> {
  if (input.slug !== input.manifest.slug) {
    throw new Error("Delivery slug must match the validated manifest slug.");
  }
  if (!input.gitSha.trim()) {
    throw new Error("Delivery git SHA is required.");
  }

  assertRequiredEnvironment(input.manifest, input.env);

  const workspacePath = path.resolve(input.workspacePath);
  const spawnImpl = input.spawnImpl ?? defaultSpawn;
  const buildEnv: Record<string, string | undefined> = {
    ...process.env,
    ...input.env,
    LUNA_PUBLIC_BASE_PATH: `/apps/${input.slug}/`,
  };

  const results: LunaDeliveryBuildRuntimeResult[] = [];
  for (const runtime of input.manifest.runtimes) {
    const result = runtimeResult(workspacePath, runtime);
    if (runtime.installCommand) {
      await spawnImpl(runtime.installCommand, {
        cwd: result.workingDirectory,
        env: buildEnv,
      });
    }
    await spawnImpl(runtime.buildCommand, {
      cwd: result.workingDirectory,
      env: buildEnv,
    });
    results.push(result);
  }

  return {
    slug: input.slug,
    gitSha: input.gitSha.trim(),
    runtimes: results,
  };
}
