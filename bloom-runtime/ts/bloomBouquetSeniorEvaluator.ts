import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import {
  SENIOR_EVALUATION_REPORT_CONTRACT,
  type AgentEvaluation,
  type EvaluationConfidence,
  type EvaluationPriority,
  type EvaluationSeverity,
} from "./evaluationPlatform";
import type {
  AggregateEvaluationResult,
  AggregateEvaluatorInput,
  IndependentEvaluatorInput,
  IndependentEvaluatorRole,
  SeniorEvaluatorRunner,
} from "./bloomBouquetEvaluatorWorker";

const MAX_JSONL_LINE_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const SEVERITIES: EvaluationSeverity[] = ["info", "low", "medium", "high", "critical"];
const PRIORITIES: EvaluationPriority[] = ["p3", "p2", "p1", "p0"];
const CONFIDENCES: EvaluationConfidence[] = ["low", "medium", "high"];

const ROLE_SCOPE: Record<IndependentEvaluatorRole, string> = {
  "user-a": "Evaluate first-time comprehension, primary task discoverability, task completion friction, error recovery, and whether the product's value is understandable without prior knowledge.",
  "user-b": "Evaluate repeat-use and alternate-path usability, navigation predictability, recovery from edge cases, and whether repeated core tasks remain efficient.",
  "ux-research": "Evaluate information architecture, visual hierarchy, cognitive load, affordance, interaction cost, progressive disclosure, and task flow quality from observable evidence.",
  frontend: "Evaluate rendering ownership, component boundaries, state colocation, interaction consistency, client-side failure handling, accessibility integration, and Core Web Vitals only when directly evidenced.",
  backend: "Evaluate API boundaries, validation, authorization boundaries, transaction scope, idempotency, query behavior, failure semantics, rate limiting, and operational resilience only from available backend evidence.",
  security: "Evaluate attack surface, trust boundaries, authentication/authorization behavior, XSS/CSRF/CSP exposure, secret handling, iframe sandboxing, postMessage origin validation, and input trust assumptions from observable evidence.",
  accessibility: "Evaluate semantic structure, keyboard operability, focus management, accessible names, contrast evidence when observable, error association, and WCAG-aligned interaction barriers.",
  performance: "Evaluate loading behavior, network/runtime cost, rendering responsiveness, asset/bundle evidence, caching signals, and Core Web Vitals only when measured or directly observed.",
  qa: "Evaluate functional completeness, happy-path and failure-path behavior, boundary cases, error recovery, regression risk, and the credibility of available verification evidence.",
  documentation: "Evaluate setup clarity, user/developer guidance, operational notes, API or integration documentation, known limitations, and whether documented claims match observable behavior.",
  "code-review": "Evaluate source-level correctness, maintainability, separation of concerns, coupling, defensive handling, testability, and code-quality risks only where repository source is actually accessible.",
};

export const INDEPENDENT_EVALUATOR_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "score",
    "stars",
    "assessment",
    "evidence",
    "severity",
    "impact",
    "recommendation",
    "priority",
    "confidence",
    "technicalTerms",
  ],
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    stars: { type: "number", minimum: 1, maximum: 5 },
    assessment: { type: "string", minLength: 1, maxLength: 5000 },
    evidence: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: { type: "string", minLength: 1, maxLength: 1000 },
    },
    severity: { type: "string", enum: SEVERITIES },
    impact: { type: "string", minLength: 1, maxLength: 5000 },
    recommendation: { type: "string", minLength: 1, maxLength: 5000 },
    priority: { type: "string", enum: PRIORITIES },
    confidence: { type: "string", enum: CONFIDENCES },
    technicalTerms: {
      type: "array",
      maxItems: 40,
      items: { type: "string", minLength: 1, maxLength: 160 },
    },
  },
} as const;

export const AGGREGATE_EVALUATOR_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overallScore", "overallStars", "reportSummary"],
  properties: {
    overallScore: { type: "integer", minimum: 0, maximum: 100 },
    overallStars: { type: "number", minimum: 1, maximum: 5 },
    reportSummary: { type: "string", minLength: 1, maxLength: 20000 },
  },
} as const;

