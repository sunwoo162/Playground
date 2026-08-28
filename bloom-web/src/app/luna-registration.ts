export type LunaRegistrationPayload = {
  schemaVersion: 1
  teamId: 'rose' | 'lily' | 'tulip' | 'sunflower' | 'cherry-blossom'
  teamName: string
  projectName: string
  projectSlug: string
  description: string
  version: string
  demoUrl: string
  repositoryUrl: string
  requiresAuth: boolean
  authRedirectUri: string | null
}

const TEAM_IDS = new Set(['rose', 'lily', 'tulip', 'sunflower', 'cherry-blossom'])
const MAX_HANDOFF_LENGTH = 12_000

function decodeBase64UrlUtf8(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > MAX_HANDOFF_LENGTH) {
    throw new Error('invalid_luna_handoff')
  }
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function parseLunaRegistration(encoded: string | null): LunaRegistrationPayload | null {
  if (!encoded) return null
  try {
    const parsed = JSON.parse(decodeBase64UrlUtf8(encoded)) as Partial<LunaRegistrationPayload>
    if (parsed.schemaVersion !== 1) return null
    if (!nonEmptyString(parsed.teamId) || !TEAM_IDS.has(parsed.teamId)) return null
    if (!nonEmptyString(parsed.teamName)) return null
    if (!nonEmptyString(parsed.projectName)) return null
    if (!nonEmptyString(parsed.projectSlug)) return null
    if (!nonEmptyString(parsed.description)) return null
    if (!nonEmptyString(parsed.version)) return null
    if (!nonEmptyString(parsed.demoUrl)) return null
    if (!nonEmptyString(parsed.repositoryUrl)) return null
    if (typeof parsed.requiresAuth !== 'boolean') return null
    if (parsed.authRedirectUri !== null && parsed.authRedirectUri !== undefined && typeof parsed.authRedirectUri !== 'string') return null
    if (parsed.requiresAuth && !nonEmptyString(parsed.authRedirectUri)) return null

    return {
      schemaVersion: 1,
      teamId: parsed.teamId as LunaRegistrationPayload['teamId'],
      teamName: parsed.teamName,
      projectName: parsed.projectName,
      projectSlug: parsed.projectSlug,
      description: parsed.description,
      version: parsed.version,
      demoUrl: parsed.demoUrl,
      repositoryUrl: parsed.repositoryUrl,
      requiresAuth: parsed.requiresAuth,
      authRedirectUri: parsed.requiresAuth ? parsed.authRedirectUri as string : null,
    }
  } catch {
    return null
  }
}

export function boundedLunaHandoff(value: string | null) {
  if (!value || value.length > MAX_HANDOFF_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) return null
  return value
}
