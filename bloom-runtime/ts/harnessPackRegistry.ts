import type { ExecutableAgentRole } from "./types";
import type { HarnessEvidenceKind } from "./harnessContracts";

export type HarnessPack = {
  version: 1;
  id: string;
  requiredRoles: readonly ExecutableAgentRole[];
  stages: readonly string[];
  requiredEvidence: readonly HarnessEvidenceKind[];
};

export const BUG_FIX_PACK = {
  version: 1,
  id: "bug-fix",
  requiredRoles: ["debug-router", "code-review", "reviewer", "qa"],
  stages: ["reproduce", "root-cause", "regression-test", "fix", "review", "qa"],
  requiredEvidence: ["test", "file-change", "review"],
} as const satisfies HarnessPack;

export const FEATURE_DEVELOPMENT_PACK = {
  version: 1,
  id: "feature-development",
  requiredRoles: ["code-review", "reviewer", "qa"],
  stages: ["scope", "implement", "test", "review", "qa"],
  requiredEvidence: ["file-change", "test", "review"],
} as const satisfies HarnessPack;

export const CODE_REVIEW_PACK = {
  version: 1,
  id: "code-review",
  requiredRoles: ["code-review", "reviewer"],
  stages: ["inspect", "review", "verify"],
  requiredEvidence: ["review"],
} as const satisfies HarnessPack;

export const DOCUMENTATION_PACK = {
  version: 1,
  id: "documentation",
  requiredRoles: ["documentation", "reviewer"],
  stages: ["inspect", "document", "review"],
  requiredEvidence: ["file-change", "review"],
} as const satisfies HarnessPack;

export const DEPLOYMENT_PACK = {
  version: 1,
  id: "deployment",
  requiredRoles: ["devops", "qa"],
  stages: ["build", "deploy", "health-check", "e2e"],
  requiredEvidence: ["build", "deployment", "test"],
} as const satisfies HarnessPack;

const HARNESS_PACKS: readonly HarnessPack[] = [
  BUG_FIX_PACK, FEATURE_DEVELOPMENT_PACK, CODE_REVIEW_PACK, DOCUMENTATION_PACK, DEPLOYMENT_PACK,
];

export type ResolveHarnessPackInput = {
  explicitPack?: string;
  intent: string;
};

export type HarnessPackResolution = {
  pack: HarnessPack;
  reason: string;
};

const BUG_FIX_DIRECT_INTENT = /\b(bug|fix|crash|failure|regression)\b|(?:버그|오류|에러|크래시|회귀|고쳐|고치)/i;
const ENGLISH_ERROR_REPAIR_INTENT = /\b(?:handle|resolve|repair|debug|investigate|troubleshoot)\b[^/.\n!?]{0,80}\berror\b(?!\s+(?:states?|handling)\b|\s*[/,]\s*[^/,\s]+\s+states?\b)/i;
const DEPLOYMENT_INTENT = /\b(deploy|deployment|release|publish|promote|ship)\b|(?:배포|릴리즈|프로덕션)/i;
const CODE_REVIEW_INTENT = /\b(code\s*review|review\s+(?:this\s+)?(?:pr|pull request)|pr\s*review)\b|(?:코드\s*리뷰|PR\s*리뷰|리뷰해)/i;
const DOCUMENTATION_INTENT = /\b(documentation|docs?|readme)\b|(?:문서|README)/i;
const FEATURE_INTENT = /\b(feature|implement|create|add|build)\b|(?:기능\s*추가|추가해|구현해|만들어|개발해)/i;
const FEATURE_CREATION_INTENT = /\b(implement|create|add|build)\b|(?:기능\s*추가|추가해|구현해|만들어|개발해)/i;

export function findHarnessPackById(id: string): HarnessPack | null {
  return HARNESS_PACKS.find((pack) => pack.id === id) ?? null;
}

export function inferHarnessPack(intent: string): HarnessPackResolution | null {
  if (BUG_FIX_DIRECT_INTENT.test(intent) || ENGLISH_ERROR_REPAIR_INTENT.test(intent)) {
    return { pack: BUG_FIX_PACK, reason: "Selected from bug-fix intent keywords." };
  }
  if (DEPLOYMENT_INTENT.test(intent) && !FEATURE_CREATION_INTENT.test(intent)) {
    return { pack: DEPLOYMENT_PACK, reason: "Selected from deployment intent keywords." };
  }
  if (CODE_REVIEW_INTENT.test(intent)) {
    return { pack: CODE_REVIEW_PACK, reason: "Selected from code-review intent keywords." };
  }
  if (DOCUMENTATION_INTENT.test(intent)) {
    return { pack: DOCUMENTATION_PACK, reason: "Selected from documentation intent keywords." };
  }
  if (FEATURE_INTENT.test(intent)) {
    return { pack: FEATURE_DEVELOPMENT_PACK, reason: "Selected from feature-development intent keywords." };
  }
  return null;
}

export function resolveHarnessPack(
  input: ResolveHarnessPackInput,
): HarnessPackResolution {
  if (input.explicitPack !== undefined) {
    const pack = findHarnessPackById(input.explicitPack);
    if (!pack) {
      throw new Error(`Unknown Bloom Harness pack: ${input.explicitPack}`);
    }
    return {
      pack,
      reason: "Selected from explicit pack request.",
    };
  }

  const inferred = inferHarnessPack(input.intent);
  if (inferred) return inferred;

  throw new Error(`No Bloom Harness pack matched intent: ${input.intent}`);
}
