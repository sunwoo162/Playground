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
  authPolicyId?: string | null;
  bouquetClientId?: string | null;
  bouquetRedirectUri?: string | null;
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

export const BOUQUET_AUTH_EVALUATION_CHECKLIST = [
  "익명 상태에서 보호 화면/API가 노출되지 않고 꽃다발 로그인 시작 경로가 명확한지 확인한다.",
  "프로젝트가 이메일/비밀번호를 직접 수집하지 않고 중앙 BloomBouquet 꽃다발 Portal로 이동하는지 확인한다.",
  "꽃다발 계정으로 로그인한 뒤 등록된 callback으로 돌아와 프로젝트 세션이 생성되고 보호 기능을 사용할 수 있는지 확인한다.",
  "이미 중앙 꽃다발 세션이 있는 상태에서 다른 꽃다발 프로젝트로 이동했을 때 credential 재입력 없이 SSO가 이어지는지 확인한다.",
  "callback의 state 누락/불일치, 잘못된 PKCE verifier, authorization code 재사용이 정상 세션으로 승격되지 않는지 확인한다.",
  "프로젝트 로그아웃 뒤 해당 프로젝트 세션은 무효화되며 중앙 꽃다발 세션 정책과 프로젝트 세션 경계가 혼동되지 않는지 확인한다.",
  "브라우저 저장소, URL, 로그, 오류 UI에서 bouquet access token/code/verifier가 노출되지 않는지 확인한다.",
] as const;

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
    "When requiresAuth=true, treat the Bouquet SSO checklist as observable evaluation evidence rather than trusting declared auth metadata alone.",
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
  if (input.authPolicyId !== "bouquet") {
    throw new Error("Bouquet authentication projects require authPolicyId=bouquet.");
  }
  if (!input.bouquetClientId?.startsWith("bouquet-submission-")) {
    throw new Error("Bouquet authentication projects require a provisioned Bouquet OAuth client ID.");
  }
  if (!input.bouquetRedirectUri?.startsWith("https://")) {
    throw new Error("Bouquet authentication projects require an HTTPS Bouquet redirect URI.");
  }

  const demo = new URL(input.demoUrl);
  const redirect = new URL(input.bouquetRedirectUri);
  if (demo.origin !== redirect.origin) {
    throw new Error("Bouquet redirect URI must share the demo URL origin.");
  }
}

export function bouquetAuthEvaluationChecklist(input: ProjectSubmissionInput): readonly string[] {
  assertBouquetAuthCompatibility(input);
  return input.requiresAuth ? BOUQUET_AUTH_EVALUATION_CHECKLIST : [];
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
