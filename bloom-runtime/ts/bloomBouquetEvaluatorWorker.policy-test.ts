import * as assert from "node:assert/strict";

import type {
  BloomBouquetAgentEvaluationResponse,
  BloomBouquetEvaluatorClient,
  BloomBouquetEvaluationClaim,
  BloomBouquetEvaluationLease,
} from "./bloomBouquetEvaluatorHttpClient";
import type { AgentEvaluation } from "./evaluationPlatform";
import {
  runBloomBouquetEvaluatorOnce,
  type AggregateEvaluatorInput,
  type EvaluatorWorkerTimer,
  type IndependentEvaluatorInput,
  type SeniorEvaluatorRunner,
} from "./bloomBouquetEvaluatorWorker";

const WORKER_ID = "bouquet-evaluator-test";
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
  workerId: WORKER_ID,
  leaseExpiresAt: "2026-08-27T15:00:00",
  claimCount: 1,
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

function lease(): BloomBouquetEvaluationLease {
  return {
    runId: CLAIM.runId,
    workerId: WORKER_ID,
    status: "RUNNING",
    heartbeatAt: "2026-08-27T14:58:30",
    leaseExpiresAt: "2026-08-27T15:00:00",
    claimCount: 1,
  };
}

class FakeTimer implements EvaluatorWorkerTimer {
  callbacks: Array<() => void> = [];
  cleared = false;

  setInterval(callback: () => void) {
    this.callbacks.push(callback);
    return callback;
  }

  clearInterval() {
    this.cleared = true;
  }

  fire() {
    this.callbacks.forEach((callback) => callback());
  }
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function testIdleQueueDoesNothing() {
  let evaluated = false;
  const client: BloomBouquetEvaluatorClient = {
    async claim(workerId) { assert.equal(workerId, WORKER_ID); return null; },
    async heartbeat() { throw new Error("must not heartbeat without a claim"); },
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

  const outcome = await runBloomBouquetEvaluatorOnce(client, WORKER_ID, runner);
  assert.deepEqual(outcome, { status: "idle" });
  assert.equal(evaluated, false);
}

async function testIndependentEvaluationsSkipPersistedRolesAndAggregateLast() {
  const stored = [response(evaluation("user-a"))];
  const recordedRoles: string[] = [];
  let completed = 0;
  let aggregateCalls = 0;
  let heartbeatCalls = 0;
  const independentInputs: IndependentEvaluatorInput[] = [];
  const timer = new FakeTimer();

  const client: BloomBouquetEvaluatorClient = {
    async claim(workerId) { assert.equal(workerId, WORKER_ID); return CLAIM; },
    async heartbeat(runId, workerId) {
      assert.equal(runId, CLAIM.runId);
      assert.equal(workerId, WORKER_ID);
      heartbeatCalls += 1;
      return lease();
    },
    async listAgentEvaluations(runId, workerId) {
      assert.equal(runId, CLAIM.runId);
      assert.equal(workerId, WORKER_ID);
      return [...stored];
    },
    async recordAgentEvaluation(runId, workerId, payload) {
      assert.equal(runId, CLAIM.runId);
      assert.equal(workerId, WORKER_ID);
      assert.equal(recordedRoles.includes(payload.agentRole), false, "role must be persisted once");
      recordedRoles.push(payload.agentRole);
      const saved = { ...payload, createdAt: "2026-08-27T14:00:01" };
      stored.push(saved);
      return saved;
    },
    async complete(runId, workerId, payload) {
      assert.equal(runId, CLAIM.runId);
      assert.equal(workerId, WORKER_ID);
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
      timer.fire();
      await flushMicrotasks();
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

  const outcome = await runBloomBouquetEvaluatorOnce(client, WORKER_ID, runner, {
    heartbeatIntervalMs: 10,
    timer,
  });
  assert.deepEqual(outcome, { status: "completed", runId: CLAIM.runId });
  assert.equal(completed, 1);
  assert.equal(aggregateCalls, 1);
  assert.ok(heartbeatCalls >= 2, "worker must maintain and re-check its lease");
  assert.equal(timer.cleared, true);
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
    async heartbeat() { return lease(); },
    async listAgentEvaluations() { return stored; },
    async recordAgentEvaluation(_runId, _workerId, payload) {
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
    () => runBloomBouquetEvaluatorOnce(client, WORKER_ID, runner),
    /security evaluator unavailable/,
  );
  assert.deepEqual(recordedRoles, ["user-a", "user-b", "ux-research", "frontend"]);
  assert.equal(aggregateCalls, 0);
  assert.equal(completeCalls, 0);
  assert.equal(stored.length, 4, "successful independent results must remain persisted");
}

async function testHeartbeatLossPreventsStaleAgentPersistence() {
  const timer = new FakeTimer();
  let recordCalls = 0;
  let aggregateCalls = 0;
  let completeCalls = 0;

  const client: BloomBouquetEvaluatorClient = {
    async claim() { return CLAIM; },
    async heartbeat() { throw new Error("409 evaluator lease expired"); },
    async listAgentEvaluations() { return []; },
    async recordAgentEvaluation() {
      recordCalls += 1;
      throw new Error("stale worker must not persist");
    },
    async complete() {
      completeCalls += 1;
      return { evaluationStatus: "COMPLETED" };
    },
  };
  const runner: SeniorEvaluatorRunner = {
    async evaluate(input: IndependentEvaluatorInput) {
      timer.fire();
      await flushMicrotasks();
      return evaluation(input.role);
    },
    async aggregate() {
      aggregateCalls += 1;
      return { overallScore: 88, overallStars: 4.4, reportSummary: "must not run" };
    },
  };

  const outcome = await runBloomBouquetEvaluatorOnce(client, WORKER_ID, runner, {
    heartbeatIntervalMs: 10,
    timer,
  });
  assert.equal(outcome.status, "lease-lost");
  assert.equal(outcome.runId, CLAIM.runId);
  assert.match(outcome.reason, /heartbeat|lease/i);
  assert.equal(recordCalls, 0, "lost lease must block stale Agent persistence");
  assert.equal(aggregateCalls, 0);
  assert.equal(completeCalls, 0);
  assert.equal(timer.cleared, true);
}

async function main() {
  await testIdleQueueDoesNothing();
  await testIndependentEvaluationsSkipPersistedRolesAndAggregateLast();
  await testAgentFailurePreservesEarlierResultsAndNeverAggregates();
  await testHeartbeatLossPreventsStaleAgentPersistence();
  console.log("BloomBouquet evaluator worker policy tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