export type CodexEvaluatorRequest = {
  title: string;
  prompt: string;
  outputSchema: Record<string, unknown>;
  approvalPolicy: "never";
  sandboxPolicy: {
    type: "readOnly";
    networkAccess: true;
  };
};

export type CodexEvaluatorTransport = {
  run(request: CodexEvaluatorRequest): Promise<unknown>;
};

export type CodexSeniorEvaluatorRunnerOptions = {
  transport?: CodexEvaluatorTransport;
  command?: string;
  cwd?: string;
  timeoutMs?: number;
};

function evidenceAvailability(input: IndependentEvaluatorInput): string {
  const frontend = input.submission.frontendRepositoryUrl ?? "NOT PROVIDED";
  const backend = input.submission.backendRepositoryUrl ?? "NOT PROVIDED";
  const authChecklist = input.authChecklist.length > 0
    ? input.authChecklist.map((item) => `- ${item}`).join("\n")
    : "- No Bouquet authentication checklist applies to this submission.";

  return [
    `Demo URL: ${input.submission.demoUrl}`,
    `Frontend repository: ${frontend}`,
    `Backend repository: ${backend}`,
    "Bouquet authentication evidence checklist:",
    authChecklist,
  ].join("\n");
}

export function buildIndependentEvaluatorPrompt(input: IndependentEvaluatorInput): string {
  return [
    `You are the BloomBouquet senior ${input.role} evaluator for ${input.projectName} (${input.teamName}).`,
    `Act as a practitioner with at least ${SENIOR_EVALUATION_REPORT_CONTRACT.minimumExperienceYears}+ years of domain experience.`,
    "Your judgment is independent. You are not given other evaluators' scores or conclusions and must not speculate about them.",
    "",
    `Domain scope: ${ROLE_SCOPE[input.role]}`,
    "",
    "Available submission evidence:",
    evidenceAvailability(input),
    "",
    "Evidence rules:",
    "- Inspect the deployed product and any actually accessible repository evidence before material conclusions.",
    "- A URL or declared metadata is not proof that the behavior or implementation was successfully observed.",
    "- If a browser interaction, source detail, metric, test result, authentication behavior, or runtime fact cannot be observed, state it as not observed and lower confidence instead of inventing it.",
    "- Do not claim backend/source internals when the relevant repository evidence is not provided or cannot be accessed.",
    "- Tie every material finding in the order evidence → impact → recommendation.",
    "- Use senior-level technical terminology only when it improves diagnostic precision.",
    "",
    "Safety and mutation rules:",
    "- Do not modify product source files, repositories, deployments, remote services, or user data.",
    "- Do not create a branch, commit, push, pull request, merge, release, or deployment.",
    "- Use only read-only inspection and safe observation. Never expose credentials, tokens, cookies, authorization codes, PKCE verifiers, or secrets in the report.",
    "",
    "Required report semantics:",
    `- Assessment: concise senior diagnosis for the ${input.role} domain.`,
    "- Evidence: concrete observed facts or explicit 'not observed' limitations.",
    "- Severity: info, low, medium, high, or critical.",
    "- Impact: product/engineering consequence of the evidence.",
    "- Recommendation: concrete remediation or preservation action.",
    "- Priority: p3, p2, p1, or p0.",
    "- Confidence: low, medium, or high based on evidence quality.",
    "- technicalTerms: only the professional terms materially used in the diagnosis.",
    "",
    "Return only the JSON object required by the supplied output schema.",
  ].join("\n");
}

export function buildAggregateEvaluatorPrompt(input: AggregateEvaluatorInput): string {
  return [
    `You are the BloomBouquet Process Evaluator for ${input.projectName} (${input.teamName}).`,
    "All required independent senior evaluations have completed. Aggregate them without changing their source findings.",
    "Do not invent new evidence, test results, metrics, source observations, or security findings.",
    "Preserve disagreement or uncertainty between independent evaluators instead of forcing false consensus.",
    "Prioritize high/critical severity and p0/p1 recommendations when forming the final technical summary.",
    "The final reportSummary should explain overall technical maturity, strongest evidence-backed qualities, the most important risks, and prioritized next actions.",
    "Return only overallScore (0-100), overallStars (1-5), and reportSummary as strict JSON.",
    "",
    "Independent evaluations:",
    JSON.stringify(input.evaluations, null, 2),
  ].join("\n");
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const expectedSet = new Set(expected);
  const unexpected = Object.keys(record).filter((key) => !expectedSet.has(key));
  const missing = expected.filter((key) => !(key in record));
  if (missing.length > 0) throw new Error(`${label} missing fields: ${missing.join(", ")}`);
  if (unexpected.length > 0) throw new Error(`${label} unexpected fields: ${unexpected.join(", ")}`);
}

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  const result = value.trim();
  if (result.length > maxLength) throw new Error(`${field} exceeds maximum length.`);
  return result;
}

