import type { AgentPermission, AgentRole } from "./types";
import {
  assertHarnessContractVersion,
  type HarnessAgentEnvelope,
  type HarnessAgentResult,
  type HarnessEvidence,
  type HarnessEvidenceKind,
} from "./harnessContracts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readVersion(input: Record<string, unknown>): 1 {
  if (typeof input.version !== "number") {
    throw new Error("Bloom Harness contract version must be numeric.");
  }
  assertHarnessContractVersion(input.version);
  return input.version;
}

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Bloom Harness ${label} must be a non-empty string.`);
  }
  return value;
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Bloom Harness ${label} must be a string array.`);
  }
  return [...value];
}

export function validateHarnessAgentEnvelope(input: unknown): HarnessAgentEnvelope {
  if (!isRecord(input)) {
    throw new Error("Bloom Harness agent envelope must be an object.");
  }

  const version = readVersion(input);
  const objective = readNonEmptyString(input.objective, "objective");
  const role = readNonEmptyString(input.role, "role") as AgentRole;
  const permissions = readStringArray(input.permissions, "permissions") as AgentPermission[];
  const acceptanceCriteria = readStringArray(
    input.acceptanceCriteria,
    "acceptanceCriteria",
  );
  const requiredEvidence = readStringArray(input.requiredEvidence, "requiredEvidence");

  return {
    version,
    objective,
    role,
    permissions,
    acceptanceCriteria,
    requiredEvidence,
  };
}

const RESULT_STATUSES = new Set(["done", "blocked", "failed"]);

export function validateHarnessAgentResult(input: unknown): HarnessAgentResult {
  if (!isRecord(input)) {
    throw new Error("Bloom Harness agent result must be an object.");
  }

  const version = readVersion(input);
  const status = readNonEmptyString(input.status, "status");
  if (!RESULT_STATUSES.has(status)) {
    throw new Error(`Bloom Harness status is invalid: ${status}`);
  }
  const summary = readNonEmptyString(input.summary, "summary");
  const changedFiles = readStringArray(input.changedFiles, "changedFiles");
  const commandsExecuted = readStringArray(input.commandsExecuted, "commandsExecuted");
  const evidenceIds = readStringArray(input.evidenceIds, "evidenceIds");
  const risks = readStringArray(input.risks, "risks");
  const unresolvedIssues = readStringArray(input.unresolvedIssues, "unresolvedIssues");
  const nextActions = readStringArray(input.nextActions, "nextActions");

  return {
    version,
    status: status as HarnessAgentResult["status"],
    summary,
    changedFiles,
    commandsExecuted,
    evidenceIds,
    risks,
    unresolvedIssues,
    nextActions,
  };
}

const EVIDENCE_KINDS = new Set<HarnessEvidenceKind>([
  "command",
  "test",
  "build",
  "file-change",
  "review",
  "github",
  "deployment",
]);

export function validateHarnessEvidence(input: unknown): HarnessEvidence {
  if (!isRecord(input)) {
    throw new Error("Bloom Harness evidence must be an object.");
  }

  const version = readVersion(input);
  const id = readNonEmptyString(input.id, "evidence id");
  const kind = readNonEmptyString(input.kind, "evidence kind") as HarnessEvidenceKind;
  if (!EVIDENCE_KINDS.has(kind)) {
    throw new Error(`Bloom Harness evidence kind is invalid: ${kind}`);
  }
  const summary = readNonEmptyString(input.summary, "evidence summary");

  return {
    version,
    id,
    kind,
    summary,
  };
}
