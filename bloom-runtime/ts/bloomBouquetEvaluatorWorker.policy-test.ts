import * as assert from "node:assert/strict";

import type {
  BloomBouquetAgentEvaluationResponse,
  BloomBouquetEvaluatorClient,
  BloomBouquetEvaluationClaim,
} from "./bloomBouquetEvaluatorHttpClient";
import type { AgentEvaluation } from "./evaluationPlatform";
import {
  runBloomBouquetEvaluatorOnce,
  type AggregateEvaluatorInput,
  type IndependentEvaluatorInput,
  type SeniorEvaluatorRunner,
} from "./bloomBouquetEvaluatorWorker";

const CLAIM: BloomBouquetEvaluationClaim = {
  runId: 41,
  submissionId: 51,
  projectId: 61,
  teamId: 71,
  projectName: "Bouquet Shop",
  teamName: "Lily",
  version: "1.2.0",
  demoUrl: "https://example.com",
  frontendRepositoryUrl: "https://github.com/example/frontend",
  backendRepositoryUrl: null,
  requiresAuth: true,
  authPolicyId: "bouquet",
  bouquetClientId: "bouquet-submission-51",
  bouquetRedirectUri: "https://example.com/auth/bouquet/callback",
};

function evaluation(role: AgentEvaluation["role"]): AgentEvaluation {
  return {
    role,
    score: role === "security" ? 72 : 88,
    stars: role === "security" ? 3.6 : 4.4,
    assessment: `${role} assessment`,
    evidence: [`${role} observed evidence`],
    severity: role === "security" ? "medium" : "info",
    impact: `${role} impact`,
    recommendation: `${role} recommendation`,
    priority: role === "security" ? "p1" : "p3",
    confidence: "high",
    technicalTerms: [`${role} term`],
  };
}

function response(value: AgentEvaluation): BloomBouquetAgentEvaluationResponse {
  return {
    agentRole: value.role,
    score: value.score,
    stars: value.stars,
    assessment: value.assessment,
    evidence: value.evidence,
    severity: value.severity,
    impact: value.impact,
    recommendation: value.recommendation,
    priority: value.priority,
    confidence: value.confidence,
    technicalTerms: value.technicalTerms,
    createdAt: "2026-08-27T14:00:00",
  };
}

async function testIdleQueueDoesNothing() {
  let evaluated = false;
  const client: BloomBouquetEvaluatorClient = {
    async claim() { return null; },
    async listAgentEvaluations() { throw new Error("must not list without a claim"); },
    async recordAgentEvaluation() { throw new Error("must not record without a claim"); },
    async complete() { throw new Error("must not complete without a claim"); },
  };
  const runner: SeniorEvaluatorRunner = {
    async evaluate() {
      evaluated = true;
      throw new Error("must not evaluate without a claim");
    },
    async aggregate() {
      throw new Error("must not aggregate without a claim");
    },
  };

  const outcome = await runBloomBouquetEvaluatorOnce(client, runner);
  assert.deepEqual(outcome, { status: "idle" });
  assert.equal(evaluated, false);
}

