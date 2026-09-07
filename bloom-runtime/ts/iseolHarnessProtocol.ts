import type { HarnessExecutionIdentity } from "./harnessContracts";
import { validateHarnessExecutionIdentity } from "./harnessValidation";

export const ISEOL_HARNESS_PROTOCOL_VERSION = 1 as const;

export const ISEOL_HARNESS_RUN_STATES = [
  "QUEUED", "PLANNING", "RUNNING", "TESTING", "REVIEWING", "DEPLOYING",
  "BLOCKED", "FAILED", "RECOVERING", "COMPLETE", "CANCELLED",
] as const;
export type IseolHarnessRunState = typeof ISEOL_HARNESS_RUN_STATES[number];

export const ISEOL_HARNESS_EVENT_TYPES = [
  "RUN_STATE_CHANGED", "AGENT_STARTED", "AGENT_FINISHED", "DECISION_RECORDED",
  "EVIDENCE_RECORDED", "FAILURE_RECORDED", "RECOVERY_RECORDED",
  "ARTIFACT_RECORDED", "GIT_PUBLISHED", "DEPLOYMENT_CHANGED", "RUN_COMPLETED",
] as const;
export type IseolHarnessEventType = typeof ISEOL_HARNESS_EVENT_TYPES[number];

export const ISEOL_HARNESS_CONTROL_ACTIONS = [
  "pause", "resume", "cancel", "retry", "status",
] as const;
export type IseolHarnessControlAction = typeof ISEOL_HARNESS_CONTROL_ACTIONS[number];
export type IseolHarnessEvent = {
  version: 1;
  eventId: string;
  identity: HarnessExecutionIdentity;
  seq: number;
  type: IseolHarnessEventType;
  state: IseolHarnessRunState;
  at: string;
  summary: string;
  evidenceIds: string[];
};

export type IseolHarnessControlCommand = {
  version: 1;
  commandId: string;
  identity: HarnessExecutionIdentity;
  action: IseolHarnessControlAction;
  requestedAt: string;
  source: string;
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const RUN_STATE_SET = new Set<string>(ISEOL_HARNESS_RUN_STATES);
const EVENT_TYPE_SET = new Set<string>(ISEOL_HARNESS_EVENT_TYPES);
const CONTROL_ACTION_SET = new Set<string>(ISEOL_HARNESS_CONTROL_ACTIONS);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readVersion(input: Record<string, unknown>): 1 {
  if (input.version !== ISEOL_HARNESS_PROTOCOL_VERSION) {
    throw new Error(`Unsupported Iseol Harness protocol version: ${String(input.version)}`);
  }
  return ISEOL_HARNESS_PROTOCOL_VERSION;
}

function readId(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new Error(`Iseol Harness ${label} is invalid.`);
  }
  return value;
}

function readTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
    throw new Error(`Iseol Harness ${label} must be an ISO UTC timestamp.`);
  }
  return value;
}

function readSingleLine(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || /\r|\n/.test(value)) {
    throw new Error(`Iseol Harness ${label} must be a bounded single-line string.`);
  }
  return value;
}
function readIdArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Iseol Harness ${label} must be an array.`);
  }
  const ids = value.map((item) => readId(item, label));
  if (new Set(ids).size !== ids.length) {
    throw new Error(`Iseol Harness ${label} contains duplicate values.`);
  }
  return ids;
}

export function validateIseolHarnessEvent(input: unknown): IseolHarnessEvent {
  if (!isRecord(input)) {
    throw new Error("Iseol Harness event must be an object.");
  }
  const type = readSingleLine(input.type, "event type", 64);
  const state = readSingleLine(input.state, "run state", 32);
  if (!EVENT_TYPE_SET.has(type)) {
    throw new Error(`Iseol Harness event type is invalid: ${type}`);
  }
  if (!RUN_STATE_SET.has(state)) {
    throw new Error(`Iseol Harness run state is invalid: ${state}`);
  }
  if (!Number.isInteger(input.seq) || (input.seq as number) <= 0) {
    throw new Error("Iseol Harness event seq must be a positive integer.");
  }
  return {
    version: readVersion(input),
    eventId: readId(input.eventId, "eventId"),
    identity: validateHarnessExecutionIdentity(input.identity),
    seq: input.seq as number,
    type: type as IseolHarnessEventType,
    state: state as IseolHarnessRunState,
    at: readTimestamp(input.at, "event at"),
    summary: readSingleLine(input.summary, "event summary", 1024),
    evidenceIds: readIdArray(input.evidenceIds, "event evidenceIds"),
  };
}
export function validateIseolHarnessControlCommand(
  input: unknown,
): IseolHarnessControlCommand {
  if (!isRecord(input)) {
    throw new Error("Iseol Harness control command must be an object.");
  }
  const action = readSingleLine(input.action, "control action", 32);
  if (!CONTROL_ACTION_SET.has(action)) {
    throw new Error(`Iseol Harness control action is invalid: ${action}`);
  }
  return {
    version: readVersion(input),
    commandId: readId(input.commandId, "commandId"),
    identity: validateHarnessExecutionIdentity(input.identity),
    action: action as IseolHarnessControlAction,
    requestedAt: readTimestamp(input.requestedAt, "control requestedAt"),
    source: readSingleLine(input.source, "control source", 256),
  };
}
