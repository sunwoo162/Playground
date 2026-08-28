import type {
  BuilderOrchestrationSnapshot,
  BuilderOrchestrationSnapshotWrite,
  BuilderWorkerClaim,
  BuilderWorkerClient,
  BuilderWorkerExecutionResult,
  BuilderWorkerRunState,
} from "./builderWorkerAdapter";

export type BuilderWorkerFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

export type BuilderWorkerFetch = (
  input: string,
  init: {
    method: "GET" | "POST" | "PUT";
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<BuilderWorkerFetchResponse>;

export type BuilderWorkerHttpClientOptions = {
  baseUrl: string;
  token: string;
  fetchImpl?: BuilderWorkerFetch;
};

export class BuilderWorkerHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "BuilderWorkerHttpError";
  }
}

function normalizeBaseUrl(value: string) {
  const input = value.trim();
  if (!input) throw new Error("Builder worker API base URL이 필요합니다.");

  const url = new URL(input);
  const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Builder worker API는 HTTPS 또는 loopback HTTP만 허용합니다.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Builder worker API base URL에 credential, query, hash를 포함할 수 없습니다.");
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function requireToken(value: string) {
  const token = value.trim();
  if (token.length < 32) {
    throw new Error("BUILDER_WORKER_TOKEN은 32자 이상이어야 합니다.");
  }
  return token;
}

async function parseJson<T>(response: BuilderWorkerFetchResponse): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new BuilderWorkerHttpError("Builder worker API 응답 JSON을 해석할 수 없습니다.", response.status);
  }
}

async function errorDetail(response: BuilderWorkerFetchResponse) {
  try {
    const text = (await response.text()).replace(/\s+/g, " ").trim();
    return text.slice(0, 300);
  } catch {
    return "";
  }
}

export function createBuilderWorkerHttpClient(
  options: BuilderWorkerHttpClientOptions,
): BuilderWorkerClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const token = requireToken(options.token);
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as BuilderWorkerFetch);
  if (typeof fetchImpl !== "function") {
    throw new Error("Builder worker Runtime에 fetch 구현이 없습니다.");
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
      throw new BuilderWorkerHttpError(
        detail
          ? `Builder worker API ${response.status}: ${detail}`
          : `Builder worker API 요청 실패: HTTP ${response.status}`,
        response.status,
      );
    }
    return parseJson<T>(response);
  };

  return {
    async claim(workerId) {
      return request<BuilderWorkerClaim>(
        "POST",
        "/internal/builder/worker/runs/claim",
        { workerId },
        true,
      );
    },
    async heartbeat(runId, workerId) {
      const state = await request<BuilderWorkerRunState>(
        "POST",
        `/internal/builder/worker/runs/${runId}/heartbeat`,
        { workerId },
      );
      if (!state) throw new Error("heartbeat 응답이 비어 있습니다.");
      return state;
    },
    async loadSnapshot(runId, workerId) {
      return request<BuilderOrchestrationSnapshot>(
        "GET",
        `/internal/builder/worker/runs/${runId}/snapshot?workerId=${encodeURIComponent(workerId)}`,
        undefined,
        true,
      );
    },
    async saveSnapshot(runId, workerId, snapshot: BuilderOrchestrationSnapshotWrite) {
      const saved = await request<BuilderOrchestrationSnapshot>(
        "PUT",
        `/internal/builder/worker/runs/${runId}/snapshot`,
        { workerId, ...snapshot },
      );
      if (!saved) throw new Error("snapshot 저장 응답이 비어 있습니다.");
      return saved;
    },
    async complete(runId, workerId, result: BuilderWorkerExecutionResult) {
      const state = await request<BuilderWorkerRunState>(
        "POST",
        `/internal/builder/worker/runs/${runId}/complete`,
        {
          workerId,
          repositoryFullName: result.repositoryFullName,
          previewUrl: result.previewUrl,
          bloomBouquetRegistrationUrl: result.bloomBouquetRegistrationUrl ?? null,
        },
      );
      if (!state) throw new Error("complete 응답이 비어 있습니다.");
      return state;
    },
    async fail(runId, workerId, failureReason) {
      const state = await request<BuilderWorkerRunState>(
        "POST",
        `/internal/builder/worker/runs/${runId}/fail`,
        { workerId, failureReason },
      );
      if (!state) throw new Error("fail 응답이 비어 있습니다.");
      return state;
    },
  };
}
