import type {
  EvaluationConfidence,
  EvaluationPriority,
  EvaluationSeverity,
} from "./evaluationPlatform";

export type BloomBouquetEvaluationClaim = {
  runId: number;
  submissionId: number;
  projectId: number;
  teamId: number;
  projectName: string;
  teamName: string;
  version: string;
  demoUrl: string;
  frontendRepositoryUrl: string | null;
  backendRepositoryUrl: string | null;
  requiresAuth: boolean;
  authPolicyId: string | null;
  bouquetClientId: string | null;
  bouquetRedirectUri: string | null;
};

export type BloomBouquetAgentResultPayload = {
  agentRole: string;
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

export type BloomBouquetAgentEvaluationResponse = BloomBouquetAgentResultPayload & {
  createdAt?: string;
};

export type BloomBouquetCompleteEvaluationPayload = {
  overallScore: number;
  overallStars: number;
  reportSummary: string;
};

export type BloomBouquetSubmissionResponse = {
  id?: number;
  version?: string;
  demoUrl?: string;
  frontendRepositoryUrl?: string | null;
  backendRepositoryUrl?: string | null;
  requiresAuth?: boolean;
  authPolicyId?: string | null;
  bouquetClientId?: string | null;
  bouquetRedirectUri?: string | null;
  evaluationRunId?: number | null;
  evaluationStatus?: string | null;
  overallScore?: number | null;
  overallStars?: number | null;
  createdAt?: string;
};

export type BloomBouquetEvaluatorClient = {
  claim(): Promise<BloomBouquetEvaluationClaim | null>;
  listAgentEvaluations(runId: number): Promise<BloomBouquetAgentEvaluationResponse[]>;
  recordAgentEvaluation(
    runId: number,
    payload: BloomBouquetAgentResultPayload,
  ): Promise<BloomBouquetAgentEvaluationResponse>;
  complete(
    runId: number,
    payload: BloomBouquetCompleteEvaluationPayload,
  ): Promise<BloomBouquetSubmissionResponse>;
};

export type BloomBouquetEvaluatorFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

export type BloomBouquetEvaluatorFetch = (
  input: string,
  init: {
    method: "GET" | "POST" | "PUT";
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<BloomBouquetEvaluatorFetchResponse>;

export type BloomBouquetEvaluatorHttpClientOptions = {
  baseUrl: string;
  token: string;
  fetchImpl?: BloomBouquetEvaluatorFetch;
};

export class BloomBouquetEvaluatorHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "BloomBouquetEvaluatorHttpError";
  }
}

function normalizeBaseUrl(value: string): string {
  const input = value.trim();
  if (!input) throw new Error("BloomBouquet evaluator API base URL이 필요합니다.");

  const url = new URL(input);
  const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("BloomBouquet evaluator API는 HTTPS 또는 loopback HTTP만 허용합니다.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("BloomBouquet evaluator API base URL에 credential, query, hash를 포함할 수 없습니다.");
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function requireToken(value: string): string {
  const token = value.trim();
  if (token.length < 32) {
    throw new Error("BUILDER_WORKER_TOKEN은 32자 이상이어야 합니다.");
  }
  return token;
}

async function parseJson<T>(response: BloomBouquetEvaluatorFetchResponse): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new BloomBouquetEvaluatorHttpError(
      "BloomBouquet evaluator API 응답 JSON을 해석할 수 없습니다.",
      response.status,
    );
  }
}

async function errorDetail(response: BloomBouquetEvaluatorFetchResponse): Promise<string> {
  try {
    return (await response.text()).replace(/\s+/g, " ").trim().slice(0, 300);
  } catch {
    return "";
  }
}

export function createBloomBouquetEvaluatorHttpClient(
  options: BloomBouquetEvaluatorHttpClientOptions,
): BloomBouquetEvaluatorClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const token = requireToken(options.token);
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as BloomBouquetEvaluatorFetch);
  if (typeof fetchImpl !== "function") {
    throw new Error("BloomBouquet evaluator Runtime에 fetch 구현이 없습니다.");
  }

  const request = async <T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body: unknown | undefined,
    allowNoContent = false,
  ): Promise<T | null> => {
    const headers: Record<string, string> = {
      "X-Builder-Worker-Token": token,
    };
    const init: {
      method: "GET" | "POST" | "PUT";
      headers: Record<string, string>;
      body?: string;
    } = { method, headers };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const response = await fetchImpl(`${baseUrl}${path}`, init);
    if (allowNoContent && response.status === 204) return null;
    if (!response.ok) {
      const detail = await errorDetail(response);
      throw new BloomBouquetEvaluatorHttpError(
        detail
          ? `BloomBouquet evaluator API ${response.status}: ${detail}`
          : `BloomBouquet evaluator API 요청 실패: HTTP ${response.status}`,
        response.status,
      );
    }
    return parseJson<T>(response);
  };

  return {
    async claim() {
      return request<BloomBouquetEvaluationClaim>(
        "POST",
        "/internal/builder/worker/bloom-bouquet/runs/claim",
        undefined,
        true,
      );
    },
    async listAgentEvaluations(runId) {
      const result = await request<BloomBouquetAgentEvaluationResponse[]>(
        "GET",
        `/internal/builder/worker/bloom-bouquet/runs/${runId}/agents`,
        undefined,
      );
      if (!result) throw new Error("BloomBouquet evaluator Agent 목록 응답이 비어 있습니다.");
      return result;
    },
    async recordAgentEvaluation(runId, payload) {
      const result = await request<BloomBouquetAgentEvaluationResponse>(
        "POST",
        `/internal/builder/worker/bloom-bouquet/runs/${runId}/agents`,
        payload,
      );
      if (!result) throw new Error("BloomBouquet evaluator Agent 저장 응답이 비어 있습니다.");
      return result;
    },
    async complete(runId, payload) {
      const result = await request<BloomBouquetSubmissionResponse>(
        "POST",
        `/internal/builder/worker/bloom-bouquet/runs/${runId}/complete`,
        payload,
      );
      if (!result) throw new Error("BloomBouquet evaluator 완료 응답이 비어 있습니다.");
      return result;
    },
  };
}
