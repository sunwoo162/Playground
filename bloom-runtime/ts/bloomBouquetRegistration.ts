import type { TeamId } from "./types";

export const BLOOM_BOUQUET_MANAGE_ORIGIN = "https://bloombouquet.https.gsmsv.site";
export const LUNA_BLOOM_BOUQUET_REGISTRATION_SCHEMA_VERSION = 1 as const;

const TEAM_NAMES: Record<TeamId, string> = {
  rose: "장미",
  lily: "백합",
  tulip: "튤립",
  sunflower: "해바라기",
  "cherry-blossom": "벚꽃",
};

export type LunaBloomBouquetRegistrationPayload = {
  schemaVersion: 1;
  teamId: TeamId;
  teamName: string;
  projectName: string;
  projectSlug: string;
  description: string;
  version: string;
  demoUrl: string;
  repositoryUrl: string;
  requiresAuth: boolean;
  authRedirectUri: string | null;
};

export type LunaBloomBouquetRegistrationInput = {
  teamId: TeamId;
  teamName: string;
  projectName: string;
  projectSlug: string;
  description: string;
  repositoryFullName: string | null;
  demoUrl: string | null;
  requiresAuth: boolean;
};

function canonicalTeamName(teamId: TeamId) {
  const name = TEAM_NAMES[teamId];
  if (!name) throw new Error(`지원하지 않는 Luna 팀입니다: ${teamId}`);
  return name;
}

function requiredText(value: string, label: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error(`${label}이 필요합니다.`);
  if (normalized.length > maxLength) return normalized.slice(0, maxLength).trim();
  return normalized;
}

function normalizeSlug(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  if (!normalized) throw new Error("BloomBouquet project slug를 만들 수 없습니다.");
  return normalized.slice(0, 160).replace(/-+$/g, "");
}

function repositoryUrl(repositoryFullName: string) {
  const value = repositoryFullName.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error(`GitHub 저장소 형식이 올바르지 않습니다: ${value}`);
  }
  return `https://github.com/${value}`;
}

function normalizedDemoUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("BloomBouquet Demo URL은 HTTP(S)만 허용합니다.");
  }
  if (url.username || url.password) {
    throw new Error("BloomBouquet Demo URL에 credential을 포함할 수 없습니다.");
  }
  return url.toString();
}

function authCallbackUrl(demoUrl: string) {
  const url = new URL(demoUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/auth/bouquet/callback`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function encodeBase64UrlUtf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64UrlUtf8(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isTeamId(value: unknown): value is TeamId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TEAM_NAMES, value);
}

export function decodeBloomBouquetRegistrationPayload(
  encoded: string,
): LunaBloomBouquetRegistrationPayload {
  const parsed = JSON.parse(decodeBase64UrlUtf8(encoded)) as Partial<LunaBloomBouquetRegistrationPayload>;
  if (parsed.schemaVersion !== LUNA_BLOOM_BOUQUET_REGISTRATION_SCHEMA_VERSION) {
    throw new Error("지원하지 않는 Luna BloomBouquet 등록 schema입니다.");
  }
  if (!isTeamId(parsed.teamId)) throw new Error("지원하지 않는 Luna 팀입니다.");
  if (parsed.teamName !== TEAM_NAMES[parsed.teamId]) throw new Error("Luna 팀 이름이 teamId와 일치하지 않습니다.");
  for (const key of ["projectName", "projectSlug", "description", "version", "demoUrl", "repositoryUrl"] as const) {
    if (typeof parsed[key] !== "string" || !parsed[key]?.trim()) {
      throw new Error(`Luna BloomBouquet 등록 필드가 올바르지 않습니다: ${key}`);
    }
  }
  if (typeof parsed.requiresAuth !== "boolean") {
    throw new Error("Luna BloomBouquet requiresAuth가 올바르지 않습니다.");
  }
  if (parsed.authRedirectUri !== null && typeof parsed.authRedirectUri !== "string") {
    throw new Error("Luna BloomBouquet authRedirectUri가 올바르지 않습니다.");
  }
  return parsed as LunaBloomBouquetRegistrationPayload;
}

export function buildBloomBouquetRegistrationUrl(
  input: LunaBloomBouquetRegistrationInput,
): string | null {
  const teamName = canonicalTeamName(input.teamId);
  // teamName is still supplied by the executor for diagnostics/configuration, but the
  // handoff always uses the canonical organization team label derived from teamId.
  void input.teamName;

  const repositoryFullName = input.repositoryFullName?.trim() ?? "";
  const demoUrlInput = input.demoUrl?.trim() ?? "";
  if (!repositoryFullName || !demoUrlInput) return null;

  const demoUrl = normalizedDemoUrl(demoUrlInput);
  const payload: LunaBloomBouquetRegistrationPayload = {
    schemaVersion: LUNA_BLOOM_BOUQUET_REGISTRATION_SCHEMA_VERSION,
    teamId: input.teamId,
    teamName,
    projectName: requiredText(input.projectName, "프로젝트 이름", 160),
    projectSlug: normalizeSlug(input.projectSlug),
    description: requiredText(input.description, "프로젝트 설명", 4000),
    version: "1.0.0",
    demoUrl,
    repositoryUrl: repositoryUrl(repositoryFullName),
    requiresAuth: input.requiresAuth,
    authRedirectUri: input.requiresAuth ? authCallbackUrl(demoUrl) : null,
  };

  const url = new URL(BLOOM_BOUQUET_MANAGE_ORIGIN);
  url.searchParams.set("mode", "manage");
  url.searchParams.set("luna", encodeBase64UrlUtf8(JSON.stringify(payload)));
  return url.toString();
}