function requireStringArray(value: unknown, field: string, maxItems: number, requireOne = false): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  if (requireOne && value.length === 0) throw new Error(`${field} must contain at least one item.`);
  if (value.length > maxItems) throw new Error(`${field} has too many items.`);
  return value.map((item, index) => requireString(item, `${field}[${index}]`, 1000));
}

function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${field} has an invalid value.`);
  }
  return value as T;
}

function requireIntegerRange(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function requireNumberRange(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} must be between ${min} and ${max}.`);
  }
  return Math.round(value * 10) / 10;
}

export function parseIndependentEvaluatorOutput(
  value: unknown,
  role: IndependentEvaluatorRole,
): AgentEvaluation {
  const record = asRecord(value, "Independent evaluator output");
  const fields = [
    "score",
    "stars",
    "assessment",
    "evidence",
    "severity",
    "impact",
    "recommendation",
    "priority",
    "confidence",
    "technicalTerms",
  ] as const;
  requireExactKeys(record, fields, "Independent evaluator output");

  const severity = requireEnum(record.severity, "severity", SEVERITIES);
  const priority = requireEnum(record.priority, "priority", PRIORITIES);
  const confidence = requireEnum(record.confidence, "confidence", CONFIDENCES);

  return {
    role,
    score: requireIntegerRange(record.score, "score", 0, 100),
    stars: requireNumberRange(record.stars, "stars", 1, 5),
    assessment: requireString(record.assessment, "assessment", 5000),
    evidence: requireStringArray(record.evidence, "evidence", 30, true),
    severity,
    impact: requireString(record.impact, "impact", 5000),
    recommendation: requireString(record.recommendation, "recommendation", 5000),
    priority,
    confidence,
    technicalTerms: requireStringArray(record.technicalTerms, "technicalTerms", 40),
  };
}

export function parseAggregateEvaluatorOutput(value: unknown): AggregateEvaluationResult {
  const record = asRecord(value, "Process Evaluator output");
  const fields = ["overallScore", "overallStars", "reportSummary"] as const;
  requireExactKeys(record, fields, "Process Evaluator output");

  return {
    overallScore: requireIntegerRange(record.overallScore, "overallScore", 0, 100),
    overallStars: requireNumberRange(record.overallStars, "overallStars", 1, 5),
    reportSummary: requireString(record.reportSummary, "reportSummary", 20000),
  };
}

