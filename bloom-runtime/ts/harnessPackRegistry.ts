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
  stages: [
    "reproduce",
    "root-cause",
    "regression-test",
    "fix",
    "review",
    "qa",
  ],
  requiredEvidence: ["test", "file-change", "review"],
} as const satisfies HarnessPack;

const HARNESS_PACKS: readonly HarnessPack[] = [BUG_FIX_PACK];
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

export function findHarnessPackById(id: string): HarnessPack | null {
  return HARNESS_PACKS.find((pack) => pack.id === id) ?? null;
}

export function inferHarnessPack(intent: string): HarnessPackResolution | null {
  if (!BUG_FIX_DIRECT_INTENT.test(intent) && !ENGLISH_ERROR_REPAIR_INTENT.test(intent)) return null;
  return {
    pack: BUG_FIX_PACK,
    reason: "Selected from bug-fix intent keywords.",
  };
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
