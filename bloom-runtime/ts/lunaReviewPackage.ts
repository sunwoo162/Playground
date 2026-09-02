import * as fs from "node:fs/promises";
import * as path from "node:path";

export type LunaReviewPackageInput = {
  projectName: string;
  projectSlug: string;
  repositoryFullName: string;
  commitSha: string;
  publicUrl: string;
  requiresAuth: boolean;
};

export type LunaReviewPackage = {
  schemaVersion: 1;
  project: {
    name: string;
    slug: string;
  };
  deployment: {
    publicUrl: string;
    commitSha: string;
  };
  repository: {
    fullName: string;
    url: string;
  };
  requiresAuth: boolean;
  generatedAt: string;
  reviewInstructions: string[];
};

function assertSafeInput(input: LunaReviewPackageInput) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.projectSlug)) {
    throw new Error("Review package projectSlug must be lowercase kebab-case.");
  }
  if (!/^[0-9a-f]{40}$/.test(input.commitSha)) {
    throw new Error("Review package commitSha must be an exact 40-character Git SHA.");
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repositoryFullName)) {
    throw new Error("Review package repositoryFullName must use owner/name format.");
  }
  const url = new URL(input.publicUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Review package publicUrl must be HTTP(S).");
  }
}

export function buildLunaReviewPackage(input: LunaReviewPackageInput): LunaReviewPackage {
  assertSafeInput(input);
  return {
    schemaVersion: 1,
    project: { name: input.projectName.trim(), slug: input.projectSlug },
    deployment: { publicUrl: input.publicUrl, commitSha: input.commitSha },
    repository: {
      fullName: input.repositoryFullName,
      url: `https://github.com/${input.repositoryFullName}`,
    },
    requiresAuth: input.requiresAuth,
    generatedAt: new Date().toISOString(),
    reviewInstructions: [
      "Send the deployed publicUrl to ChatGPT for the independent review handoff.",
      "Review the deployed URL and repository at the exact deployment commit.",
      "Check architecture, correctness, security, performance, accessibility, UX, tests, and deployment behavior.",
      "Return PASS, NEEDS_FIX, or BLOCKED with evidence-backed findings and concrete Luna repair instructions.",
    ],
  };
}

export async function writeLunaReviewPackage(
  workspacePath: string,
  input: LunaReviewPackageInput,
): Promise<{ path: string; package: LunaReviewPackage }> {
  const root = path.resolve(workspacePath);
  const directory = path.join(root, ".luna");
  const destination = path.join(directory, "review-package.json");
  const temporary = path.join(directory, `.review-package-${process.pid}-${Date.now()}.tmp`);
  const reviewPackage = buildLunaReviewPackage(input);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(reviewPackage, null, 2)}\n`, "utf8");
  await fs.rename(temporary, destination);
  return { path: destination, package: reviewPackage };
}
