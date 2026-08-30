import * as fs from "node:fs/promises";
import * as path from "node:path";

const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SEMANTIC_LIKE_VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const MAX_PACKAGE_VERSION_LENGTH = 80;

export type LunaReleaseIdentityInput = {
  gitSha: string;
  packageVersion?: string | null;
};

function normalizePackageVersion(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_PACKAGE_VERSION_LENGTH) return undefined;
  return SEMANTIC_LIKE_VERSION_PATTERN.test(normalized) ? normalized : undefined;
}

function validateGitSha(gitSha: string) {
  if (!GIT_SHA_PATTERN.test(gitSha)) {
    throw new Error("Luna release identity requires an exact 40-character lowercase Git SHA.");
  }
}

export function deriveLunaReleaseVersion(input: LunaReleaseIdentityInput): string {
  validateGitSha(input.gitSha);
  const shortSha = input.gitSha.slice(0, 12);
  const packageVersion = normalizePackageVersion(input.packageVersion);
  return packageVersion
    ? `${packageVersion}+${shortSha}`
    : `git-${shortSha}`;
}

export async function readLunaPackageVersion(
  workspacePath: string,
): Promise<string | undefined> {
  const normalizedWorkspace = workspacePath.trim();
  if (!normalizedWorkspace) {
    throw new Error("Luna release workspace path is required.");
  }

  const packagePath = path.join(path.resolve(normalizedWorkspace), "package.json");
  try {
    const stat = await fs.lstat(packagePath);
    if (!stat.isFile()) return undefined;

    const content = await fs.readFile(packagePath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return undefined;
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return normalizePackageVersion((parsed as Record<string, unknown>).version);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}
