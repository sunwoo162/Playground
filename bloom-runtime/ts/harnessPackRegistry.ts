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

const BUG_FIX_REPAIR_ACTION = /\b(fix|repair|resolve|debug)\b|(?:고쳐|고치|수정해|수정하|해결해|해결하)/i;
const BUG_FIX_SYMPTOM = /\b(bug|error|crash|failure|regression)\b|(?:버그|오류|에러|크래시|회귀)/i;
const FEATURE_CONSTRUCTION_INTENT = /^(?:\[[^\]\r\n]{1,80}\]\s*)?(?:please\s+)?(?:build|create|implement|add|ship|develop|design)\b/i;

export function findHarnessPackById(id: string): HarnessPack | null {
  return HARNESS_PACKS.find((pack) => pack.id === id) ?? null;
}

export function inferHarnessPack(intent: string): HarnessPackResolution | null {
  const normalized = intent.trim();
  if (BUG_FIX_REPAIR_ACTION.test(normalized)) {
    return {
      pack: BUG_FIX_PACK,
      reason: "Selected from explicit bug-fix repair intent.",
    };
  }
  if (!BUG_FIX_SYMPTOM.test(normalized) || FEATURE_CONSTRUCTION_INTENT.test(normalized)) return null;
  return {
    pack: BUG_FIX_PACK,
    reason: "Selected from bug-fix symptom intent.",
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
