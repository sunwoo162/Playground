import type {
  BloomBouquetAgentEvaluationResponse,
  BloomBouquetAgentResultPayload,
  BloomBouquetEvaluatorClient,
  BloomBouquetEvaluationClaim,
} from "./bloomBouquetEvaluatorHttpClient";
import {
  bouquetAuthEvaluationChecklist,
  createEvaluationPlan,
  normalizeAgentEvaluation,
  type AgentEvaluation,
  type EvaluationAgentRole,
  type ProjectSubmissionInput,
} from "./evaluationPlatform";

export type IndependentEvaluatorRole = Exclude<EvaluationAgentRole, "process-evaluator">;

export type IndependentEvaluatorInput = {
  role: IndependentEvaluatorRole;
  runId: number;
  projectName: string;
  teamName: string;
  submission: ProjectSubmissionInput;
  authChecklist: readonly string[];
};

export type AggregateEvaluatorInput = {
  runId: number;
  projectName: string;
  teamName: string;
  submission: ProjectSubmissionInput;
  evaluations: AgentEvaluation[];
};

export type AggregateEvaluationResult = {
  overallScore: number;
  overallStars: number;
  reportSummary: string;
};

export type SeniorEvaluatorRunner = {
  evaluate(input: IndependentEvaluatorInput): Promise<AgentEvaluation>;
  aggregate(input: AggregateEvaluatorInput): Promise<AggregateEvaluationResult>;
};

export type EvaluatorWorkerTimer = {
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
};

export type BloomBouquetEvaluatorOutcome =
  | { status: "idle" }
  | { status: "completed"; runId: number }
  | { status: "partial"; runId: number }
  | { status: "lease-lost"; runId: number; reason: string };

export const BLOOM_BOUQUET_EVALUATOR_HEARTBEAT_INTERVAL_MS = 30_000;

const DEFAULT_TIMER: EvaluatorWorkerTimer = {
  setInterval(callback, intervalMs) {
    return globalThis.setInterval(callback, intervalMs);
  },
  clearInterval(handle) {
    globalThis.clearInterval(handle as number);
  },
};

function submissionFromClaim(claim: BloomBouquetEvaluationClaim): ProjectSubmissionInput {
  return {
    teamId: String(claim.teamId),
    projectId: String(claim.projectId),
    version: claim.version,
    demoUrl: claim.demoUrl,
    frontendRepositoryUrl: claim.frontendRepositoryUrl,
    backendRepositoryUrl: claim.backendRepositoryUrl,
    requiresAuth: claim.requiresAuth,
    authPolicyId: claim.authPolicyId,
    bouquetClientId: claim.bouquetClientId,
    bouquetRedirectUri: claim.bouquetRedirectUri,
  };
}

function isIndependentRole(role: string): role is IndependentEvaluatorRole {
  return [
    "ux-research",
    "frontend",
    "backend",
    "security",
    "accessibility",
    "performance",
    "code-review",
    "qa",
    "documentation",
    "user-a",
    "user-b",
  ].includes(role);
}

function responseToEvaluation(
  response: BloomBouquetAgentEvaluationResponse,
): AgentEvaluation | null {
  if (!isIndependentRole(response.agentRole)) return null;

  return normalizeAgentEvaluation({
    role: response.agentRole,
    score: response.score,
    stars: response.stars,
    assessment: response.assessment,
    evidence: response.evidence,
    severity: response.severity,
    impact: response.impact,
    recommendation: response.recommendation,
    priority: response.priority,
    confidence: response.confidence,
    technicalTerms: response.technicalTerms,
  });
}

function evaluationToPayload(evaluation: AgentEvaluation): BloomBouquetAgentResultPayload {
  return {
    agentRole: evaluation.role,
    score: evaluation.score,
    stars: evaluation.stars,
    assessment: evaluation.assessment,
    evidence: evaluation.evidence,
    severity: evaluation.severity,
    impact: evaluation.impact,
    recommendation: evaluation.recommendation,
    priority: evaluation.priority,
    confidence: evaluation.confidence,
    technicalTerms: evaluation.technicalTerms,
  };
}

function requiredIndependentRoles(submission: ProjectSubmissionInput): IndependentEvaluatorRole[] {
  return createEvaluationPlan(submission)
    .filter((step) => step.stage === "independent")
    .map((step) => step.role)
    .filter((role): role is IndependentEvaluatorRole => role !== "process-evaluator");
}