function createDefaultCodexTransport(options: {
  command: string;
  cwd: string;
  timeoutMs: number;
}): CodexEvaluatorTransport {
  return {
    async run(request) {
      const child = spawn(options.command, ["app-server", "--listen", "stdio://"], {
        cwd: options.cwd,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      const iterator = lines[Symbol.asyncIterator]();
      let childError: Error | null = null;
      let timedOut = false;
      let stderrBytes = 0;

      child.on("error", (error) => {
        childError = error;
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderrBytes += chunk.length;
        if (stderrBytes > MAX_JSONL_LINE_BYTES) child.kill();
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, options.timeoutMs);

      const write = (message: unknown) => {
        if (!child.stdin.writable) throw new Error("Codex evaluator stdin is not writable.");
        child.stdin.write(`${JSON.stringify(message)}\n`);
      };

      const read = async (): Promise<Record<string, unknown>> => {
        const next = await iterator.next();
        if (next.done) {
          if (timedOut) throw new Error(`Codex evaluator timed out after ${options.timeoutMs}ms.`);
          if (childError) throw new Error(`Codex evaluator process failed: ${childError.message}`);
          throw new Error("Codex evaluator app-server exited before the protocol completed.");
        }
        const line = String(next.value).trim();
        if (Buffer.byteLength(line, "utf8") > MAX_JSONL_LINE_BYTES) {
          throw new Error("Codex evaluator JSONL message exceeded the 10MB safety limit.");
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          throw new Error("Codex evaluator returned invalid JSONL.");
        }
        return asRecord(parsed, "Codex app-server message");
      };

      const waitForResponse = async (id: number): Promise<Record<string, unknown>> => {
        while (true) {
          const message = await read();
          if (message.id !== id) continue;
          if (message.error !== undefined) throw new Error(`Codex evaluator request ${id} failed.`);
          return asRecord(message.result, `Codex evaluator response ${id}`);
        }
      };

      try {
        write({
          method: "initialize",
          id: 0,
          params: {
            clientInfo: {
              name: "bloombouquet_evaluator",
              title: "BloomBouquet Senior Evaluator",
              version: "0.1.0",
            },
            capabilities: {},
          },
        });
        await waitForResponse(0);
        write({ method: "initialized", params: {} });

        write({
          method: "thread/start",
          id: 1,
          params: {
            cwd: options.cwd,
            approvalPolicy: request.approvalPolicy,
            sandbox: "read-only",
            serviceName: "bloombouquet_evaluator",
          },
        });
        const threadResult = await waitForResponse(1);
        const thread = asRecord(threadResult.thread, "Codex evaluator thread");
        const threadId = requireString(thread.id, "thread.id", 256);

        write({
          method: "turn/start",
          id: 2,
          params: {
            threadId,
            input: [{ type: "text", text: request.prompt }],
            cwd: options.cwd,
            title: request.title,
            approvalPolicy: request.approvalPolicy,
            sandboxPolicy: request.sandboxPolicy,
            outputSchema: request.outputSchema,
          },
        });
        const turnResult = await waitForResponse(2);
        const turn = asRecord(turnResult.turn, "Codex evaluator turn");
        const turnId = requireString(turn.id, "turn.id", 256);

        let finalMessage: string | null = null;
        while (true) {
          const message = await read();
          const method = typeof message.method === "string" ? message.method : "";
          if (method === "item/completed") {
            const params = asRecord(message.params, "item/completed params");
            const item = asRecord(params.item, "item/completed item");
            if (item.type === "agentMessage" && typeof item.text === "string") {
              finalMessage = item.text;
            }
          }
          if (method !== "turn/completed") continue;

          const params = asRecord(message.params, "turn/completed params");
          const completedTurn = asRecord(params.turn, "turn/completed turn");
          if (completedTurn.id !== turnId) continue;
          if (completedTurn.status !== "completed") {
            throw new Error("Codex evaluator turn did not complete successfully.");
          }
          break;
        }

        if (!finalMessage) throw new Error("Codex evaluator final agentMessage is missing.");
        try {
          return JSON.parse(finalMessage) as unknown;
        } catch {
          throw new Error("Codex evaluator final message is not valid JSON.");
        }
      } finally {
        clearTimeout(timeout);
        lines.close();
        child.stdin.end();
        if (!child.killed) child.kill();
      }
    },
  };
}

export function createCodexSeniorEvaluatorRunner(
  options: CodexSeniorEvaluatorRunnerOptions = {},
): SeniorEvaluatorRunner {
  const transport = options.transport ?? createDefaultCodexTransport({
    command: options.command?.trim() || "codex",
    cwd: options.cwd?.trim() || process.cwd(),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  return {
    async evaluate(input) {
      const output = await transport.run({
        title: `BloomBouquet ${input.role} evaluator run ${input.runId}`,
        prompt: buildIndependentEvaluatorPrompt(input),
        outputSchema: INDEPENDENT_EVALUATOR_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly", networkAccess: true },
      });
      return parseIndependentEvaluatorOutput(output, input.role);
    },
    async aggregate(input) {
      const output = await transport.run({
        title: `BloomBouquet process-evaluator run ${input.runId}`,
        prompt: buildAggregateEvaluatorPrompt(input),
        outputSchema: AGGREGATE_EVALUATOR_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly", networkAccess: true },
      });
      return parseAggregateEvaluatorOutput(output);
    },
  };
}
