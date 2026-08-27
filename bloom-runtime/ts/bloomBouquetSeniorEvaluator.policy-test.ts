import * as assert from "node:assert/strict";

import type { AgentEvaluation } from "./evaluationPlatform";
import type {
  AggregateEvaluatorInput,
  IndependentEvaluatorInput,
} from "./bloomBouquetEvaluatorWorker";
import {
  buildAggregateEvaluatorPrompt,
  buildIndependentEvaluatorPrompt,
  createCodexSeniorEvaluatorRunner,
  parseAggregateEvaluatorOutput,
  parseIndependentEvaluatorOutput,
  type CodexEvaluatorRequest,
  type CodexEvaluatorTransport,
} from "./bloomBouquetSeniorEvaluator";

const submission = {
  teamId: "71",
  projectId: "61",
  version: "1.2.0",
  demoUrl: "https://example.com",
  frontendRepositoryUrl: "https://github.com/example/frontend",
  backendRepositoryUrl: null,
  requiresAuth: true,
  authPolicyId: "bouquet",
  bouquetClientId: "bouquet-submission-51",
  bouquetRedirectUri: "https://example.com/auth/bouquet/callback",
};

const independentInput: IndependentEvaluatorInput = {
  role: "frontend",
  runId: 41,
  projectName: "Bouquet Shop",
  teamName: "Lily",
  submission,
  authChecklist: [
    "이미 중앙 꽃다발 세션이 있는 상태에서 다른 꽃다발 프로젝트로 이동했을 때 credential 재입력 없이 SSO가 이어지는지 확인한다.",
  ],
};

const frontend: AgentEvaluation = {
  role: "frontend",
  score: 88,
  stars: 4.4,
  assessment: "Component boundaries are coherent.",
  evidence: ["Primary route state remains feature-local."],
  severity: "info",
  impact: "Rendering ownership remains predictable.",
  recommendation: "Preserve state colocation.",
  priority: "p3",
  confidence: "high",
  technicalTerms: ["component boundary", "state colocation"],
};

const security: AgentEvaluation = {
  role: "security",
  score: 72,
  stars: 3.6,
  assessment: "The cross-origin trust boundary needs stronger evidence.",
  evidence: ["postMessage origin validation was not observed."],
  severity: "medium",
  impact: "Untrusted message handling could expand the attack surface.",
  recommendation: "Validate message origins and document iframe sandbox policy.",
  priority: "p1",
  confidence: "medium",
  technicalTerms: ["trust boundary", "attack surface"],
};

const aggregateInput: AggregateEvaluatorInput = {
  runId: 41,
  projectName: "Bouquet Shop",
  teamName: "Lily",
  submission,
  evaluations: [frontend, security],
};

function testIndependentPromptContract() {
  const prompt = buildIndependentEvaluatorPrompt(independentInput);
  assert.match(prompt, /10\+ years|10 years|10년/i);
  assert.match(prompt, /frontend/i);
  assert.match(prompt, /https:\/\/example\.com/);
  assert.match(prompt, /https:\/\/github\.com\/example\/frontend/);
  assert.match(prompt, /Assessment/);
  assert.match(prompt, /Evidence/);
  assert.match(prompt, /Severity/);
  assert.match(prompt, /Impact/);
  assert.match(prompt, /Recommendation/);
  assert.match(prompt, /Priority/);
  assert.match(prompt, /Confidence/);
  assert.match(prompt, /evidence.*impact.*recommendation/is);
  assert.match(prompt, /not observed|관찰하지 못/i);
  assert.match(prompt, /do not modify|수정하지/i);
  assert.match(prompt, /branch|commit|push|pull request/i);
  assert.match(prompt, /SSO/);
  assert.doesNotMatch(prompt, /Component boundaries are coherent/);
  assert.doesNotMatch(prompt, /cross-origin trust boundary needs stronger evidence/);
}

