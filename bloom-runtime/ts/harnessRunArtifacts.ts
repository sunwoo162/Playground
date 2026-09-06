import * as fs from "node:fs";
import * as path from "node:path";

import type { HarnessEvidence, HarnessExecutionIdentity } from "./harnessContracts";
import type {
  HarnessArtifactRecord, HarnessDecisionRecord, HarnessFailureRecord,
  HarnessRecoveryRecord, HarnessRunResultRecord,
} from "./harnessHistoryContracts";
import {
  validateHarnessEvidence,
  validateHarnessExecutionIdentity,
} from "./harnessValidation";
import {
  validateHarnessArtifactRecord, validateHarnessDecisionRecord,
  validateHarnessFailureRecord, validateHarnessRecoveryRecord,
  validateHarnessRunResultRecord,
} from "./harnessHistoryValidation";

export type HarnessRunSnapshotName =
  | "request"
  | "manifest"
  | "pack"
  | "plan"
  | "dag"
  | "review"
  | "qa"
  | "result";

export type HarnessRunEvent = {
  type: string;
  at: string;
  [key: string]: unknown;
};

const SNAPSHOT_FILES: Record<HarnessRunSnapshotName, string> = {
  request: "request.json",
  manifest: "manifest.snapshot.json",
  pack: "pack.snapshot.json",
  plan: "plan.json",
  dag: "dag.json",
  review: "review.json",
  qa: "qa.json",
  result: "result.json",
};

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SNAPSHOT_NAMES = Object.keys(SNAPSHOT_FILES) as HarnessRunSnapshotName[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId) || runId === "." || runId === "..") {
    throw new Error(`Bloom Harness run id is invalid: ${runId}`);
  }
}

function ensureSafeDirectory(parentDir: string, name: string, label: string): string {
  const directory = path.join(parentDir, name);
  if (fs.existsSync(directory)) {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink()) {
      throw new Error(`Bloom Harness ${label} must not be a symbolic link: ${directory}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`Bloom Harness ${label} must be a directory: ${directory}`);
    }
  } else {
    fs.mkdirSync(directory);
  }
  return fs.realpathSync(directory);
}

function assertSafeArtifactFile(filePath: string, label: string): void {
  if (!fs.existsSync(filePath)) return;
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Bloom Harness ${label} must not be a symbolic link: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Bloom Harness ${label} must be a regular file: ${filePath}`);
  }
}

function serializeJson(value: unknown, label: string, pretty = true): string {
  try {
    const serialized = JSON.stringify(value, null, pretty ? 2 : undefined);
    if (serialized === undefined) {
      throw new Error(`${label} is not JSON-serializable`);
    }
    return serialized;
  } catch (error) {
    if (error instanceof Error && error.message.includes("not JSON-serializable")) throw error;
    throw new Error(`Bloom Harness ${label} could not be serialized as JSON.`);
  }
}
function writeOnce(filePath: string, content: string): void {
  assertSafeArtifactFile(filePath, "artifact file");
  try {
    fs.writeFileSync(filePath, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Bloom Harness artifact already exists: ${filePath}`);
    }
    throw error;
  }
}

function replaceFileAtomically(filePath: string, content: string): void {
  assertSafeArtifactFile(filePath, "artifact file");
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    fs.writeFileSync(tempPath, content, { encoding: "utf8", flag: "wx" });
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
  }
}

function readEvidenceArray(filePath: string): HarnessEvidence[] {
  assertSafeArtifactFile(filePath, "evidence artifact");
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("evidence root is not an array");
    return parsed.map((item) => validateHarnessEvidence(item));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Bloom Harness stored evidence is corrupt at ${filePath}: ${detail}`);
  }
}
function readValidatedArray<T>(
  filePath: string,
  label: string,
  validate: (input: unknown) => T,
): T[] {
  assertSafeArtifactFile(filePath, label);
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) throw new Error(`${label} root is not an array`);
    return parsed.map((item) => validate(item));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Bloom Harness stored ${label} is corrupt at ${filePath}: ${detail}`);
  }
}

function assertBoundIdentity(
  identityPath: string,
  runId: string,
  recordIdentity: HarnessExecutionIdentity,
): HarnessExecutionIdentity {
  const boundIdentity = readStoredIdentity(identityPath, runId);
  if (boundIdentity === null) {
    throw new Error(`Bloom Harness structured history requires an identity-bound run: ${runId}.`);
  }
  if (!sameExecutionIdentity(boundIdentity, recordIdentity)) {
    throw new Error(`Bloom Harness structured history identity mismatch for run ${runId}.`);
  }
  return boundIdentity;
}

function validateRunEvent(event: unknown): HarnessRunEvent {
  if (!isRecord(event)) {
    throw new Error("Bloom Harness run event must be an object.");
  }
  if (typeof event.type !== "string" || event.type.trim() === "") {
    throw new Error("Bloom Harness run event type must be a non-empty string.");
  }
  if (typeof event.at !== "string" || event.at.trim() === "") {
    throw new Error("Bloom Harness run event at must be a non-empty string.");
  }
  return event as HarnessRunEvent;
}

export type HarnessRunArtifactBundle = {
  runId: string;
  runDir: string;
  identity: HarnessExecutionIdentity | null;
  snapshots: Partial<Record<HarnessRunSnapshotName, unknown>>;
  events: HarnessRunEvent[];
  evidence: HarnessEvidence[];
  decisions: HarnessDecisionRecord[];
  failures: HarnessFailureRecord[];
  recoveries: HarnessRecoveryRecord[];
  artifacts: HarnessArtifactRecord[];
  runResult: HarnessRunResultRecord | null;
  retrospective?: string;
};

function sameExecutionIdentity(
  left: HarnessExecutionIdentity,
  right: HarnessExecutionIdentity,
): boolean {
  return left.projectId === right.projectId
    && left.taskId === right.taskId
    && left.runId === right.runId
    && left.agentId === right.agentId;
}

function readStoredIdentity(
  filePath: string,
  expectedRunId: string,
): HarnessExecutionIdentity | null {
  assertSafeArtifactFile(filePath, "identity artifact");
  if (!fs.existsSync(filePath)) return null;
  try {
    const identity = validateHarnessExecutionIdentity(
      JSON.parse(fs.readFileSync(filePath, "utf8")),
    );
    if (identity.runId !== expectedRunId) {
      throw new Error(`identity runId ${identity.runId} does not match ${expectedRunId}`);
    }
    return identity;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Bloom Harness stored identity is corrupt at ${filePath}: ${detail}`);
  }
}

