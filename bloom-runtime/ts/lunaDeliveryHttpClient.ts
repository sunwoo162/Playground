export type LunaDeliveryFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

export type LunaDeliveryFetch = (
  input: string,
  init: {
    method: "GET" | "POST" | "PUT";
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<LunaDeliveryFetchResponse>;

export type LunaDeliveryProjectUpsertRequest = {
  slug?: string | null;
  repositoryFullName: string;
  mainSha: string;
  publicUrl: string;
};

export type LunaDeliveryTransitionRequest = {
  state: string;
  failureCode?: string | null;
  failureReason?: string | null;
  localHealth?: string | null;
  publicHealth?: string | null;
  nextRetryAt?: string | null;
};

export type LunaDeliveryRuntimeUpsertRequest = {
  runtimeType: string;
  slotAPort?: number | null;
  slotBPort?: number | null;
  activeSlot?: string | null;
  candidateSlot?: string | null;
};

export type LunaDeliveryRuntimeState = {
  id: number | null;
  runtimeId: string;
  runtimeType: string;
  slotAPort: number | null;
  slotBPort: number | null;
  activeSlot: string | null;
  candidateSlot: string | null;
};

export type LunaDeliveryProjectState = {
  id: number | null;
  slug: string;
  repositoryFullName: string;
  mainSha: string;
  manifestDigest: string | null;
  adoptionState: string;
  deliveryState: string;
  publicUrl: string | null;
  activeReleaseSha: string | null;
  previousHealthyReleaseSha: string | null;
  lastLocalHealth: string | null;
  lastPublicHealth: string | null;
  bloomTeamId: number | null;
  bloomProjectId: number | null;
  bloomSubmissionId: number | null;
  bloomEvaluationRunId: number | null;
  lastFailureCode: string | null;
  lastFailureReason: string | null;
  retryCount: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
};

export type LunaDeliveryProjectDetail = {
  project: LunaDeliveryProjectState;
  runtimes: LunaDeliveryRuntimeState[];
};

export type LunaDeliveryHttpClient = {
  upsertProject(slug: string, request: LunaDeliveryProjectUpsertRequest): Promise<LunaDeliveryProjectState>;
  getProject(slug: string): Promise<LunaDeliveryProjectDetail>;
  transition(slug: string, request: LunaDeliveryTransitionRequest): Promise<LunaDeliveryProjectState>;
  upsertRuntime(
    slug: string,
    runtimeId: string,
    request: LunaDeliveryRuntimeUpsertRequest,
  ): Promise<LunaDeliveryRuntimeState>;
};

export type LunaDeliveryHttpClientOptions = {
  baseUrl: string;
  token: string;
  fetchImpl?: LunaDeliveryFetch;
};

export class LunaDeliveryHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "LunaDeliveryHttpError";
  }
}

function normalizeBaseUrl(value: string) {
  const input = value.trim();
  if (!input) throw new Error("Luna delivery API base URL is required.");

  const url = new URL(input);
  const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Luna delivery API allows HTTPS or loopback HTTP only.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Luna delivery API base URL cannot include credential, query, or hash data.");
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function requireToken(value: string) {
  const token = value.trim();
  if (token.length < 32) {
    throw new Error("Luna delivery token must be at least 32 characters.");
  }
  return token;
}

function pathSegment(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return encodeURIComponent(trimmed);
}

async function parseJson<T>(response: LunaDeliveryFetchResponse): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new LunaDeliveryHttpError(
      "Luna delivery API response is not valid JSON.",
      response.status,
    );
  }
}

async function errorDetail(response: LunaDeliveryFetchResponse) {
  try {
    const text = (await response.text()).replace(/\s+/g, " ").trim();
    return text.slice(0, 300);
  } catch {
    return "";
  }
}

export function createLunaDeliveryHttpClient(
  options: LunaDeliveryHttpClientOptions,
): LunaDeliveryHttpClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const token = requireToken(options.token);
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as LunaDeliveryFetch);
  if (typeof fetchImpl !== "function") {
    throw new Error("Luna delivery Runtime has no fetch implementation.");
  }

  const request = async <T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
  ): Promise<T> => {
    const headers: Record<string, string> = {
      "X-Luna-Delivery-Token": token,
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
    if (!response.ok) {
      const detail = await errorDetail(response);
      throw new LunaDeliveryHttpError(
        detail
          ? `Luna delivery API ${response.status}: ${detail}`
          : `Luna delivery API request failed: HTTP ${response.status}`,
        response.status,
      );
    }
    return parseJson<T>(response);
  };

  return {
    async upsertProject(slug, payload) {
      const projectSlug = pathSegment(slug, "project slug");
      return request<LunaDeliveryProjectState>(
        "PUT",
        `/internal/luna/delivery/projects/${projectSlug}`,
        payload,
      );
    },
    async getProject(slug) {
      const projectSlug = pathSegment(slug, "project slug");
      return request<LunaDeliveryProjectDetail>(
        "GET",
        `/internal/luna/delivery/projects/${projectSlug}`,
      );
    },
    async transition(slug, payload) {
      const projectSlug = pathSegment(slug, "project slug");
      return request<LunaDeliveryProjectState>(
        "POST",
        `/internal/luna/delivery/projects/${projectSlug}/transition`,
        payload,
      );
    },
    async upsertRuntime(slug, runtimeId, payload) {
      const projectSlug = pathSegment(slug, "project slug");
      const runtime = pathSegment(runtimeId, "runtime id");
      return request<LunaDeliveryRuntimeState>(
        "PUT",
        `/internal/luna/delivery/projects/${projectSlug}/runtimes/${runtime}`,
        payload,
      );
    },
  };
}