function testIndependentOutputParser() {
  const parsed = parseIndependentEvaluatorOutput({
    score: 88,
    stars: 4.4,
    assessment: frontend.assessment,
    evidence: frontend.evidence,
    severity: frontend.severity,
    impact: frontend.impact,
    recommendation: frontend.recommendation,
    priority: frontend.priority,
    confidence: frontend.confidence,
    technicalTerms: frontend.technicalTerms,
  }, "frontend");
  assert.deepEqual(parsed, frontend);

  assert.throws(
    () => parseIndependentEvaluatorOutput({
      score: 101,
      stars: 4.4,
      assessment: "invalid",
      evidence: ["evidence"],
      severity: "info",
      impact: "impact",
      recommendation: "recommendation",
      priority: "p3",
      confidence: "high",
      technicalTerms: [],
    }, "frontend"),
    /score/i,
  );
  assert.throws(
    () => parseIndependentEvaluatorOutput({
      score: 80,
      stars: 4,
      assessment: "invalid",
      evidence: [],
      severity: "unknown",
      impact: "impact",
      recommendation: "recommendation",
      priority: "p3",
      confidence: "high",
      technicalTerms: [],
    }, "frontend"),
    /severity/i,
  );
}

function testAggregatePromptAndParser() {
  const prompt = buildAggregateEvaluatorPrompt(aggregateInput);
  assert.match(prompt, /Process Evaluator/i);
  assert.match(prompt, /Component boundaries are coherent/);
  assert.match(prompt, /cross-origin trust boundary needs stronger evidence/);
  assert.match(prompt, /overallScore/);
  assert.match(prompt, /overallStars/);
  assert.match(prompt, /reportSummary/);
  assert.match(prompt, /do not invent|새로운.*증거|독립.*결론/is);

  assert.deepEqual(parseAggregateEvaluatorOutput({
    overallScore: 82,
    overallStars: 4.1,
    reportSummary: "The product is usable, with security evidence gaps prioritized for remediation.",
  }), {
    overallScore: 82,
    overallStars: 4.1,
    reportSummary: "The product is usable, with security evidence gaps prioritized for remediation.",
  });

  assert.throws(
    () => parseAggregateEvaluatorOutput({
      overallScore: -1,
      overallStars: 4,
      reportSummary: "invalid",
    }),
    /overallScore/,
  );
}

async function testCodexRunnerUsesReadOnlySandbox() {
  const requests: CodexEvaluatorRequest[] = [];
  const transport: CodexEvaluatorTransport = {
    async run(request: CodexEvaluatorRequest) {
      requests.push(request);
      if (request.title.includes("process-evaluator")) {
        return {
          overallScore: 82,
          overallStars: 4.1,
          reportSummary: "Aggregate report",
        };
      }
      return {
        score: 88,
        stars: 4.4,
        assessment: frontend.assessment,
        evidence: frontend.evidence,
        severity: frontend.severity,
        impact: frontend.impact,
        recommendation: frontend.recommendation,
        priority: frontend.priority,
        confidence: frontend.confidence,
        technicalTerms: frontend.technicalTerms,
      };
    },
  };
  const runner = createCodexSeniorEvaluatorRunner({ transport });

  assert.deepEqual(await runner.evaluate(independentInput), frontend);
  assert.deepEqual(await runner.aggregate(aggregateInput), {
    overallScore: 82,
    overallStars: 4.1,
    reportSummary: "Aggregate report",
  });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.deepEqual(request.sandboxPolicy, { type: "readOnly", networkAccess: true });
    assert.equal(request.approvalPolicy, "never");
    assert.ok(request.outputSchema && typeof request.outputSchema === "object");
  }
}

async function main() {
  testIndependentPromptContract();
  testIndependentOutputParser();
  testAggregatePromptAndParser();
  await testCodexRunnerUsesReadOnlySandbox();
  console.log("BloomBouquet senior evaluator policy tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
