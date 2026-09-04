import {
  AGENT_PERMISSION_VALUES,
  AGENT_ROLES,
  type AgentPermission,
  type AgentRole,
} from "./types";
import {
  HARNESS_EVIDENCE_KINDS,
  assertHarnessContractVersion,
  type HarnessAgentEnvelope,
  type HarnessAgentResult,
  type HarnessEvidence,
  type HarnessEvidenceKind,
} from "./harnessContracts";

const AGENT_ROLE_SET = new Set<string>(AGENT_ROLES);
const AGENT_PERMISSION_SET = new Set<string>(AGENT_PERMISSION_VALUES);
const EVIDENCE_KIND_SET = new Set<string>(HARNESS_EVIDENCE_KINDS);

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
  if (
    !Array.isArray(value)
    || value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new Error(`Bloom Harness ${label} must be a non-empty string array.`);
  }
  return [...value];
}

export function validateHarnessAgentEnvelope(input: unknown): HarnessAgentEnvelope {
  if (!isRecord(input)) {
    throw new Error("Bloom Harness agent envelope must be an object.");
  }

  const version = readVersion(input);
  const objective = readNonEmptyString(input.objective, "objective");
  const roleValue = readNonEmptyString(input.role, "role");
  if (!AGENT_ROLE_SET.has(roleValue)) {
    throw new Error(`Bloom Harness role is invalid: ${roleValue}`);
  }
  const role = roleValue as AgentRole;

  const permissionValues = readStringArray(input.permissions, "permissions");
  const invalidPermission = permissionValues.find((value) => !AGENT_PERMISSION_SET.has(value));
  if (invalidPermission !== undefined) {
    throw new Error(`Bloom Harness permissions contains invalid value: ${invalidPermission}`);
  }
  const permissions = permissionValues as AgentPermission[];

  const acceptanceCriteria = readStringArray(
    input.acceptanceCriteria,
    "acceptanceCriteria",
  );
  const requiredEvidenceValues = readStringArray(input.requiredEvidence, "requiredEvidence");
  const invalidEvidence = requiredEvidenceValues.find((value) => !EVIDENCE_KIND_SET.has(value));
  if (invalidEvidence !== undefined) {
    throw new Error(`Bloom Harness requiredEvidence contains invalid value: ${invalidEvidence}`);
  }
  const requiredEvidence = requiredEvidenceValues as HarnessEvidenceKind[];

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

export function validateHarnessEvidence(input: unknown): HarnessEvidence {
  if (!isRecord(input)) {
    throw new Error("Bloom Harness evidence must be an object.");
  }

  const version = readVersion(input);
  const id = readNonEmptyString(input.id, "evidence id");
  const kindValue = readNonEmptyString(input.kind, "evidence kind");
  if (!EVIDENCE_KIND_SET.has(kindValue)) {
    throw new Error(`Bloom Harness evidence kind is invalid: ${kindValue}`);
  }
  const kind = kindValue as HarnessEvidenceKind;
  const summary = readNonEmptyString(input.summary, "evidence summary");

  return {
    version,
    id,
    kind,
    summary,
  };
}
