import {
  HARNESS_EVIDENCE_KINDS,
  type HarnessEvidenceKind,
} from "./harnessContracts";
import {
  findHarnessPackById,
  inferHarnessPack,
  type HarnessPack,
} from "./harnessPackRegistry";
import {
  AGENT_ROLES,
  type ExecutableAgentRole,
} from "./types";

export type HarnessPackSnapshot = {
  version: 1;
  id: string;
  requiredRoles: ExecutableAgentRole[];
  stages: string[];
  requiredEvidence: HarnessEvidenceKind[];
};

export type HarnessPackBinding = {
  version: 1;
  status: "bound" | "unbound" | "blocked";
  source: "explicit" | "intent" | "none";
  packId: string | null;
  packVersion: 1 | null;
  reason: string;
  pack: HarnessPackSnapshot | null;
};

export type ResolveHarnessPackBindingInput = {
  intent: string;
  explicitPack?: string | null;
};

const EXECUTABLE_ROLES = new Set<ExecutableAgentRole>(
  AGENT_ROLES.filter((role): role is ExecutableAgentRole => role !== "pm"),
);
const EVIDENCE_KINDS = new Set<HarnessEvidenceKind>(HARNESS_EVIDENCE_KINDS);

function snapshotPack(pack: HarnessPack): HarnessPackSnapshot {
  return {
    version: pack.version,
    id: pack.id,
    requiredRoles: [...pack.requiredRoles],
    stages: [...pack.stages],
    requiredEvidence: [...pack.requiredEvidence],
  };
}

function bindingWithoutPack(
  status: "unbound" | "blocked",
  source: "explicit" | "none",
  reason: string,
): HarnessPackBinding {
  return {
    version: 1,
    status,
    source,
    packId: null,
    packVersion: null,
    reason,
    pack: null,
  };
}

function boundBinding(
  pack: HarnessPack,
  source: "explicit" | "intent",
  reason: string,
): HarnessPackBinding {
  return {
    version: 1,
    status: "bound",
    source,
    packId: pack.id,
    packVersion: pack.version,
    reason,
    pack: snapshotPack(pack),
  };
}

export function resolveHarnessPackBinding(
  input: ResolveHarnessPackBindingInput,
): HarnessPackBinding {
  if (input.explicitPack !== undefined && input.explicitPack !== null) {
    const pack = findHarnessPackById(input.explicitPack);
    if (!pack) {
      return bindingWithoutPack(
        "blocked",
        "explicit",
        `Unknown Bloom Harness pack: ${input.explicitPack}`,
      );
    }
    return boundBinding(pack, "explicit", "Selected from explicit pack request.");
  }

  const inferred = inferHarnessPack(input.intent);
  if (inferred) {
    return boundBinding(inferred.pack, "intent", inferred.reason);
  }

  return bindingWithoutPack(
    "unbound",
    "none",
    "No Bloom Harness pack matched this project request.",
  );
}

export function legacyUnboundHarnessPackBinding(reason: string): HarnessPackBinding {
  if (!reason.trim()) {
    throw new Error("Bloom Harness legacy binding reason is required.");
  }
  return bindingWithoutPack("unbound", "none", reason);
}
function validatePackSnapshot(value: unknown): HarnessPackSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("Bloom Harness pack snapshot must be an object.");
  }
  const pack = value as Partial<HarnessPackSnapshot>;
  if (pack.version !== 1) {
    throw new Error(`Unsupported Bloom Harness pack snapshot version: ${String(pack.version)}`);
  }
  if (typeof pack.id !== "string" || !pack.id.trim()) {
    throw new Error("Bloom Harness pack snapshot id is required.");
  }
  if (!Array.isArray(pack.requiredRoles)
      || pack.requiredRoles.some((role) => !EXECUTABLE_ROLES.has(role as ExecutableAgentRole))) {
    throw new Error("Bloom Harness pack snapshot contains an invalid required role.");
  }
  if (!Array.isArray(pack.stages)
      || pack.stages.some((stage) => typeof stage !== "string" || !stage.trim())) {
    throw new Error("Bloom Harness pack snapshot stages must be non-empty strings.");
  }
  if (!Array.isArray(pack.requiredEvidence)
      || pack.requiredEvidence.some((kind) => !EVIDENCE_KINDS.has(kind as HarnessEvidenceKind))) {
    throw new Error("Bloom Harness pack snapshot contains an invalid evidence kind.");
  }

  return {
    version: 1,
    id: pack.id,
    requiredRoles: [...pack.requiredRoles] as ExecutableAgentRole[],
    stages: [...pack.stages] as string[],
    requiredEvidence: [...pack.requiredEvidence] as HarnessEvidenceKind[],
  };
}

export function validateHarnessPackBinding(value: unknown): HarnessPackBinding {
  if (!value || typeof value !== "object") {
    throw new Error("Bloom Harness pack binding must be an object.");
  }
  const binding = value as Partial<HarnessPackBinding>;
  if (binding.version !== 1) {
    throw new Error(`Unsupported Bloom Harness pack binding version: ${String(binding.version)}`);
  }
  if (!binding.reason || typeof binding.reason !== "string" || !binding.reason.trim()) {
    throw new Error("Bloom Harness pack binding reason is required.");
  }
  if (!binding.status || !["bound", "unbound", "blocked"].includes(binding.status)) {
    throw new Error("Bloom Harness pack binding status is invalid.");
  }
  if (!binding.source || !["explicit", "intent", "none"].includes(binding.source)) {
    throw new Error("Bloom Harness pack binding source is invalid.");
  }

  const pack = binding.pack === null ? null : validatePackSnapshot(binding.pack);
  if (binding.status === "bound") {
    if (binding.source !== "explicit" && binding.source !== "intent") {
      throw new Error("Bloom Harness bound pack must come from explicit or intent resolution.");
    }
    if (!pack || binding.packId !== pack.id || binding.packVersion !== pack.version) {
      throw new Error("Bloom Harness bound pack metadata does not match its snapshot.");
    }
  } else {
    if (pack !== null || binding.packId !== null || binding.packVersion !== null) {
      throw new Error("Bloom Harness non-bound pack cannot contain pack metadata.");
    }
    if (binding.status === "unbound" && binding.source !== "none") {
      throw new Error("Bloom Harness unbound pack source must be none.");
    }
    if (binding.status === "blocked" && binding.source !== "explicit") {
      throw new Error("Bloom Harness blocked pack source must be explicit.");
    }
  }

  return {
    version: 1,
    status: binding.status,
    source: binding.source,
    packId: binding.packId ?? null,
    packVersion: binding.packVersion ?? null,
    reason: binding.reason,
    pack,
  };
}
