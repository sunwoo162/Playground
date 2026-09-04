import * as fs from "node:fs";
import * as path from "node:path";
import { parse } from "yaml";

import {
  assertHarnessContractVersion,
  type HarnessPermissionMode,
  type HarnessProjectManifest,
} from "./harnessContracts";

export type HarnessProjectManifestResolution = {
  source: "explicit" | "inferred";
  path: string;
  manifest: HarnessProjectManifest;
};

const COMMAND_KEYS = ["install", "lint", "typecheck", "test", "build"] as const;
const WRITE_MODES = new Set<HarnessPermissionMode>(["deny", "read", "write"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown, label: string, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Bloom Harness ${label} must be a non-empty string.`);
  }
  return value;
}

function readBoolean(value: unknown, label: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new Error(`Bloom Harness ${label} must be boolean.`);
  }
  return value;
}

function readPermission(
  value: unknown,
  label: string,
  allowed: ReadonlySet<string>,
  fallback: HarnessPermissionMode | "write",
): HarnessPermissionMode | "write" {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`Bloom Harness ${label} has an invalid permission value.`);
  }
  return value as HarnessPermissionMode | "write";
}

function createInferredManifest(): HarnessProjectManifest {
  return {
    version: 1,
    project: { type: "unknown" },
    commands: {},
    git: { baseBranch: "main", branchPrefix: "agent/" },
    quality: { requireReview: true, requireTests: true, requireBuild: true },
    permissions: {
      filesystem: "deny",
      git: "deny",
      github: "deny",
      deploy: "deny",
    },
  };
}

function parseExplicitManifest(input: unknown): HarnessProjectManifest {
  if (!isRecord(input)) {
    throw new Error("Bloom Harness project manifest root must be an object.");
  }

  if (typeof input.version !== "number") {
    throw new Error("Bloom Harness manifest version must be numeric.");
  }
  assertHarnessContractVersion(input.version);

  if (!isRecord(input.project)) {
    throw new Error("Bloom Harness project must be an object.");
  }
  const projectType = readNonEmptyString(input.project.type, "project.type");

  const commandsInput = input.commands === undefined ? {} : input.commands;
  if (!isRecord(commandsInput)) {
    throw new Error("Bloom Harness commands must be an object.");
  }
  const commands: HarnessProjectManifest["commands"] = {};
  for (const key of COMMAND_KEYS) {
    const value = commandsInput[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Bloom Harness commands.${key} must be a non-empty string.`);
    }
    commands[key] = value;
  }

  const gitInput = input.git === undefined ? {} : input.git;
  if (!isRecord(gitInput)) {
    throw new Error("Bloom Harness git must be an object.");
  }
  const baseBranch = readNonEmptyString(gitInput.baseBranch, "git.baseBranch", "main");
  const branchPrefix = readNonEmptyString(gitInput.branchPrefix, "git.branchPrefix", "agent/");

  const qualityInput = input.quality === undefined ? {} : input.quality;
  if (!isRecord(qualityInput)) {
    throw new Error("Bloom Harness quality must be an object.");
  }
  const quality = {
    requireReview: readBoolean(qualityInput.requireReview, "quality.requireReview", true),
    requireTests: readBoolean(qualityInput.requireTests, "quality.requireTests", true),
    requireBuild: readBoolean(qualityInput.requireBuild, "quality.requireBuild", true),
  };

  const permissionsInput = input.permissions === undefined ? {} : input.permissions;
  if (!isRecord(permissionsInput)) {
    throw new Error("Bloom Harness permissions must be an object.");
  }
  const deployModes = new Set(["deny", "write"]);
  const permissions: HarnessProjectManifest["permissions"] = {
    filesystem: readPermission(
      permissionsInput.filesystem,
      "permissions.filesystem",
      WRITE_MODES,
      "deny",
    ) as HarnessPermissionMode,
    git: readPermission(permissionsInput.git, "permissions.git", WRITE_MODES, "deny") as HarnessPermissionMode,
    github: readPermission(
      permissionsInput.github,
      "permissions.github",
      WRITE_MODES,
      "deny",
    ) as HarnessPermissionMode,
    deploy: readPermission(
      permissionsInput.deploy,
      "permissions.deploy",
      deployModes,
      "deny",
    ) as "deny" | "write",
  };

  return {
    version: 1,
    project: { type: projectType },
    commands,
    git: { baseBranch, branchPrefix },
    quality,
    permissions,
  };
}

export function loadHarnessProjectManifest(
  repoRoot: string,
): HarnessProjectManifestResolution {
  const manifestPath = path.join(repoRoot, ".bloom", "project.yaml");
  if (!fs.existsSync(manifestPath)) {
    return {
      source: "inferred",
      path: manifestPath,
      manifest: createInferredManifest(),
    };
  }

  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed = parse(raw);
  return {
    source: "explicit",
    path: manifestPath,
    manifest: parseExplicitManifest(parsed),
  };
}
