import type { AgentPermission, AgentRole } from "./types";

export type EvaluationAgentRole = Extract<
  AgentRole,
  | "ux-research"
  | "frontend"
  | "backend"
  | "security"
  | "accessibility"
  | "performance"
  | "code-review"
  | "qa"
  | "documentation"
  | "user-a"
  | "user-b"
  | "process-evaluator"
>;

export type EvaluationSeverity = "info" | "low" | "medium" | "high" | "critical";
export type EvaluationPriority = "p3" | "p2" | "p1" | "p0";
export type EvaluationConfidence = "low" | "medium" | "high";
export type EvaluationRunStatus = "queued" | "running" | "aggregating" | "completed" | "failed";

export type ProjectSubmissionInput = {
  teamId: string;
  projectId: string;
  version: string;
  demoUrl: string;
  frontendRepositoryUrl?: string | null;
  backendRepositoryUrl?: string | null;
  requiresAuth: boolean;
};

export type EvaluationPlanStep = {
  role: EvaluationAgentRole;
  stage: "independent" | "aggregate";
  dependsOn: EvaluationAgentRole[];
};

export type AgentEvaluation = {
  role: Exclude<EvaluationAgentRole, "process-evaluator">;
  score: number;
  stars: number;
  assessment: string;
  evidence: string[];
  severity: EvaluationSeverity;
  impact: string;
  recommendation: string;
  priority: EvaluationPriority;
  confidence: EvaluationConfidence;
  technicalTerms: string[];
};

export type EvaluationSummary = {
  overallScore: number;
  overallStars: number;
  strengths: string[];
  criticalIssues: string[];
  recommendations: string[];
};

export const EVALUATION_AGENT_PERMISSIONS: AgentPermission[] = [
  "repository:read",
  "browser:use",
  "test:run",
  "build:run",
];

const BASE_ROLES: Array<Exclude<EvaluationAgentRole, "backend" | "code-review" | "process-evaluator">> = [
  "user-a",
  "user-b",
  "ux-research",
  "frontend",
  "security",
  "accessibility",
  "performance",
  "qa",
  "documentation",
];

export const SENIOR_EVALUATION_REPORT_CONTRACT = {
  minimumExperienceYears: 10,
  autonomy: "independent" as const,
  requiredSections: [
    "Assessment",
    "Evidence",
    "Severity",
    "Impact",
    "Recommendation",
    "Priority",
    "Confidence",
  ] as const,
  rules: [
    "Use senior-level domain terminology only when it increases diagnostic precision.",
    "Tie every technical term to observable evidence and product or engineering impact.",
    "Do not copy, anchor on, or revise a score based on another evaluator's conclusion.",
    "Do not claim production readiness without evidence from the relevant specialist domain.",
  ] as const,
};

export function createEvaluationPlan(input: ProjectSubmissionInput): EvaluationPlanStep[] {
  const independent = [...BASE_ROLES] as EvaluationAgentRole[];

  if (input.backendRepositoryUrl) independent.push("backend");
  if (input.frontendRepositoryUrl || input.backendRepositoryUrl) independent.push("code-review");

  const uniqueIndependent = [...new Set(independent)];

  return [
    ...uniqueIndependent.map((role): EvaluationPlanStep => ({
      role,
      stage: "independent",
      dependsOn: [],
    })),
    {
      role: "process-evaluator",
      stage: "aggregate",
      dependsOn: uniqueIndependent,
    },
  ];
}

export function assertBouquetAuthCompatibility(input: ProjectSubmissionInput): void {
  if (!input.requiresAuth) return;
  if (!input.demoUrl.startsWith("https://")) {
    throw new Error("Bouquet authentication projects require an HTTPS demo URL.");
  }
}

function clampScore(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeAgentEvaluation(evaluation: AgentEvaluation): AgentEvaluation {
  return {
    ...evaluation,
    score: clampScore(Math.round(evaluation.score), 0, 100),
    stars: Math.round(clampScore(evaluation.stars, 1, 5) * 10) / 10,
    evidence: evaluation.evidence.filter(Boolean),
    technicalTerms: [...new Set(evaluation.technicalTerms.filter(Boolean))],
  };
}

export function summarizeIndependentEvaluations(evaluations: AgentEvaluation[]): EvaluationSummary {
  if (evaluations.length === 0) {
    throw new Error("Process Evaluator requires at least one independent evaluation.");
  }

  const normalized = evaluations.map(normalizeAgentEvaluation);
  const overallScore = Math.round(
    normalized.reduce((sum, item) => sum + item.score, 0) / normalized.length,
  );
  const overallStars = Math.round(
    (normalized.reduce((sum, item) => sum + item.stars, 0) / normalized.length) * 10,
  ) / 10;

  const criticalIssues = normalized
    .filter((item) => item.severity === "critical" || item.severity === "high")
    .map((item) => `${item.role}: ${item.assessment}`);

  const strengths = normalized
    .filter((item) => item.score >= 85)
    .map((item) => `${item.role}: ${item.assessment}`);

  const recommendations = normalized
    .sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority))
    .map((item) => `${item.role}: ${item.recommendation}`);

  return {
    overallScore,
    overallStars,
    strengths,
    criticalIssues,
    recommendations,
  };
}

function priorityWeight(priority: EvaluationPriority): number {
  return { p0: 0, p1: 1, p2: 2, p3: 3 }[priority];
}
