const SETTINGS_KEY = "luna.remote-runner-settings.v1";

export type RemoteExecutionMode = "local" | "remote";

export type RemoteRunnerSettings = {
  mode: RemoteExecutionMode;
  baseUrl: string;
};

export const DEFAULT_REMOTE_RUNNER_SETTINGS: RemoteRunnerSettings = {
  mode: "local",
  baseUrl: "http://127.0.0.1:4781",
};

let sessionToken = "";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function matchesHttpProtocol(protocol: string) {
  return protocol === "http:" || protocol === "https:";
}

export function normalizeRemoteRunnerBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  const url = new URL(normalized || DEFAULT_REMOTE_RUNNER_SETTINGS.baseUrl);
  if (!matchesHttpProtocol(url.protocol)) {
    throw new Error("Remote Runner URL은 http 또는 https만 사용할 수 있습니다.");
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !loopback) {
    throw new Error("원격 Runner는 HTTPS를 사용해야 합니다. HTTP는 localhost에서만 허용됩니다.");
  }
  return url.toString().replace(/\/+$/, "");
}

export function loadRemoteRunnerSettings(): RemoteRunnerSettings {
  if (!canUseStorage()) return DEFAULT_REMOTE_RUNNER_SETTINGS;
  const stored = window.localStorage.getItem(SETTINGS_KEY);
  if (!stored) return DEFAULT_REMOTE_RUNNER_SETTINGS;

  try {
    const parsed = JSON.parse(stored) as Partial<RemoteRunnerSettings>;
    return {
      mode: parsed.mode === "remote" ? "remote" : "local",
      baseUrl: normalizeRemoteRunnerBaseUrl(
        parsed.baseUrl ?? DEFAULT_REMOTE_RUNNER_SETTINGS.baseUrl,
      ),
    };
  } catch {
    return DEFAULT_REMOTE_RUNNER_SETTINGS;
  }
}

export function saveRemoteRunnerSettings(settings: RemoteRunnerSettings) {
  const normalized: RemoteRunnerSettings = {
    mode: settings.mode === "remote" ? "remote" : "local",
    baseUrl: normalizeRemoteRunnerBaseUrl(settings.baseUrl),
  };
  if (canUseStorage()) {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function setRemoteRunnerSessionToken(token: string) {
  sessionToken = token.trim();
}

export function hasRemoteRunnerSessionToken() {
  return sessionToken.length > 0;
}

export function requireRemoteRunnerSessionToken() {
  if (!sessionToken) {
    throw new Error("Remote Runner 토큰을 이 앱 세션에 입력해 주세요.");
  }
  return sessionToken;
}
