import type { HarnessExecutionIdentity } from "./harnessContracts";

export const HARNESS_HISTORY_CONTRACT_VERSION = 1 as const;

export type HarnessDecisionRecord = {
  version: 1;
  id: string;
  identity: HarnessExecutionIdentity;
  problem: string | null;
  observations: string[];
  options: string[];
  decision: string;
  reason: string;
  outcome: string | null;
  evidenceIds: string[];
  at: string;
};

export type HarnessFailureSeverity = "low" | "medium" | "high" | "critical";
export type HarnessFailureRecord = {
  version: 1;
  id: string;
  identity: HarnessExecutionIdentity;
  failureType: string;
  severity: HarnessFailureSeverity;
  summary: string;
  cause: string | null;
  evidenceIds: string[];
  at: string;
};

export type HarnessRecoveryStatus =
  | "planned"
  | "attempted"
  | "succeeded"
  | "failed"
  | "escalated";

export type HarnessRecoveryRecord = {
  version: 1;
  id: string;
  identity: HarnessExecutionIdentity;
  failureId: string;
  action: string;
  reason: string;
  status: HarnessRecoveryStatus;
  result: string | null;
  actorAgentId: string | null;
  evidenceIds: string[];
  at: string;
};

export type HarnessArtifactKind =
  | "file"
  | "commit"
  | "pull-request"
  | "build"
  | "deployment"
  | "log"
  | "report"
  | "other";

export type HarnessArtifactRecord = {
  version: 1;
  id: string;
  identity: HarnessExecutionIdentity;
  kind: HarnessArtifactKind;
  summary: string;
  reference: string;
  digest: string | null;
  at: string;
};
export type HarnessRunResultStatus = "done" | "blocked" | "failed" | "cancelled";

export type HarnessRunResultRecord = {
  version: 1;
  identity: HarnessExecutionIdentity;
  status: HarnessRunResultStatus;
  summary: string;
  decisionIds: string[];
  failureIds: string[];
  recoveryIds: string[];
  evidenceIds: string[];
  artifactIds: string[];
  startedAt: string;
  completedAt: string;
};