function readJsonArtifact(filePath: string): unknown | undefined {
  assertSafeArtifactFile(filePath, "JSON artifact");
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Bloom Harness stored artifact is corrupt at ${filePath}: ${detail}`);
  }
}

function readEvents(filePath: string): HarnessRunEvent[] {
  assertSafeArtifactFile(filePath, "event artifact");
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.map((line, index) => {
    try {
      return validateRunEvent(JSON.parse(line));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Bloom Harness stored event is corrupt at ${filePath}:${index + 1}: ${detail}`);
    }
  });
}

export type HarnessRunArtifactStore = {
  runId: string;
  runDir: string;
  writeSnapshot(name: HarnessRunSnapshotName, value: unknown): void;
  writeRetrospective(markdown: string): void;
  appendEvent(event: HarnessRunEvent): void;
  appendEvidence(evidence: HarnessEvidence): void;
  appendDecision(decision: HarnessDecisionRecord): void;
  appendFailure(failure: HarnessFailureRecord): void;
  appendRecovery(recovery: HarnessRecoveryRecord): void;
  appendArtifact(artifact: HarnessArtifactRecord): void;
  writeRunResult(result: HarnessRunResultRecord): void;
  readRun(): HarnessRunArtifactBundle;
};

export function createHarnessRunArtifactStore(
  repoRoot: string,
  runId: string,
  identity?: HarnessExecutionIdentity,
): HarnessRunArtifactStore {
  assertRunId(runId);

  const repoRootReal = fs.realpathSync(path.resolve(repoRoot));
  const bloomRoot = ensureSafeDirectory(repoRootReal, ".bloom", ".bloom directory");
  const runsRoot = ensureSafeDirectory(bloomRoot, "runs", "runs directory");
  const runDir = ensureSafeDirectory(runsRoot, runId, "run directory");
  if (!runDir.startsWith(`${runsRoot}${path.sep}`)) {
    throw new Error(`Bloom Harness run id escapes runs root: ${runId}`);
  }

  const identityPath = path.join(runDir, "identity.json");
  const requestedIdentity = identity === undefined
    ? null
    : validateHarnessExecutionIdentity(identity);
  if (requestedIdentity !== null && requestedIdentity.runId !== runId) {
    throw new Error(
      `Bloom Harness identity runId mismatch: store=${runId}, identity=${requestedIdentity.runId}.`,
    );
  }
  const existingIdentity = readStoredIdentity(identityPath, runId);
  if (existingIdentity !== null && requestedIdentity !== null
      && !sameExecutionIdentity(existingIdentity, requestedIdentity)) {
    throw new Error(`Bloom Harness run identity mismatch for ${runId}.`);
  }
  if (existingIdentity === null && requestedIdentity !== null) {
    writeOnce(identityPath, `${serializeJson(requestedIdentity, "run identity")}\n`);
  }

  const appendBoundRecord = <T extends { id: string; identity: HarnessExecutionIdentity }>(
    fileName: string,
    label: string,
    value: T,
    validate: (input: unknown) => T,
  ): void => {
    const validated = validate(value);
    assertBoundIdentity(identityPath, runId, validated.identity);
    const filePath = path.join(runDir, fileName);
    const existing = readValidatedArray(filePath, label, validate);
    if (existing.some((item) => item.id === validated.id)) {
      throw new Error(`Bloom Harness ${label} id already exists: ${validated.id}`);
    }
    replaceFileAtomically(filePath, `${serializeJson([...existing, validated], label)}\n`);
  };

  return {
    runId,
    runDir,
    writeSnapshot(name, value) {
      const filePath = path.join(runDir, SNAPSHOT_FILES[name]);
      writeOnce(filePath, `${serializeJson(value, `${name} snapshot`)}\n`);
    },
    writeRetrospective(markdown) {
      writeOnce(path.join(runDir, "retrospective.md"), markdown);
    },
    appendEvent(event) {
      const validated = validateRunEvent(event);
      const line = `${serializeJson(validated, "run event", false)}\n`;
      const filePath = path.join(runDir, "events.jsonl");
      assertSafeArtifactFile(filePath, "event artifact");
      fs.appendFileSync(filePath, line, "utf8");
    },
    appendEvidence(evidence) {
      const validated = validateHarnessEvidence(evidence);
      const boundIdentity = readStoredIdentity(identityPath, runId);
      if (boundIdentity !== null
          && (validated.identity === undefined
            || !sameExecutionIdentity(boundIdentity, validated.identity))) {
        throw new Error(`Bloom Harness evidence identity mismatch for run ${runId}.`);
      }
      const filePath = path.join(runDir, "evidence.json");
      const existing = readEvidenceArray(filePath);
      if (existing.some((item) => item.id === validated.id)) {
        throw new Error(`Bloom Harness evidence id already exists: ${validated.id}`);
      }
      replaceFileAtomically(
        filePath,
        `${serializeJson([...existing, validated], "evidence array")}\n`,
      );
    },
    appendDecision(decision) {
      appendBoundRecord("decisions.json", "decision array", decision, validateHarnessDecisionRecord);
    },
    appendFailure(failure) {
      appendBoundRecord("failures.json", "failure array", failure, validateHarnessFailureRecord);
    },
    appendRecovery(recovery) {
      const validated = validateHarnessRecoveryRecord(recovery);
      assertBoundIdentity(identityPath, runId, validated.identity);
      const failures = readValidatedArray(
        path.join(runDir, "failures.json"), "failure array", validateHarnessFailureRecord,
      );
      if (!failures.some((failure) => failure.id === validated.failureId)) {
        throw new Error(`Bloom Harness recovery references unknown failure: ${validated.failureId}`);
      }
      appendBoundRecord("recoveries.json", "recovery array", validated, validateHarnessRecoveryRecord);
    },
    appendArtifact(artifact) {
      appendBoundRecord("artifacts.json", "artifact array", artifact, validateHarnessArtifactRecord);
    },
    writeRunResult(result) {
      const validated = validateHarnessRunResultRecord(result);
      assertBoundIdentity(identityPath, runId, validated.identity);
      writeOnce(
        path.join(runDir, "run-result.json"),
        `${serializeJson(validated, "run result")}\n`,
      );
    },
    readRun() {
      const snapshots: Partial<Record<HarnessRunSnapshotName, unknown>> = {};
      for (const name of SNAPSHOT_NAMES) {
        const value = readJsonArtifact(path.join(runDir, SNAPSHOT_FILES[name]));
        if (value !== undefined) snapshots[name] = value;
      }
      const retrospectivePath = path.join(runDir, "retrospective.md");
      assertSafeArtifactFile(retrospectivePath, "retrospective artifact");
      const runResultValue = readJsonArtifact(path.join(runDir, "run-result.json"));
      const runResult = runResultValue === undefined
        ? null
        : validateHarnessRunResultRecord(runResultValue);
      return {
        runId,
        runDir,
        identity: readStoredIdentity(identityPath, runId),
        snapshots,
        events: readEvents(path.join(runDir, "events.jsonl")),
        evidence: readEvidenceArray(path.join(runDir, "evidence.json")),
        decisions: readValidatedArray(path.join(runDir, "decisions.json"), "decision array", validateHarnessDecisionRecord),
        failures: readValidatedArray(path.join(runDir, "failures.json"), "failure array", validateHarnessFailureRecord),
        recoveries: readValidatedArray(path.join(runDir, "recoveries.json"), "recovery array", validateHarnessRecoveryRecord),
        artifacts: readValidatedArray(path.join(runDir, "artifacts.json"), "artifact array", validateHarnessArtifactRecord),
        runResult,
        retrospective: fs.existsSync(retrospectivePath)
          ? fs.readFileSync(retrospectivePath, "utf8")
          : undefined,
      };
    },
  };
}
