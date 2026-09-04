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

export type ResolveHarnessPackInput = {
  explicitPack?: string;
  intent: string;
};

export type HarnessPackResolution = {
  pack: HarnessPack;
  reason: string;
};

const BUG_FIX_INTENT = /\b(bug|fix|error|crash|failure|regression)\b/i;

export function resolveHarnessPack(
  input: ResolveHarnessPackInput,
): HarnessPackResolution {
  if (input.explicitPack !== undefined) {
    if (input.explicitPack !== BUG_FIX_PACK.id) {
      throw new Error(`Unknown Bloom Harness pack: ${input.explicitPack}`);
    }
    return {
      pack: BUG_FIX_PACK,
      reason: "Selected from explicit pack request.",
    };
  }

  if (BUG_FIX_INTENT.test(input.intent)) {
    return {
      pack: BUG_FIX_PACK,
      reason: "Selected from bug-fix intent keywords.",
    };
  }

  throw new Error(`No Bloom Harness pack matched intent: ${input.intent}`);
}
