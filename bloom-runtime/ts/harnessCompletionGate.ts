import {
  HARNESS_EVIDENCE_KINDS,
  type HarnessAgentResult,
  type HarnessEvidence,
  type HarnessEvidenceKind,
} from "./harnessContracts";
import {
  validateHarnessAgentResult,
  validateHarnessEvidence,
} from "./harnessValidation";
import type { HarnessRunArtifactBundle } from "./harnessRunArtifacts";

const EVIDENCE_KIND_SET = new Set<string>(HARNESS_EVIDENCE_KINDS);

export type HarnessCompletionGateInput = {
  requiredEvidence: readonly string[];
  result: unknown;
  evidence: readonly unknown[];
};

export type HarnessCompletionGateReason =
  | "ready"
  | "result-not-done"
  | "missing-evidence-ids"
  | "missing-evidence-kinds";

export type HarnessCompletionGateResult = {
  ready: boolean;
  reason: HarnessCompletionGateReason;
  result: HarnessAgentResult;
  referencedEvidence: HarnessEvidence[];
  missingEvidenceIds: string[];
  missingEvidenceKinds: HarnessEvidenceKind[];
};

function validateRequiredEvidence(
  input: readonly string[],
): HarnessEvidenceKind[] {
  if (!Array.isArray(input)) {
    throw new Error("Bloom Harness required evidence must be an array.");
  }
  const required: HarnessEvidenceKind[] = [];
  for (const kind of input) {
    if (typeof kind !== "string" || !EVIDENCE_KIND_SET.has(kind)) {
      throw new Error(`Bloom Harness required evidence kind is invalid: ${String(kind)}`);
    }
    if (!required.includes(kind as HarnessEvidenceKind)) {
      required.push(kind as HarnessEvidenceKind);
    }
  }
  return required;
}

function validateStoredEvidence(input: readonly unknown[]): HarnessEvidence[] {
  if (!Array.isArray(input)) {
    throw new Error("Bloom Harness stored evidence must be an array.");
  }
  const validated = input.map((item) => validateHarnessEvidence(item));
  const seen = new Set<string>();
  for (const evidence of validated) {
    if (seen.has(evidence.id)) {
      throw new Error(`Bloom Harness duplicate stored evidence id: ${evidence.id}`);
    }
    seen.add(evidence.id);
  }
  return validated;
}

export function evaluateHarnessCompletion(
  input: HarnessCompletionGateInput,
): HarnessCompletionGateResult {
  const requiredEvidence = validateRequiredEvidence(input.requiredEvidence);
  const result = validateHarnessAgentResult(input.result);
  const evidence = validateStoredEvidence(input.evidence);
  const byId = new Map(evidence.map((item) => [item.id, item] as const));

  const missingEvidenceIds = [...new Set(
    result.evidenceIds.filter((id) => !byId.has(id)),
  )];
  const referencedEvidence = [...new Set(result.evidenceIds)]
    .map((id) => byId.get(id))
    .filter((item): item is HarnessEvidence => item !== undefined);
  const referencedKinds = new Set(referencedEvidence.map((item) => item.kind));
  const missingEvidenceKinds = requiredEvidence.filter(
    (kind) => !referencedKinds.has(kind),
  );

  let reason: HarnessCompletionGateReason = "ready";
  if (result.status !== "done") reason = "result-not-done";
  else if (missingEvidenceIds.length > 0) reason = "missing-evidence-ids";
  else if (missingEvidenceKinds.length > 0) reason = "missing-evidence-kinds";

  return {
    ready: reason === "ready",
    reason,
    result,
    referencedEvidence,
    missingEvidenceIds,
    missingEvidenceKinds,
  };
}

export function assertHarnessCompletion(
  input: HarnessCompletionGateInput,
): HarnessAgentResult {
  const evaluation = evaluateHarnessCompletion(input);
  if (evaluation.ready) return evaluation.result;

  if (evaluation.reason === "result-not-done") {
    throw new Error(
      `Bloom Harness completion rejected: result status is ${evaluation.result.status}, not done.`,
    );
  }
  if (evaluation.reason === "missing-evidence-ids") {
    throw new Error(
      `Bloom Harness completion rejected: missing referenced evidence ids: ${evaluation.missingEvidenceIds.join(", ")}.`,
    );
  }
  throw new Error(
    `Bloom Harness completion rejected: missing required evidence kinds: ${evaluation.missingEvidenceKinds.join(", ")}.`,
  );
}

export function evaluateHarnessRunCompletion(
  bundle: HarnessRunArtifactBundle,
  requiredEvidence: readonly string[],
): HarnessCompletionGateResult {
  const result = bundle.snapshots.result;
  if (result === undefined) {
    throw new Error(`Bloom Harness run result snapshot is missing for ${bundle.runId}.`);
  }
  return evaluateHarnessCompletion({
    requiredEvidence,
    result,
    evidence: bundle.evidence,
  });
}

export function assertHarnessRunCompletion(
  bundle: HarnessRunArtifactBundle,
  requiredEvidence: readonly string[],
): HarnessAgentResult {
  const result = bundle.snapshots.result;
  if (result === undefined) {
    throw new Error(`Bloom Harness run result snapshot is missing for ${bundle.runId}.`);
  }
  return assertHarnessCompletion({
    requiredEvidence,
    result,
    evidence: bundle.evidence,
  });
}
