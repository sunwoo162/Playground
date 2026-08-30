export type LunaHealthFetchResponse = {
  status: number;
};

export type LunaHealthFetch = (
  url: string,
  init?: {
    signal?: AbortSignal;
    redirect?: "follow" | "error" | "manual";
  },
) => Promise<LunaHealthFetchResponse>;

export type LunaHealthResult = {
  url: string;
  status: number;
};

type HealthProbeInput = {
  healthPath: string;
  timeoutMs?: number;
  fetchImpl?: LunaHealthFetch;
};

export type VerifyLocalHealthInput = HealthProbeInput & {
  port: number;
};

export type VerifyPublicHealthInput = HealthProbeInput & {
  slug: string;
};

const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const defaultFetch: LunaHealthFetch = async (url, init) => {
  const response = await fetch(url, {
    signal: init?.signal,
    redirect: init?.redirect,
  });
  return { status: response.status };
};

function normalizeTimeout(timeoutMs: number | undefined) {
  const value = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    throw new Error(
      `Luna health timeout must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}ms.`,
    );
  }
  return value;
}

function normalizeHealthPath(healthPath: string) {
  const value = healthPath.trim();
  if (!value.startsWith("/")) {
    throw new Error("Luna health path must start with '/'.");
  }
  if (value.includes("?") || value.includes("#") || value.includes("\\")) {
    throw new Error("Luna health path must be a plain URL path without query, fragment, or backslash.");
  }
  const segments = value.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Luna health path cannot contain traversal segments.");
  }
  return value;
}

function assertPort(port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Luna local health port must be an integer between 1 and 65535.");
  }
}

function assertSlug(slug: string) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error("Luna public health slug is invalid.");
  }
}

function appendHealthPath(baseUrl: string, healthPath: string) {
  const suffix = healthPath === "/" ? "" : healthPath.slice(1);
  return new URL(suffix, baseUrl).toString();
}

async function probeHealth(
  url: string,
  timeoutMs: number,
  fetchImpl: LunaHealthFetch,
): Promise<LunaHealthResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Luna health probe timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetchImpl(url, { signal: controller.signal, redirect: "manual" }),
      timeout,
    ]);
    if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 400) {
      throw new Error(`Luna health probe failed with HTTP ${response.status}.`);
    }
    return { url, status: response.status };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Luna health probe failed.");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function verifyLocalHealth(
  input: VerifyLocalHealthInput,
): Promise<LunaHealthResult> {
  assertPort(input.port);
  const healthPath = normalizeHealthPath(input.healthPath);
  const timeoutMs = normalizeTimeout(input.timeoutMs);
  const url = appendHealthPath(`http://127.0.0.1:${input.port}/`, healthPath);
  return probeHealth(url, timeoutMs, input.fetchImpl ?? defaultFetch);
}

export async function verifyPublicHealth(
  input: VerifyPublicHealthInput,
): Promise<LunaHealthResult> {
  assertSlug(input.slug);
  const healthPath = normalizeHealthPath(input.healthPath);
  const timeoutMs = normalizeTimeout(input.timeoutMs);
  const url = appendHealthPath(
    `https://bloombouquet.https.gsmsv.site/apps/${input.slug}/`,
    healthPath,
  );
  return probeHealth(url, timeoutMs, input.fetchImpl ?? defaultFetch);
}
