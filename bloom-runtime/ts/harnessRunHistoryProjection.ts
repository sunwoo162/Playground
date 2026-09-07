import type { HarnessEvidence, HarnessExecutionIdentity } from "./harnessContracts";
import type {
  HarnessArtifactRecord,
  HarnessDecisionRecord,
  HarnessFailureRecord,
  HarnessRecoveryRecord,
  HarnessRunResultRecord,
} from "./harnessHistoryContracts";
import type { HarnessRunArtifactBundle } from "./harnessRunArtifacts";
import type { IseolHarnessEvent, IseolHarnessRunState } from "./iseolHarnessProtocol";

export type HarnessFailureProjection = HarnessFailureRecord & {
  recoveries: HarnessRecoveryRecord[];
};

export type HarnessRunHistoryProjection = {
  version: 1;
  identity: HarnessExecutionIdentity;
  state: IseolHarnessRunState | null;
  status: HarnessRunResultRecord["status"] | null;
  startedAt: string | null;
  completedAt: string | null;
  timeline: IseolHarnessEvent[];
  decisions: HarnessDecisionRecord[];
  failures: HarnessFailureProjection[];
  evidence: HarnessEvidence[];
  artifacts: HarnessArtifactRecord[];
  runResult: HarnessRunResultRecord | null;
};
function sameIdentity(
  left: HarnessExecutionIdentity,
  right: HarnessExecutionIdentity,
): boolean {
  return left.projectId === right.projectId
    && left.taskId === right.taskId
    && left.runId === right.runId
    && left.agentId === right.agentId;
}

function assertIdentity(
  expected: HarnessExecutionIdentity,
  actual: HarnessExecutionIdentity | undefined,
  label: string,
): void {
  if (actual === undefined || !sameIdentity(expected, actual)) {
    throw new Error(`Harness history projection identity mismatch in ${label}.`);
  }
}

function assertUniqueIds<T extends { id: string }>(items: T[], label: string): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) {
      throw new Error(`Harness history projection duplicate ${label}: ${item.id}.`);
    }
    ids.add(item.id);
  }
  return ids;
}
function assertKnownIds(
  ids: string[],
  known: Set<string>,
  label: string,
): void {
  for (const id of ids) {
    if (!known.has(id)) {
      throw new Error(`Harness history projection references unknown ${label}: ${id}.`);
    }
  }
}

function terminalState(result: HarnessRunResultRecord | null): IseolHarnessRunState | null {
  if (result === null) return null;
  switch (result.status) {
    case "done": return "COMPLETE";
    case "blocked": return "BLOCKED";
    case "failed": return "FAILED";
    case "cancelled": return "CANCELLED";
  }
}

function checkEventOrder(events: IseolHarnessEvent[]): void {
  const eventIds = new Set<string>();
  events.forEach((event, index) => {
    const expectedSeq = index + 1;
    if (event.seq !== expectedSeq) {
      throw new Error(
        `Harness history projection public event sequence mismatch: expected ${expectedSeq}, got ${event.seq}.`,
      );
    }
    if (eventIds.has(event.eventId)) {
      throw new Error(`Harness history projection duplicate eventId: ${event.eventId}.`);
    }
    eventIds.add(event.eventId);
  });
}
export function projectHarnessRunHistory(
  bundle: HarnessRunArtifactBundle,
): HarnessRunHistoryProjection {
  const identity = bundle.identity;
  if (identity === null) {
    throw new Error("Harness history projection requires an identity-bound run.");
  }
  if (bundle.runId !== identity.runId) {
    throw new Error("Harness history projection runId does not match bound identity.");
  }

  for (const event of bundle.publicEvents) assertIdentity(identity, event.identity, "public event");
  for (const evidence of bundle.evidence) assertIdentity(identity, evidence.identity, "evidence");
  for (const decision of bundle.decisions) assertIdentity(identity, decision.identity, "decision");
  for (const failure of bundle.failures) assertIdentity(identity, failure.identity, "failure");
  for (const recovery of bundle.recoveries) assertIdentity(identity, recovery.identity, "recovery");
  for (const artifact of bundle.artifacts) assertIdentity(identity, artifact.identity, "artifact");
  if (bundle.runResult !== null) assertIdentity(identity, bundle.runResult.identity, "run result");

  checkEventOrder(bundle.publicEvents);

  const evidenceIds = assertUniqueIds(bundle.evidence, "evidence id");
  const decisionIds = assertUniqueIds(bundle.decisions, "decision id");
  const failureIds = assertUniqueIds(bundle.failures, "failure id");
  const recoveryIds = assertUniqueIds(bundle.recoveries, "recovery id");
  const artifactIds = assertUniqueIds(bundle.artifacts, "artifact id");
  for (const event of bundle.publicEvents) {
    assertKnownIds(event.evidenceIds, evidenceIds, "evidence");
  }
  for (const decision of bundle.decisions) {
    assertKnownIds(decision.evidenceIds, evidenceIds, "evidence");
  }
  for (const failure of bundle.failures) {
    assertKnownIds(failure.evidenceIds, evidenceIds, "evidence");
  }
  for (const recovery of bundle.recoveries) {
    if (!failureIds.has(recovery.failureId)) {
      throw new Error(
        `Harness history projection recovery references unknown failure: ${recovery.failureId}.`,
      );
    }
    assertKnownIds(recovery.evidenceIds, evidenceIds, "evidence");
  }

  if (bundle.runResult !== null) {
    assertKnownIds(bundle.runResult.decisionIds, decisionIds, "decision");
    assertKnownIds(bundle.runResult.failureIds, failureIds, "failure");
    assertKnownIds(bundle.runResult.recoveryIds, recoveryIds, "recovery");
    assertKnownIds(bundle.runResult.evidenceIds, evidenceIds, "evidence");
    assertKnownIds(bundle.runResult.artifactIds, artifactIds, "artifact");
  }
  const recoveriesByFailure = new Map<string, HarnessRecoveryRecord[]>();
  for (const recovery of bundle.recoveries) {
    const current = recoveriesByFailure.get(recovery.failureId) ?? [];
    current.push(recovery);
    recoveriesByFailure.set(recovery.failureId, current);
  }

  const lastEvent = bundle.publicEvents.length > 0
    ? bundle.publicEvents[bundle.publicEvents.length - 1]
    : undefined;
  const state = lastEvent?.state ?? terminalState(bundle.runResult);
  const startedAt = bundle.runResult?.startedAt
    ?? bundle.publicEvents[0]?.at
    ?? null;
  const completedAt = bundle.runResult?.completedAt ?? null;

  return {
    version: 1,
    identity,
    state,
    status: bundle.runResult?.status ?? null,
    startedAt,
    completedAt,
    timeline: [...bundle.publicEvents],
    decisions: [...bundle.decisions],
    failures: bundle.failures.map((failure) => ({
      ...failure,
      recoveries: [...(recoveriesByFailure.get(failure.id) ?? [])],
    })),
    evidence: [...bundle.evidence],
    artifacts: [...bundle.artifacts],
    runResult: bundle.runResult,
  };
}
