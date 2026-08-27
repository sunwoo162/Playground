import * as assert from "node:assert/strict";

import {
  EVALUATION_AGENT_PERMISSIONS,
  SENIOR_EVALUATION_REPORT_CONTRACT,
  assertBouquetAuthCompatibility,
  createEvaluationPlan,
  summarizeIndependentEvaluations,
} from "./evaluationPlatform";

const submission = {
  teamId: "lily",
  projectId: "project-1",
  version: "1.0.0",
  demoUrl: "https://example.com",
  frontendRepositoryUrl: "https://github.com/example/frontend",
  backendRepositoryUrl: "https://github.com/example/backend",
  requiresAuth: true,
};

const plan = createEvaluationPlan(submission);
const independent = plan.filter((step) => step.stage === "independent");
const aggregate = plan.find((step) => step.role === "process-evaluator");

assert.ok(independent.some((step) => step.role === "user-a"));
assert.ok(independent.some((step) => step.role === "user-b"));
assert.ok(independent.some((step) => step.role === "ux-research"));
assert.ok(independent.some((step) => step.role === "frontend"));
assert.ok(independent.some((step) => step.role === "backend"));
assert.ok(independent.some((step) => step.role === "security"));
assert.ok(independent.some((step) => step.role === "accessibility"));
assert.ok(independent.some((step) => step.role === "performance"));
assert.ok(independent.some((step) => step.role === "qa"));
assert.ok(independent.some((step) => step.role === "documentation"));
assert.ok(independent.some((step) => step.role === "code-review"));

if (!aggregate) {
  throw new Error("Process Evaluator aggregate step must exist.");
}
assert.deepEqual(new Set(aggregate.dependsOn), new Set(independent.map((step) => step.role)));
assert.ok(independent.every((step) => step.dependsOn.length === 0));

const forbiddenPermissions = [
  "repository:write",
  "branch:create",
  "commit:create",
  "push",
  "pull-request:create",
  "pull-request:merge",
  "deployment:publish",
];
for (const permission of forbiddenPermissions) {
  assert.equal(EVALUATION_AGENT_PERMISSIONS.includes(permission as never), false);
}

assert.equal(SENIOR_EVALUATION_REPORT_CONTRACT.minimumExperienceYears, 10);
assert.equal(SENIOR_EVALUATION_REPORT_CONTRACT.autonomy, "independent");
assert.deepEqual(
  [...SENIOR_EVALUATION_REPORT_CONTRACT.requiredSections],
  ["Assessment", "Evidence", "Severity", "Impact", "Recommendation", "Priority", "Confidence"],
);

assert.doesNotThrow(() => assertBouquetAuthCompatibility(submission));
assert.throws(
  () => assertBouquetAuthCompatibility({ ...submission, demoUrl: "http://example.com" }),
  /HTTPS/,
);

const summary = summarizeIndependentEvaluations([
  {
    role: "frontend",
    score: 91.4,
    stars: 4.6,
    assessment: "Component boundaries and rendering ownership are coherent.",
    evidence: ["Project detail state remains feature-local."],
    severity: "info",
    impact: "Maintainability is strong.",
    recommendation: "Preserve state colocation as the feature expands.",
    priority: "p3",
    confidence: "high",
    technicalTerms: ["component boundary", "state colocation"],
  },
  {
    role: "security",
    score: 62,
    stars: 3.1,
    assessment: "The authenticated iframe trust boundary is insufficiently constrained.",
    evidence: ["No explicit postMessage origin allowlist was observed."],
    severity: "high",
    impact: "Cross-origin message handling may increase the attack surface.",
    recommendation: "Validate postMessage origins and define a restrictive sandbox policy.",
    priority: "p0",
    confidence: "high",
    technicalTerms: ["trust boundary", "attack surface"],
  },
]);

assert.equal(summary.overallScore, 77);
assert.equal(summary.overallStars, 3.9);
assert.equal(summary.strengths.length, 1);
assert.equal(summary.criticalIssues.length, 1);
assert.match(summary.recommendations[0], /^security:/);

console.log("BloomBouquet evaluation platform policy tests passed");
