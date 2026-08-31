import * as fs from "node:fs/promises";
import * as path from "node:path";

const DEFAULT_APPS_ROOT = "/srv/bloombouquet/apps";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUNTIME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

export type LunaServerReleaseLocation = {
  appRoot: string;
  releaseRoot: string;
  releasePath: string;
};

export type InstallServerCandidateReleaseInput = {
  slug: string;
  runtimeId: string;
  sha: string;
  sourcePath: string;
  appsRoot?: string;
};

function assertIdentity(input: InstallServerCandidateReleaseInput) {
  if (!SLUG_PATTERN.test(input.slug)) {
    throw new Error("Luna server release slug is invalid.");
  }
  if (!RUNTIME_ID_PATTERN.test(input.runtimeId)) {
    throw new Error("Luna server release runtime ID is invalid.");
  }
  if (!SHA_PATTERN.test(input.sha)) {
    throw new Error("Luna server release SHA must be an exact 40-character lowercase Git SHA.");
  }
}

function isInside(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function assertSafeSourceTree(sourcePath: string) {
  const root = await fs.realpath(sourcePath);
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) {
    throw new Error("Luna server release source must be a directory.");
  }

  const walk = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        let target: string;
        try {
          target = await fs.realpath(fullPath);
        } catch {
          throw new Error(`Luna server release contains an invalid symlink: ${entry.name}`);
        }
        if (!isInside(root, target)) {
          throw new Error(`Luna server release symlink escapes outside source root: ${entry.name}`);
        }
        continue;
      }
      if (entry.isDirectory()) await walk(fullPath);
    }
  };

  await walk(root);
  return root;
}

async function existsDirectory(directory: string) {
  try {
    return (await fs.stat(directory)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function installServerCandidateRelease(
  input: InstallServerCandidateReleaseInput,
): Promise<LunaServerReleaseLocation> {
  assertIdentity(input);
  const source = await assertSafeSourceTree(input.sourcePath);
  const appRoot = path.join(path.resolve(input.appsRoot ?? DEFAULT_APPS_ROOT), input.slug);
  const releaseRoot = path.join(appRoot, "releases", input.sha);
  const releasePath = path.join(releaseRoot, input.runtimeId);
  await fs.mkdir(releaseRoot, { recursive: true });

  if (await existsDirectory(releasePath)) {
    return { appRoot, releaseRoot, releasePath };
  }

  const stagingPath = `${releasePath}.next-${process.pid}-${Date.now()}`;
  await fs.rm(stagingPath, { recursive: true, force: true });
  try {
    await fs.cp(source, stagingPath, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
      filter: (src) => path.basename(src) !== ".git",
    });
    await fs.rename(stagingPath, releasePath);
  } catch (error) {
    await fs.rm(stagingPath, { recursive: true, force: true });
    if (await existsDirectory(releasePath)) {
      return { appRoot, releaseRoot, releasePath };
    }
    throw error;
  }

  return { appRoot, releaseRoot, releasePath };
}
