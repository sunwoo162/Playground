import { validateHarnessExecutionIdentity } from "./harnessValidation";
import {
  HARNESS_HISTORY_CONTRACT_VERSION,
  type HarnessArtifactKind,
  type HarnessArtifactRecord,
  type HarnessDecisionRecord,
  type HarnessFailureRecord,
  type HarnessFailureSeverity,
  type HarnessRecoveryRecord,
  type HarnessRecoveryStatus,
  type HarnessRunResultRecord,
  type HarnessRunResultStatus,
} from "./harnessHistoryContracts";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const FAILURE_SEVERITIES = new Set<HarnessFailureSeverity>(["low", "medium", "high", "critical"]);
const RECOVERY_STATUSES = new Set<HarnessRecoveryStatus>(["planned", "attempted", "succeeded", "failed", "escalated"]);
const ARTIFACT_KINDS = new Set<HarnessArtifactKind>([
  "file", "commit", "pull-request", "build", "deployment", "log", "report", "other",
]);
const RUN_RESULT_STATUSES = new Set<HarnessRunResultStatus>(["done", "blocked", "failed", "cancelled"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readVersion(input: Record<string, unknown>): 1 {
  if (input.version !== HARNESS_HISTORY_CONTRACT_VERSION) {
    throw new Error(`Unsupported Harness history version: ${String(input.version)}`);
  }
  return HARNESS_HISTORY_CONTRACT_VERSION;
}

function readId(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new Error(`Harness history ${label} is invalid.`);
  }
  return value;
}

function readNonEmptyString(value: unknown, label: string, maxLength = 4096): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`Harness history ${label} must be a non-empty bounded string.`);
  }
  return value;
}

function readNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return readNonEmptyString(value, label);
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Harness history ${label} must be an array.`);
  }
  const items = value.map((item) => readNonEmptyString(item, label));
  if (new Set(items).size !== items.length) {
    throw new Error(`Harness history ${label} contains duplicate values.`);
  }
  return items;
}

function readIdArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Harness history ${label} must be an array.`);
  }
  const items = value.map((item) => readId(item, label));
  if (new Set(items).size !== items.length) {
    throw new Error(`Harness history ${label} contains duplicate values.`);
  }
  return items;
}

function readTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
    throw new Error(`Harness history ${label} must be an ISO UTC timestamp.`);
  }
  return value;
}

function readSingleLineReference(value: unknown): string {
  const reference = readNonEmptyString(value, "artifact reference", 8192);
  if (/\r|\n/.test(reference)) {
    throw new Error("Harness history artifact reference must be a single line.");
  }
  return reference;
}

function expectRecord(input: unknown, label: string): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new Error(`Harness history ${label} must be an object.`);
  }
  return input;
}

export function validateHarnessDecisionRecord(input: unknown): HarnessDecisionRecord {
  const record = expectRecord(input, "decision record");
  return {
    version: readVersion(record),
    id: readId(record.id, "decision id"),
    identity: validateHarnessExecutionIdentity(record.identity),
    problem: readNullableString(record.problem, "decision problem"),
    observations: readStringArray(record.observations, "decision observations"),
    options: readStringArray(record.options, "decision options"),
    decision: readNonEmptyString(record.decision, "decision"),
    reason: readNonEmptyString(record.reason, "decision reason"),
    outcome: readNullableString(record.outcome, "decision outcome"),
    evidenceIds: readIdArray(record.evidenceIds, "decision evidenceIds"),
    at: readTimestamp(record.at, "decision at"),
  };
}

export function validateHarnessFailureRecord(input: unknown): HarnessFailureRecord {
  const record = expectRecord(input, "failure record");
  const severity = readNonEmptyString(record.severity, "failure severity") as HarnessFailureSeverity;
  if (!FAILURE_SEVERITIES.has(severity)) {
    throw new Error(`Harness history failure severity is invalid: ${severity}`);
  }
  return {
    version: readVersion(record),
    id: readId(record.id, "failure id"),
    identity: validateHarnessExecutionIdentity(record.identity),
    failureType: readNonEmptyString(record.failureType, "failure type"),
    severity,
    summary: readNonEmptyString(record.summary, "failure summary"),
    cause: readNullableString(record.cause, "failure cause"),
    evidenceIds: readIdArray(record.evidenceIds, "failure evidenceIds"),
    at: readTimestamp(record.at, "failure at"),
  };
}

export function validateHarnessRecoveryRecord(input: unknown): HarnessRecoveryRecord {
  const record = expectRecord(input, "recovery record");
  const status = readNonEmptyString(record.status, "recovery status") as HarnessRecoveryStatus;
  if (!RECOVERY_STATUSES.has(status)) {
    throw new Error(`Harness history recovery status is invalid: ${status}`);
  }
  return {
    version: readVersion(record),
    id: readId(record.id, "recovery id"),
    identity: validateHarnessExecutionIdentity(record.identity),
    failureId: readId(record.failureId, "recovery failureId"),
    action: readNonEmptyString(record.action, "recovery action"),
    reason: readNonEmptyString(record.reason, "recovery reason"),
    status,
    result: readNullableString(record.result, "recovery result"),
    actorAgentId: record.actorAgentId === null ? null : readId(record.actorAgentId, "recovery actorAgentId"),
    evidenceIds: readIdArray(record.evidenceIds, "recovery evidenceIds"),
    at: readTimestamp(record.at, "recovery at"),
  };
}

export function validateHarnessArtifactRecord(input: unknown): HarnessArtifactRecord {
  const record = expectRecord(input, "artifact record");
  const kind = readNonEmptyString(record.kind, "artifact kind") as HarnessArtifactKind;
  if (!ARTIFACT_KINDS.has(kind)) {
    throw new Error(`Harness history artifact kind is invalid: ${kind}`);
  }
  return {
    version: readVersion(record),
    id: readId(record.id, "artifact id"),
    identity: validateHarnessExecutionIdentity(record.identity),
    kind,
    summary: readNonEmptyString(record.summary, "artifact summary"),
    reference: readSingleLineReference(record.reference),
    digest: readNullableString(record.digest, "artifact digest"),
    at: readTimestamp(record.at, "artifact at"),
  };
}

export function validateHarnessRunResultRecord(input: unknown): HarnessRunResultRecord {
  const record = expectRecord(input, "run result record");
  const status = readNonEmptyString(record.status, "run result status") as HarnessRunResultStatus;
  if (!RUN_RESULT_STATUSES.has(status)) {
    throw new Error(`Harness history run result status is invalid: ${status}`);
  }
  const startedAt = readTimestamp(record.startedAt, "run result startedAt");
  const completedAt = readTimestamp(record.completedAt, "run result completedAt");
  if (Date.parse(completedAt) < Date.parse(startedAt)) {
    throw new Error("Harness history run result completedAt must not precede startedAt chronology.");
  }
  return {
    version: readVersion(record),
    identity: validateHarnessExecutionIdentity(record.identity),
    status,
    summary: readNonEmptyString(record.summary, "run result summary"),
    decisionIds: readIdArray(record.decisionIds, "run result decisionIds"),
    failureIds: readIdArray(record.failureIds, "run result failureIds"),
    recoveryIds: readIdArray(record.recoveryIds, "run result recoveryIds"),
    evidenceIds: readIdArray(record.evidenceIds, "run result evidenceIds"),
    artifactIds: readIdArray(record.artifactIds, "run result artifactIds"),
    startedAt,
    completedAt,
  };
}
