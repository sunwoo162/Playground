import { useEffect, useMemo, useState } from 'react'

import { parseLunaRegistration, type LunaRegistrationPayload } from './luna-registration'
import './bouquet-manage.css'
import './luna-bouquet-register.css'

type BouquetUser = {
  id: string
  email: string
  displayName: string
}

type Submission = {
  id: number
  evaluationRunId: number | null
  evaluationStatus: string | null
  bouquetClientId: string | null
  bouquetRedirectUri: string | null
}

type RegistrationResponse = {
  team: { id: number; name: string; slug: string }
  project: { id: number; name: string; slug: string; published: boolean }
  submission: Submission
}

type Props = {
  handoff: string
}

function displayError(reason: unknown) {
  if (reason instanceof Error && reason.message.trim()) return reason.message
  return '프로젝트를 등록하지 못했습니다. 다시 시도해주세요.'
}

export default function LunaBouquetRegisterApp({ handoff }: Props) {
  const payload = useMemo(() => parseLunaRegistration(handoff), [handoff])
  const [user, setUser] = useState<BouquetUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RegistrationResponse | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/bouquet/auth/me', {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('로그인 상태를 확인하지 못했습니다.')
        return response.json() as Promise<{ user: BouquetUser | null }>
      })
      .then((body) => setUser(body.user))
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(displayError(reason))
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [])

  async function registerProject(registration: LunaRegistrationPayload) {
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/bloom-bouquet/luna/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registration),
      })
      if (!response.ok) {
        const detail = (await response.text()).trim()
        throw new Error(detail || `프로젝트 등록 실패 (HTTP ${response.status})`)
      }
      const body = await response.json() as RegistrationResponse
      if (body.submission.evaluationRunId == null || body.submission.evaluationStatus !== 'QUEUED') {
        throw new Error('평가 Run이 정상적으로 생성되지 않았습니다.')
      }
      setResult(body)
    } catch (reason) {
      setError(displayError(reason))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="bouquet-manage-shell">
        <div className="bouquet-manage-state">Luna 프로젝트 정보를 확인하는 중...</div>
      </main>
    )
  }

  if (!payload) {
    return (
      <main className="bouquet-manage-shell luna-register-shell">
        <a className="bouquet-manage-home" href="/">← BloomBouquet</a>
        <section className="luna-register-card">
          <p className="luna-register-eyebrow">LUNA HANDOFF</p>
          <h1>Luna 등록 정보를 읽지 못했습니다.</h1>
          <span>링크가 손상되었거나 지원하지 않는 등록 형식입니다.</span>
          <a className="luna-register-secondary" href="?mode=manage">직접 수정해서 등록</a>
        </section>
      </main>
    )
  }

  if (!user) {
    const loginHref = `?mode=auth&return_to=manage&luna=${encodeURIComponent(handoff)}`
    return (
      <main className="bouquet-manage-shell luna-register-shell">
        <a className="bouquet-manage-home" href="/">← BloomBouquet</a>
        <section className="luna-register-card">
          <p className="luna-register-eyebrow">LUNA · {payload.teamName}</p>
          <h1>{payload.projectName}</h1>
          <span>등록은 한 번이면 됩니다. 먼저 꽃다발 계정으로 로그인해주세요.</span>
          {error && <div className="bouquet-manage-error" role="alert">{error}</div>}
          <a className="luna-register-primary" href={loginHref}>꽃다발 로그인하고 계속</a>
          <a className="luna-register-secondary" href="?mode=manage">직접 수정해서 등록</a>
        </section>
      </main>
    )
  }

  if (result) {
    return (
      <main className="bouquet-manage-shell luna-register-shell">
        <a className="bouquet-manage-home" href="/">← BloomBouquet</a>
        <section className="luna-register-card luna-register-complete">
          <p className="luna-register-eyebrow">REGISTRATION COMPLETE</p>
          <h1>{result.project.name} 등록 완료</h1>
          <div className="luna-register-run">
            <strong>Run #{result.submission.evaluationRunId}</strong>
            <span>{result.submission.evaluationStatus}</span>
          </div>
          {result.submission.bouquetClientId && (
            <div className="luna-register-oauth">
              <span>꽃다발 OAuth Client</span>
              <code>{result.submission.bouquetClientId}</code>
            </div>
          )}
          <a className="luna-register-primary" href="/">공개 평가 현황 보기</a>
        </section>
      </main>
    )
  }

  return (
    <main className="bouquet-manage-shell luna-register-shell">
      <header className="luna-register-header">
        <a className="bouquet-manage-home" href="/">← BloomBouquet</a>
        <p>LUNA AGENT SYSTEM · ONE-CLICK HANDOFF</p>
        <h1>등록할 내용만 확인해주세요.</h1>
        <span>Team → Project → Submission 입력은 Luna가 이미 채웠습니다.</span>
      </header>

      {error && <div className="bouquet-manage-error" role="alert">{error}</div>}

      <section className="luna-register-card" aria-label="Luna project registration confirmation">
        <div className="luna-register-title-row">
          <div>
            <p className="luna-register-eyebrow">팀 {payload.teamName}</p>
            <h2>{payload.projectName}</h2>
            <span>{payload.description}</span>
          </div>
          <span className="luna-register-version">v{payload.version}</span>
        </div>

        <dl className="luna-register-details">
          <div><dt>배포 주소</dt><dd>{payload.demoUrl}</dd></div>
          <div><dt>GitHub</dt><dd>{payload.repositoryUrl}</dd></div>
          <div><dt>꽃다발 로그인</dt><dd>{payload.requiresAuth ? '사용' : '사용 안 함'}</dd></div>
          {payload.authRedirectUri && <div><dt>로그인 Callback</dt><dd>{payload.authRedirectUri}</dd></div>}
        </dl>

        <div className="luna-register-account">
          <span>등록 계정</span>
          <strong>{user.displayName}</strong>
          <small>{user.email}</small>
        </div>

        <button
          className="luna-register-primary"
          type="button"
          disabled={submitting}
          onClick={() => void registerProject(payload)}
        >
          {submitting ? '등록 중...' : 'BloomBouquet에 등록하고 평가 시작'}
        </button>
        <a className="luna-register-secondary" href="?mode=manage">직접 수정해서 등록</a>
      </section>
    </main>
  )
}
