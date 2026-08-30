import * as fs from "node:fs/promises";
import * as path from "node:path";

const DEFAULT_APPS_ROOT = "/srv/bloombouquet/apps";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA_PATTERN = /^[0-9a-f]{7,64}$/;

export type LunaStaticReleaseLocation = {
  appRoot: string;
  releasePath: string;
  currentPath: string;
};

export type InstallStaticCandidateInput = {
  slug: string;
  sha: string;
  outputPath: string;
  appsRoot?: string;
};

export type ActivateStaticReleaseInput = {
  slug: string;
  sha: string;
  appsRoot?: string;
};

export type RollbackStaticReleaseInput = {
  slug: string;
  previousSha: string;
  appsRoot?: string;
};

export type LunaStaticActivationResult = LunaStaticReleaseLocation & {
  activeSha: string;
  previousSha: string | null;
};

function validateIdentity(slug: string, sha: string) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error("Static release slug is invalid.");
  }
  if (!SHA_PATTERN.test(sha)) {
    throw new Error("Static release SHA is invalid.");
  }
}

function releaseLocation(
  slug: string,
  sha: string,
  appsRoot = DEFAULT_APPS_ROOT,
): LunaStaticReleaseLocation {
  validateIdentity(slug, sha);
  const appRoot = path.join(path.resolve(appsRoot), slug);
  return {
    appRoot,
    releasePath: path.join(appRoot, "releases", sha),
    currentPath: path.join(appRoot, "current"),
  };
}

function isInside(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function assertSafeOutputTree(outputPath: string) {
  const root = await fs.realpath(outputPath);
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) {
    throw new Error("Static build output must be a directory.");
  }

  const walk = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        let target: string;
        try {
          target = await fs.realpath(fullPath);
        } catch {
          throw new Error(`Static build output contains an invalid symlink: ${entry.name}`);
        }
        if (!isInside(root, target)) {
          throw new Error(`Static build output symlink escapes outside output root: ${entry.name}`);
        }
        continue;
      }
      if (entry.isDirectory()) {
        await walk(fullPath);
      }
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

async function readActiveSha(currentPath: string): Promise<string | null> {
  try {
    const target = await fs.readlink(currentPath);
    const sha = path.basename(target);
    return SHA_PATTERN.test(sha) ? sha : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Static current path must be a managed symlink.");
  }
}

export async function installStaticCandidate(
  input: InstallStaticCandidateInput,
): Promise<LunaStaticReleaseLocation> {
  const location = releaseLocation(input.slug, input.sha, input.appsRoot);
  const source = await assertSafeOutputTree(input.outputPath);
  await fs.mkdir(path.dirname(location.releasePath), { recursive: true });

  if (await existsDirectory(location.releasePath)) {
    return location;
  }

  const stagingPath = `${location.releasePath}.next-${process.pid}-${Date.now()}`;
  await fs.rm(stagingPath, { recursive: true, force: true });
  try {
    await fs.cp(source, stagingPath, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
    });
    await fs.rename(stagingPath, location.releasePath);
  } catch (error) {
    await fs.rm(stagingPath, { recursive: true, force: true });
    if (await existsDirectory(location.releasePath)) {
      return location;
    }
    throw error;
  }

  return location;
}

export async function activateStaticRelease(
  input: ActivateStaticReleaseInput,
): Promise<LunaStaticActivationResult> {
  const location = releaseLocation(input.slug, input.sha, input.appsRoot);
  if (!(await existsDirectory(location.releasePath))) {
    throw new Error(`Static release ${input.sha} is not installed.`);
  }

  await fs.mkdir(location.appRoot, { recursive: true });
  const previousSha = await readActiveSha(location.currentPath);
  const nextPath = `${location.currentPath}.next`;
  await fs.rm(nextPath, { force: true });
  await fs.symlink(path.join("releases", input.sha), nextPath, "dir");
  try {
    await fs.rename(nextPath, location.currentPath);
  } catch (error) {
    await fs.rm(nextPath, { force: true });
    throw error;
  }

  return {
    ...location,
    activeSha: input.sha,
    previousSha,
  };
}

export async function rollbackStaticRelease(
  input: RollbackStaticReleaseInput,
): Promise<LunaStaticActivationResult> {
  return activateStaticRelease({
    slug: input.slug,
    sha: input.previousSha,
    appsRoot: input.appsRoot,
  });
}
