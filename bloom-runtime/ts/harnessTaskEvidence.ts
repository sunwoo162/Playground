import {
  HARNESS_CONTRACT_VERSION,
  HARNESS_EVIDENCE_KINDS,
  type HarnessEvidence,
  type HarnessEvidenceKind,
} from "./harnessContracts";
import { validateHarnessEvidence } from "./harnessValidation";

export type HarnessTaskCompletionRecord = {
  version: 1;
  accepted: boolean;
  evidence: HarnessEvidence[];
  requiredEvidence: HarnessEvidenceKind[];
  rejectionReason: string | null;
};

const EVIDENCE_KINDS = new Set<string>(HARNESS_EVIDENCE_KINDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateHarnessTaskCompletionRecord(
  value: unknown,
): HarnessTaskCompletionRecord {
  if (!isRecord(value)) {
    throw new Error("Bloom Harness task completion record must be an object.");
  }
  if (value.version !== HARNESS_CONTRACT_VERSION) {
    throw new Error(`Unsupported Bloom Harness task completion version: ${String(value.version)}`);
  }
  if (typeof value.accepted !== "boolean") {
    throw new Error("Bloom Harness task completion accepted must be boolean.");
  }
  if (!Array.isArray(value.evidence)) {
    throw new Error("Bloom Harness task completion evidence must be an array.");
  }
  const evidence = value.evidence.map((item) => validateHarnessEvidence(item));
  const evidenceIds = new Set<string>();
  for (const item of evidence) {
    if (evidenceIds.has(item.id)) {
      throw new Error(`Bloom Harness duplicate task evidence id: ${item.id}`);
    }
    evidenceIds.add(item.id);
  }

  if (!Array.isArray(value.requiredEvidence)
      || value.requiredEvidence.some(
        (kind) => typeof kind !== "string" || !EVIDENCE_KINDS.has(kind),
      )) {
    throw new Error("Bloom Harness task required evidence contains an invalid kind.");
  }
  const requiredEvidence = [...new Set(value.requiredEvidence)] as HarnessEvidenceKind[];

  const rejectionReason = value.rejectionReason;
  if (value.accepted) {
    const evidenceKinds = new Set(evidence.map((item) => item.kind));
    const missingKinds = requiredEvidence.filter((kind) => !evidenceKinds.has(kind));
    if (missingKinds.length > 0) {
      throw new Error(`Bloom Harness accepted task completion is missing required evidence kinds: ${missingKinds.join(", ")}`);
    }
    if (rejectionReason !== null) {
      throw new Error("Bloom Harness accepted task cannot contain a rejection reason.");
    }
  } else if (typeof rejectionReason !== "string" || !rejectionReason.trim()) {
    throw new Error("Bloom Harness rejected task completion requires a rejection reason.");
  }

  return {
    version: 1,
    accepted: value.accepted,
    evidence,
    requiredEvidence,
    rejectionReason: rejectionReason as string | null,
  };
}
