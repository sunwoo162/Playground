export type LunaHealthFetchResponse = {
  status: number;
  headers?: {
    get(name: string): string | null;
  };
  text?: () => Promise<string>;
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

export type VerifyPublicDocumentInput = HealthProbeInput & {
  publicUrl: string;
};

const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
const MAX_PUBLIC_ASSETS = 50;
const PUBLIC_ASSET_CONCURRENCY = 5;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BLOOM_BOUQUET_ORIGIN = "https://bloombouquet.https.gsmsv.site";
const PUBLIC_APP_PATH_PATTERN = /^\/apps\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/;

const defaultFetch: LunaHealthFetch = async (url, init) => {
  const response = await fetch(url, {
    signal: init?.signal,
    redirect: init?.redirect,
  });
  return {
    status: response.status,
    headers: {
      get(name) {
        return response.headers.get(name);
      },
    },
    text: () => response.text(),
  };
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

function assertHealthyStatus(response: LunaHealthFetchResponse, label: string) {
  if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 400) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }
}

async function withTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Luna health probe timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchHealthy(
  url: string,
  timeoutMs: number,
  fetchImpl: LunaHealthFetch,
  redirect: "follow" | "error" | "manual",
  label: string,
): Promise<LunaHealthFetchResponse> {
  return withTimeout(timeoutMs, async (signal) => {
    const response = await fetchImpl(url, { signal, redirect });
    assertHealthyStatus(response, label);
    return response;
  });
}

async function probeHealth(
  url: string,
  timeoutMs: number,
  fetchImpl: LunaHealthFetch,
): Promise<LunaHealthResult> {
  try {
    const response = await fetchHealthy(
      url,
      timeoutMs,
      fetchImpl,
      "manual",
      "Luna health probe",
    );
    return { url, status: response.status };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Luna health probe failed.");
  }
}

function normalizePublicAppUrl(value: string) {
  const input = value.trim();
  if (!input) throw new Error("Luna public document URL is required.");

  const url = new URL(input);
  if (url.origin !== BLOOM_BOUQUET_ORIGIN) {
    throw new Error("Luna public document URL must use the canonical BloomBouquet origin.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Luna public document URL cannot include credentials, query, or fragment data.");
  }
  const match = PUBLIC_APP_PATH_PATTERN.exec(url.pathname);
  if (!match || !SLUG_PATTERN.test(match[1] ?? "")) {
    throw new Error("Luna public document URL must use the canonical /apps/<slug>/ prefix.");
  }
  return url;
}

function attributeValue(tag: string, attributeName: string): string | undefined {
  const pattern = new RegExp(
    `\\b${attributeName}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'=<>]+))`,
    "i",
  );
  const match = pattern.exec(tag);
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  if (value === undefined) return undefined;
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim();
}

function requiredAssetReferences(html: string): string[] {
  const references: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = attributeValue(match[0], "src");
    if (src) references.push(src);
  }
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attributeValue(match[0], "rel");
    const href = attributeValue(match[0], "href");
    if (!href || !rel) continue;
    if (rel.toLowerCase().split(/\s+/).includes("stylesheet")) {
      references.push(href);
    }
  }
  return references;
}

function resolveSameOriginAssets(
  html: string,
  documentUrl: URL,
  publicBaseUrl: URL,
): string[] {
  const assets = new Set<string>();
  for (const reference of requiredAssetReferences(html)) {
    let asset: URL;
    try {
      asset = new URL(reference, documentUrl);
    } catch {
      throw new Error(`Luna public asset URL is invalid: ${reference}`);
    }

    if (asset.origin !== publicBaseUrl.origin) continue;
    if (!asset.pathname.startsWith(publicBaseUrl.pathname)) {
      throw new Error(
        `Luna public asset resolves outside the canonical ${publicBaseUrl.pathname} prefix: ${asset.pathname}`,
      );
    }
    asset.hash = "";
    assets.add(asset.toString());
    if (assets.size > MAX_PUBLIC_ASSETS) {
      throw new Error(
        `Luna public document references more than ${MAX_PUBLIC_ASSETS} required same-origin assets.`,
      );
    }
  }
  return [...assets];
}

async function verifyAssets(
  assets: string[],
  timeoutMs: number,
  fetchImpl: LunaHealthFetch,
) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(PUBLIC_ASSET_CONCURRENCY, assets.length) },
    async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        const assetUrl = assets[index];
        if (assetUrl === undefined) return;
        await fetchHealthy(
          assetUrl,
          timeoutMs,
          fetchImpl,
          "follow",
          `Luna public asset ${assetUrl}`,
        );
      }
    },
  );
  await Promise.all(workers);
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

export async function verifyPublicDocument(
  input: VerifyPublicDocumentInput,
): Promise<LunaHealthResult> {
  const publicBaseUrl = normalizePublicAppUrl(input.publicUrl);
  const healthPath = normalizeHealthPath(input.healthPath);
  const timeoutMs = normalizeTimeout(input.timeoutMs);
  const fetchImpl = input.fetchImpl ?? defaultFetch;
  const documentUrl = new URL(appendHealthPath(publicBaseUrl.toString(), healthPath));

  const response = await withTimeout(timeoutMs, async (signal) => {
    const fetched = await fetchImpl(documentUrl.toString(), {
      signal,
      redirect: "follow",
    });
    assertHealthyStatus(fetched, "Luna public document");

    const contentType = fetched.headers?.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html")) {
      return { response: fetched, html: null as string | null };
    }
    if (typeof fetched.text !== "function") {
      throw new Error("Luna public HTML response cannot be inspected for required assets.");
    }
    const html = await fetched.text();
    return { response: fetched, html };
  });

  if (response.html !== null) {
    const assets = resolveSameOriginAssets(response.html, documentUrl, publicBaseUrl);
    await verifyAssets(assets, timeoutMs, fetchImpl);
  }

  return {
    url: documentUrl.toString(),
    status: response.response.status,
  };
}
