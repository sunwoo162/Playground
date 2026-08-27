import * as assert from "node:assert/strict";

import { createBloomBouquetEvaluatorHttpClient } from "./bloomBouquetEvaluatorHttpClient";

const token = "bloom-bouquet-worker-token-1234567890";
const baseUrl = "http://localhost:8080";
const calls: Array<{
  url: string;
  method: "GET" | "POST" | "PUT";
  headers: Record<string, string>;
  body?: string;
}> = [];

const response = (status: number, value?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() {
    if (value === undefined) throw new Error("no json");
    return value;
  },
  async text() {
    return value === undefined ? "" : JSON.stringify(value);
  },
});

let claimCount = 0;
const fetchImpl = async (
  url: string,
  init: {
    method: "GET" | "POST" | "PUT";
    headers: Record<string, string>;
    body?: string;
  },
) => {
  calls.push({ url, ...init });

  if (url.endsWith("/internal/builder/worker/bloom-bouquet/runs/claim")) {
    claimCount += 1;
    if (claimCount === 1) return response(204);
    return response(200, {
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
    });
  }

  if (url.endsWith("/internal/builder/worker/bloom-bouquet/runs/41/agents") && init.method === "GET") {
    return response(200, []);
  }

  if (url.endsWith("/internal/builder/worker/bloom-bouquet/runs/41/agents") && init.method === "POST") {
    return response(200, JSON.parse(init.body || "{}"));
  }

  if (url.endsWith("/internal/builder/worker/bloom-bouquet/runs/41/complete")) {
    return response(200, {
      evaluationRunId: 41,
      evaluationStatus: "COMPLETED",
      overallScore: 88,
      overallStars: 4.4,
    });
  }

  return response(404, { message: "not found" });
};

async function main() {
  const client = createBloomBouquetEvaluatorHttpClient({ baseUrl, token, fetchImpl });

  assert.equal(await client.claim(), null);
  const claim = await client.claim();
  assert.equal(claim?.runId, 41);
  assert.equal(claim?.projectName, "Bouquet Shop");

  assert.deepEqual(await client.listAgentEvaluations(41), []);

  const agentPayload = {
    agentRole: "frontend" as const,
    score: 88,
    stars: 4.4,
    assessment: "Rendering ownership is coherent.",
    evidence: ["The primary route rendered successfully."],
    severity: "info" as const,
    impact: "Interaction remains predictable.",
    recommendation: "Keep feature-local state boundaries.",
    priority: "p3" as const,
    confidence: "high" as const,
    technicalTerms: ["component boundary"],
  };
  const recorded = await client.recordAgentEvaluation(41, agentPayload);
  assert.equal(recorded.agentRole, "frontend");

  const completed = await client.complete(41, {
    overallScore: 88,
    overallStars: 4.4,
    reportSummary: "Independent senior evaluations are complete.",
  });
  assert.equal(completed.evaluationStatus, "COMPLETED");

  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.equal(call.headers["X-Builder-Worker-Token"], token);
  }
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body, undefined);
  assert.equal(calls[2].method, "GET");
  assert.equal(calls[3].headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[3].body || "{}"), agentPayload);
  assert.deepEqual(JSON.parse(calls[4].body || "{}"), {
    overallScore: 88,
    overallStars: 4.4,
    reportSummary: "Independent senior evaluations are complete.",
  });

  assert.throws(
    () => createBloomBouquetEvaluatorHttpClient({
      baseUrl: "https://example.com",
      token: "too-short",
      fetchImpl,
    }),
    /32/,
  );
  assert.throws(
    () => createBloomBouquetEvaluatorHttpClient({
      baseUrl: "http://example.com",
      token,
      fetchImpl,
    }),
    /HTTPS|loopback/,
  );

  console.log("BloomBouquet evaluator HTTP client policy tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
