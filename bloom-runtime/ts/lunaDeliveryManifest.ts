import * as fs from "node:fs/promises";
import * as path from "node:path";

export type LunaDeliveryRuntimeManifest = {
  id: string;
  type: "static" | "server";
  workingDirectory: string;
  installCommand?: string;
  buildCommand: string;
  outputDirectory?: string;
  startCommand?: string;
  healthPath: string;
};

export type LunaDeliveryManifest = {
  schemaVersion: 1;
  slug: string;
  platform: "web";
  runtimes: LunaDeliveryRuntimeManifest[];
  env: { required: string[] };
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUNTIME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireNonEmptyString(value, label);
}

function normalizeRelativePath(value: unknown, label: string): string {
  const raw = requireNonEmptyString(value, label).split("\\").join("/");
  if (path.posix.isAbsolute(raw)) {
    throw new Error(`${label} must be relative.`);
  }

  const normalized = path.posix.normalize(raw);
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${label} must stay inside the project workspace.`);
  }
  return normalized === "" ? "." : normalized;
}

function parseRuntime(raw: unknown, index: number): LunaDeliveryRuntimeManifest {
  const value = requireRecord(raw, `runtimes[${index}]`);
  const id = requireNonEmptyString(value.id, `runtimes[${index}].id`);
  if (!RUNTIME_ID_PATTERN.test(id)) {
    throw new Error(`runtimes[${index}].id is invalid.`);
  }

  if (value.type !== "static" && value.type !== "server") {
    throw new Error(`runtimes[${index}].type must be static or server.`);
  }

  const workingDirectory = normalizeRelativePath(
    value.workingDirectory,
    `runtimes[${index}].workingDirectory`,
  );
  const installCommand = optionalNonEmptyString(
    value.installCommand,
    `runtimes[${index}].installCommand`,
  );
  const buildCommand = requireNonEmptyString(
    value.buildCommand,
    `runtimes[${index}].buildCommand`,
  );
  const healthPath = requireNonEmptyString(
    value.healthPath,
    `runtimes[${index}].healthPath`,
  );
  if (!healthPath.startsWith("/") || healthPath.startsWith("//")) {
    throw new Error(`runtimes[${index}].healthPath must be an absolute URL path.`);
  }

  const runtime: LunaDeliveryRuntimeManifest = {
    id,
    type: value.type,
    workingDirectory,
    ...(installCommand ? { installCommand } : {}),
    buildCommand,
    healthPath,
  };

  if (value.type === "static") {
    runtime.outputDirectory = normalizeRelativePath(
      value.outputDirectory,
      `runtimes[${index}].outputDirectory`,
    );
    const startCommand = optionalNonEmptyString(
      value.startCommand,
      `runtimes[${index}].startCommand`,
    );
    if (startCommand) runtime.startCommand = startCommand;
  } else {
    runtime.startCommand = requireNonEmptyString(
      value.startCommand,
      `runtimes[${index}].startCommand`,
    );
    const outputDirectory = value.outputDirectory === undefined
      ? undefined
      : normalizeRelativePath(
          value.outputDirectory,
          `runtimes[${index}].outputDirectory`,
        );
    if (outputDirectory) runtime.outputDirectory = outputDirectory;
  }

  return runtime;
}

export function parseLunaDeliveryManifest(raw: unknown): LunaDeliveryManifest {
  const value = requireRecord(raw, "manifest");

  if (value.schemaVersion !== 1) {
    throw new Error("schemaVersion must be exactly 1.");
  }

  const slug = requireNonEmptyString(value.slug, "slug");
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error("slug must use lowercase letters, digits, and single hyphen separators.");
  }

  if (value.platform !== "web") {
    throw new Error("platform must be web.");
  }

  if (!Array.isArray(value.runtimes) || value.runtimes.length === 0) {
    throw new Error("manifest must declare at least one runtime.");
  }

  const runtimes = value.runtimes.map(parseRuntime);
  const runtimeIds = new Set<string>();
  for (const runtime of runtimes) {
    if (runtimeIds.has(runtime.id)) {
      throw new Error(`duplicate runtime id: ${runtime.id}`);
    }
    runtimeIds.add(runtime.id);
  }

  const env = requireRecord(value.env, "env");
  if (!Array.isArray(env.required)) {
    throw new Error("env.required must be an array of environment variable names.");
  }

  const required = env.required.map((item, index) => {
    const name = requireNonEmptyString(item, `env.required[${index}]`);
    if (name.includes("=") || !ENV_NAME_PATTERN.test(name)) {
      throw new Error(`environment entry ${name} must contain a variable name only.`);
    }
    return name;
  });

  if (new Set(required).size !== required.length) {
    throw new Error("env.required contains duplicate environment names.");
  }

  return {
    schemaVersion: 1,
    slug,
    platform: "web",
    runtimes,
    env: { required },
  };
}

export async function loadLunaDeliveryManifest(workspacePath: string): Promise<LunaDeliveryManifest> {
  const manifestPath = path.join(workspacePath, "luna.project.json");
  const content = await fs.readFile(manifestPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`luna.project.json is not valid JSON: ${message}`);
  }
  return parseLunaDeliveryManifest(parsed);
}