async function testIndependentEvaluationsSkipPersistedRolesAndAggregateLast() {
  const stored = [response(evaluation("user-a"))];
  const recordedRoles: string[] = [];
  let completed = 0;
  let aggregateCalls = 0;
  const independentInputs: IndependentEvaluatorInput[] = [];

  const client: BloomBouquetEvaluatorClient = {
    async claim() { return CLAIM; },
    async listAgentEvaluations(runId) {
      assert.equal(runId, CLAIM.runId);
      return [...stored];
    },
    async recordAgentEvaluation(runId, payload) {
      assert.equal(runId, CLAIM.runId);
      assert.equal(recordedRoles.includes(payload.agentRole), false, "role must be persisted once");
      recordedRoles.push(payload.agentRole);
      const saved = { ...payload, createdAt: "2026-08-27T14:00:01" };
      stored.push(saved);
      return saved;
    },
    async complete(runId, payload) {
      assert.equal(runId, CLAIM.runId);
      assert.equal(aggregateCalls, 1, "complete must happen after aggregate");
      assert.equal(payload.overallScore, 86);
      assert.equal(payload.overallStars, 4.3);
      completed += 1;
      return {
        evaluationRunId: runId,
        evaluationStatus: "COMPLETED",
        overallScore: payload.overallScore,
        overallStars: payload.overallStars,
      };
    },
  };

  const runner: SeniorEvaluatorRunner = {
    async evaluate(input: IndependentEvaluatorInput) {
      independentInputs.push(input);
      assert.equal(Object.prototype.hasOwnProperty.call(input, "evaluations"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(input, "existingEvaluations"), false);
      assert.equal(input.submission.projectId, String(CLAIM.projectId));
      assert.equal(input.submission.teamId, String(CLAIM.teamId));
      assert.ok(input.authChecklist.some((item: string) => item.includes("SSO")));
      return evaluation(input.role);
    },
    async aggregate(input: AggregateEvaluatorInput) {
      aggregateCalls += 1;
      assert.equal(recordedRoles.length, 9, "all missing independent results must persist before aggregate");
      assert.equal(input.evaluations.length, 10);
      assert.deepEqual(
        new Set(input.evaluations.map((item: AgentEvaluation) => item.role)),
        new Set([
          "user-a", "user-b", "ux-research", "frontend", "security",
          "accessibility", "performance", "qa", "documentation", "code-review",
        ]),
      );
      return {
        overallScore: 86,
        overallStars: 4.3,
        reportSummary: "Independent senior evaluations were aggregated after all required roles completed.",
      };
    },
  };

  const outcome = await runBloomBouquetEvaluatorOnce(client, runner);
  assert.deepEqual(outcome, { status: "completed", runId: CLAIM.runId });
  assert.equal(completed, 1);
  assert.equal(aggregateCalls, 1);
  assert.equal(independentInputs.some((input) => input.role === "user-a"), false, "persisted role must be skipped");
  assert.equal(independentInputs.some((input) => input.role === "backend"), false, "backend role requires backend repository evidence");
  assert.equal(independentInputs.some((input) => input.role === "code-review"), true);
}

async function testAgentFailurePreservesEarlierResultsAndNeverAggregates() {
  const stored: BloomBouquetAgentEvaluationResponse[] = [];
  const recordedRoles: string[] = [];
  let aggregateCalls = 0;
  let completeCalls = 0;

  const client: BloomBouquetEvaluatorClient = {
    async claim() { return { ...CLAIM, frontendRepositoryUrl: null, requiresAuth: false, bouquetClientId: null, bouquetRedirectUri: null }; },
    async listAgentEvaluations() { return stored; },
    async recordAgentEvaluation(_runId, payload) {
      recordedRoles.push(payload.agentRole);
      const saved = { ...payload, createdAt: "2026-08-27T14:00:02" };
      stored.push(saved);
      return saved;
    },
    async complete() {
      completeCalls += 1;
      return { evaluationStatus: "COMPLETED" };
    },
  };
  const runner: SeniorEvaluatorRunner = {
    async evaluate(input: IndependentEvaluatorInput) {
      if (input.role === "security") throw new Error("security evaluator unavailable");
      return evaluation(input.role);
    },
    async aggregate() {
      aggregateCalls += 1;
      return { overallScore: 1, overallStars: 1, reportSummary: "must not run" };
    },
  };

  await assert.rejects(
    () => runBloomBouquetEvaluatorOnce(client, runner),
    /security evaluator unavailable/,
  );
  assert.deepEqual(recordedRoles, ["user-a", "user-b", "ux-research", "frontend"]);
  assert.equal(aggregateCalls, 0);
  assert.equal(completeCalls, 0);
  assert.equal(stored.length, 4, "successful independent results must remain persisted");
}

async function main() {
  await testIdleQueueDoesNothing();
  await testIndependentEvaluationsSkipPersistedRolesAndAggregateLast();
  await testAgentFailurePreservesEarlierResultsAndNeverAggregates();
  console.log("BloomBouquet evaluator worker policy tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
