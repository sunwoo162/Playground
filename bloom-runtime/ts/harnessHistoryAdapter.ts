import type { HarnessExecutionIdentity } from "./harnessContracts";
import type {
  HarnessDecisionRecord,
  HarnessFailureRecord,
  HarnessRecoveryRecord,
} from "./harnessHistoryContracts";
import {
  validateHarnessDecisionRecord,
  validateHarnessFailureRecord,
  validateHarnessRecoveryRecord,
} from "./harnessHistoryValidation";
import { validateHarnessExecutionIdentity } from "./harnessValidation";
import type {
  AgentDecision,
  FailureRouteRecord,
  ProjectReplanRecord,
} from "./types";

function checkedIdentity(identity: HarnessExecutionIdentity): HarnessExecutionIdentity {
  return validateHarnessExecutionIdentity(identity);
}

function assertProject(identity: HarnessExecutionIdentity, projectId: string): void {
  if (identity.projectId !== projectId) {
    throw new Error(`Harness history project mismatch: identity=${identity.projectId}, record=${projectId}.`);
  }
}
function assertTask(identity: HarnessExecutionIdentity, taskId: string): void {
  if (identity.taskId !== taskId) {
    throw new Error(`Harness history task mismatch: identity=${identity.taskId}, record=${taskId}.`);
  }
}

export function adaptAgentDecision(
  decision: AgentDecision,
  inputIdentity: HarnessExecutionIdentity,
): HarnessDecisionRecord {
  const identity = checkedIdentity(inputIdentity);
  assertProject(identity, decision.projectId);
  if (identity.agentId !== decision.agentId) {
    throw new Error(
      `Harness history agent mismatch: identity=${String(identity.agentId)}, record=${decision.agentId}.`,
    );
  }
  return validateHarnessDecisionRecord({
    version: 1,
    id: decision.id,
    identity,
    problem: null,
    observations: [...decision.evidence],
    options: [...decision.alternativesConsidered],
    decision: decision.action,
    reason: decision.rationaleSummary,
    outcome: null,
    evidenceIds: [],
    at: decision.createdAt,
  });
}
export function adaptFailureRoute(
  route: FailureRouteRecord,
  inputIdentity: HarnessExecutionIdentity,
): { failure: HarnessFailureRecord; recovery: HarnessRecoveryRecord } {
  const identity = checkedIdentity(inputIdentity);
  assertTask(identity, route.failedTaskId);

  const failure = validateHarnessFailureRecord({
    version: 1,
    id: `failure:${route.id}`,
    identity,
    failureType: route.failureType,
    severity: route.severity,
    summary: route.summary,
    cause: route.rationaleSummary,
    evidenceIds: [],
    at: route.createdAt,
  });

  const recovery = validateHarnessRecoveryRecord({
    version: 1,
    id: `recovery:${route.id}`,
    identity,
    failureId: failure.id,
    action: route.recommendedAction,
    reason: route.rationaleSummary,
    status: "planned",
    result: null,
    actorAgentId: route.routerAgentId,
    evidenceIds: [],
    at: route.createdAt,
  });

  return { failure, recovery };
}
export function adaptProjectReplan(
  replan: ProjectReplanRecord,
  inputIdentity: HarnessExecutionIdentity,
  failureId: string,
): HarnessRecoveryRecord {
  const identity = checkedIdentity(inputIdentity);
  const resultParts = [
    replan.retiredTaskIds.length > 0 ? `retired=${replan.retiredTaskIds.join(",")}` : null,
    replan.reopenedTaskIds.length > 0 ? `reopened=${replan.reopenedTaskIds.join(",")}` : null,
    replan.addedTaskIds.length > 0 ? `added=${replan.addedTaskIds.join(",")}` : null,
  ].filter((item): item is string => item !== null);

  return validateHarnessRecoveryRecord({
    version: 1,
    id: `recovery:${replan.id}`,
    identity,
    failureId,
    action: replan.summary,
    reason: replan.rationaleSummary,
    status: "succeeded",
    result: resultParts.length > 0 ? resultParts.join("; ") : "replan applied",
    actorAgentId: null,
    evidenceIds: [],
    at: replan.createdAt,
  });
}
