import { useEffect, useMemo, useState } from 'react'

import { BouquetWordmark, EmptyState, PrimaryButton, SecondaryButton, StatusBadge, Surface } from './BouquetUI'
import { parseLunaRegistration, type LunaRegistrationPayload } from './luna-registration'
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
      if (body.submission.evaluationRunId == null || !body.submission.evaluationStatus) {
        throw new Error('평가 Run 정보를 확인하지 못했습니다.')
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
      <main className="luna-register-shell bouquet-luna-editorial">
        <div className="luna-register-topbar"><BouquetWordmark /></div>
        <div className="luna-register-loading"><span className="bouquet-skeleton" /><p>Luna 프로젝트 정보를 확인하는 중...</p></div>
      </main>
    )
  }

  if (!payload) {
    return (
      <main className="luna-register-shell bouquet-luna-editorial">
        <div className="luna-register-topbar"><BouquetWordmark /></div>
        <div className="luna-register-state-wrap">
          <EmptyState
            eyebrow="LUNA HANDOFF"
            title="Luna 등록 정보를 읽지 못했습니다."
            description="링크가 손상되었거나 지원하지 않는 등록 형식입니다."
            action={<SecondaryButton href="?mode=manage">직접 수정해서 등록</SecondaryButton>}
          />
        </div>
      </main>
    )
  }

  if (!user) {
    const loginHref = `?mode=auth&return_to=manage&luna=${encodeURIComponent(handoff)}`
    return (
      <main className="luna-register-shell bouquet-luna-editorial">
        <div className="luna-register-topbar"><BouquetWordmark /></div>
        <Surface className="luna-register-signin">
          <div>
            <p className="bouquet-kicker">LUNA · {payload.teamName}</p>
            <h1>{payload.projectName}</h1>
            <p>프로젝트 정보는 Luna가 이미 채웠습니다. 등록 주인을 확인하기 위해 꽃다발 로그인만 해주세요.</p>
          </div>
          {error && <div className="luna-register-error" role="alert">{error}</div>}
          <div className="luna-register-actions">
            <PrimaryButton href={loginHref}>꽃다발 로그인하고 계속</PrimaryButton>
            <SecondaryButton href="?mode=manage">직접 수정해서 등록</SecondaryButton>
          </div>
        </Surface>
      </main>
    )
  }

  if (result) {
    return (
      <main className="luna-register-shell bouquet-luna-editorial">
        <div className="luna-register-topbar"><BouquetWordmark /></div>
        <Surface className="luna-register-complete">
          <StatusBadge status={result.submission.evaluationStatus}>REGISTRATION COMPLETE</StatusBadge>
          <h1>{result.project.name}<br />등록 완료</h1>
          <p>프로젝트가 BloomBouquet에 등록되었고 Senior Agent 평가 Run이 생성되었습니다.</p>
          <div className="luna-register-summary-grid is-result">
            <div><span>Evaluation</span><strong>Run #{result.submission.evaluationRunId}</strong></div>
            <div><span>Status</span><strong>{result.submission.evaluationStatus}</strong></div>
            <div><span>Team</span><strong>{result.team.name}</strong></div>
          </div>
          {result.submission.bouquetClientId && (
            <div className="luna-register-detail-row">
              <span>꽃다발 OAuth Client</span>
              <code>{result.submission.bouquetClientId}</code>
            </div>
          )}
          <PrimaryButton href="/">공개 평가 현황 보기</PrimaryButton>
        </Surface>
      </main>
    )
  }

  return (
    <main className="luna-register-shell bouquet-luna-editorial">
      <div className="luna-register-topbar"><BouquetWordmark /></div>

      <header className="luna-register-header">
        <div>
          <p className="bouquet-kicker">LUNA AGENT SYSTEM · ONE-CLICK HANDOFF</p>
          <h1>입력이 아니라<br />확인만 하면 됩니다.</h1>
        </div>
        <p>Team → Project → Submission 정보는 Luna가 이미 준비했습니다. 아래 내용만 확인하고 한 번에 등록하세요.</p>
      </header>

      {error && <div className="luna-register-error" role="alert">{error}</div>}

      <Surface className="luna-register-card" aria-label="Luna project registration confirmation">
        <div className="luna-register-project-identity">
          <div>
            <p className="bouquet-kicker">TEAM {payload.teamName}</p>
            <h2>{payload.projectName}</h2>
            <p>{payload.description}</p>
          </div>
          <StatusBadge status="COMPLETED">LUNA FILLED</StatusBadge>
        </div>

        <div className="luna-register-summary-grid">
          <div><span>Team</span><strong>{payload.teamName}</strong></div>
          <div><span>Version</span><strong>v{payload.version}</strong></div>
          <div><span>Auth</span><strong>{payload.requiresAuth ? '꽃다발 사용' : '사용 안 함'}</strong></div>
        </div>

        <div className="luna-register-detail-list">
          <div className="luna-register-detail-row"><span>배포 주소</span><strong>{payload.demoUrl}</strong></div>
          <div className="luna-register-detail-row"><span>GitHub</span><strong>{payload.repositoryUrl}</strong></div>
          {payload.authRedirectUri && <div className="luna-register-detail-row"><span>로그인 Callback</span><strong>{payload.authRedirectUri}</strong></div>}
        </div>

        <div className="luna-register-account">
          <span>이 계정으로 등록합니다</span>
          <div><strong>{user.displayName}</strong><small>{user.email}</small></div>
        </div>

        <div className="luna-register-actions">
          <PrimaryButton disabled={submitting} onClick={() => void registerProject(payload)}>
            {submitting ? '등록 중...' : 'BloomBouquet에 등록하고 평가 시작'}
          </PrimaryButton>
          <SecondaryButton href="?mode=manage">직접 수정해서 등록</SecondaryButton>
        </div>
      </Surface>
    </main>
  )
}