function normalizeAggregate(result: AggregateEvaluationResult): AggregateEvaluationResult {
  if (!Number.isFinite(result.overallScore) || !Number.isFinite(result.overallStars)) {
    throw new Error("Process Evaluator 점수는 유한한 숫자여야 합니다.");
  }
  const reportSummary = result.reportSummary.trim();
  if (!reportSummary) {
    throw new Error("Process Evaluator reportSummary가 필요합니다.");
  }

  return {
    overallScore: Math.min(100, Math.max(0, Math.round(result.overallScore))),
    overallStars: Math.round(Math.min(5, Math.max(1, result.overallStars)) * 10) / 10,
    reportSummary,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runBloomBouquetEvaluatorOnce(
  client: BloomBouquetEvaluatorClient,
  workerId: string,
  runner: SeniorEvaluatorRunner,
  options: {
    heartbeatIntervalMs?: number;
    timer?: EvaluatorWorkerTimer;
  } = {},
): Promise<BloomBouquetEvaluatorOutcome> {
  const claim = await client.claim(workerId);
  if (!claim) return { status: "idle" };

  const intervalMs = options.heartbeatIntervalMs ?? BLOOM_BOUQUET_EVALUATOR_HEARTBEAT_INTERVAL_MS;
  if (!Number.isInteger(intervalMs) || intervalMs <= 0 || intervalMs >= 90_000) {
    throw new Error("BloomBouquet evaluator heartbeat interval은 1ms 이상 90초 미만이어야 합니다.");
  }

  const timer = options.timer ?? DEFAULT_TIMER;
  let stopped = false;
  let leaseError: string | null = null;
  let heartbeatChain: Promise<void> = Promise.resolve();

  const scheduleHeartbeat = () => {
    heartbeatChain = heartbeatChain.then(async () => {
      if (stopped || leaseError) return;
      try {
        await client.heartbeat(claim.runId, workerId);
      } catch (error) {
        leaseError = `heartbeat 실패: ${errorMessage(error)}`;
      }
    });
  };

  const waitForScheduledHeartbeat = async (): Promise<string | null> => {
    await heartbeatChain;
    return leaseError;
  };

  const timerHandle = timer.setInterval(scheduleHeartbeat, intervalMs);

  try {
    const submission = submissionFromClaim(claim);
    const authChecklist = bouquetAuthEvaluationChecklist(submission);
    const requiredRoles = requiredIndependentRoles(submission);
    const requiredRoleSet = new Set<IndependentEvaluatorRole>(requiredRoles);

    const persisted = await client.listAgentEvaluations(claim.runId, workerId);
    const listLeaseError = await waitForScheduledHeartbeat();
    if (listLeaseError) {
      return { status: "lease-lost", runId: claim.runId, reason: listLeaseError };
    }

    const evaluationsByRole = new Map<IndependentEvaluatorRole, AgentEvaluation>();

    for (const item of persisted) {
      const evaluation = responseToEvaluation(item);
      if (!evaluation || !requiredRoleSet.has(evaluation.role)) continue;
      evaluationsByRole.set(evaluation.role, evaluation);
    }

    for (const role of requiredRoles) {
      if (evaluationsByRole.has(role)) continue;

      const result = normalizeAgentEvaluation(await runner.evaluate({
        role,
        runId: claim.runId,
        projectName: claim.projectName,
        teamName: claim.teamName,
        submission,
        authChecklist,
      }));

      const evaluationLeaseError = await waitForScheduledHeartbeat();
      if (evaluationLeaseError) {
        return { status: "lease-lost", runId: claim.runId, reason: evaluationLeaseError };
      }

      if (result.role !== role) {
        throw new Error(`Evaluator role mismatch: expected=${role}, actual=${result.role}`);
      }

      const saved = await client.recordAgentEvaluation(
        claim.runId,
        workerId,
        evaluationToPayload(result),
      );
      const persistenceLeaseError = await waitForScheduledHeartbeat();
      if (persistenceLeaseError) {
        return { status: "lease-lost", runId: claim.runId, reason: persistenceLeaseError };
      }

      const persistedResult = responseToEvaluation(saved);
      if (!persistedResult || persistedResult.role !== role) {
        throw new Error(`저장된 Evaluator 결과 역할이 예상과 다릅니다: ${role}`);
      }
      evaluationsByRole.set(role, persistedResult);
    }

    const evaluations = requiredRoles.map((role) => evaluationsByRole.get(role));
    if (evaluations.some((item) => !item)) {
      return { status: "partial", runId: claim.runId };
    }

    const aggregate = normalizeAggregate(await runner.aggregate({
      runId: claim.runId,
      projectName: claim.projectName,
      teamName: claim.teamName,
      submission,
      evaluations: evaluations as AgentEvaluation[],
    }));

    const aggregateLeaseError = await waitForScheduledHeartbeat();
    if (aggregateLeaseError) {
      return { status: "lease-lost", runId: claim.runId, reason: aggregateLeaseError };
    }

    try {
      await client.heartbeat(claim.runId, workerId);
    } catch (error) {
      return {
        status: "lease-lost",
        runId: claim.runId,
        reason: `terminal heartbeat 실패: ${errorMessage(error)}`,
      };
    }

    await client.complete(claim.runId, workerId, aggregate);
    return { status: "completed", runId: claim.runId };
  } finally {
    stopped = true;
    timer.clearInterval(timerHandle);
    await heartbeatChain;
  }
}
