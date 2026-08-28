import { FormEvent, useEffect, useMemo, useState } from 'react'

import './bouquet-auth.css'

type BouquetUser = {
  id: string
  email: string
  displayName: string
}

type AuthMode = 'login' | 'signup'

type AuthResponse = {
  user: BouquetUser
}

type ErrorResponse = {
  error?: string
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: '이메일 또는 비밀번호를 확인해주세요.',
  email_already_registered: '이미 가입된 이메일입니다.',
  invalid_email: '올바른 이메일을 입력해주세요.',
  invalid_password: '비밀번호는 8자 이상 128자 이하로 입력해주세요.',
  invalid_display_name: '이름은 2자 이상 100자 이하로 입력해주세요.',
  login_required: '꽃다발 로그인이 필요합니다.',
  invalid_client: '등록되지 않은 프로젝트입니다.',
  invalid_redirect_uri: '프로젝트 로그인 주소가 올바르지 않습니다.',
  pkce_s256_required: '프로젝트의 보안 로그인 요청이 올바르지 않습니다.',
  state_required: '프로젝트의 로그인 요청 정보가 부족합니다.',
}

function messageFor(error: string | undefined) {
  if (!error) return '요청을 처리하지 못했습니다. 다시 시도해주세요.'
  return ERROR_MESSAGES[error] ?? '요청을 처리하지 못했습니다. 다시 시도해주세요.'
}

export default function BouquetAuthApp() {
  const [user, setUser] = useState<BouquetUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const oauth = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const clientId = params.get('client_id') ?? ''
    const redirectUri = params.get('redirect_uri') ?? ''
    const state = params.get('state') ?? ''
    const codeChallenge = params.get('code_challenge') ?? ''
    const codeChallengeMethod = params.get('code_challenge_method') ?? 'S256'
    const returnToManage = params.get('return_to') === 'manage'
    const hasAnyOAuthParam = Boolean(clientId || redirectUri || state || codeChallenge)
    const complete = Boolean(clientId && redirectUri && state && codeChallenge && codeChallengeMethod === 'S256')

    let projectHost = ''
    if (redirectUri) {
      try {
        projectHost = new URL(redirectUri).host
      } catch {
        projectHost = ''
      }
    }

    return {
      clientId,
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
      hasAnyOAuthParam,
      complete,
      projectHost,
      returnToManage,
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/bouquet/auth/me', {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('session_check_failed')
        return response.json() as Promise<{ user: BouquetUser | null }>
      })
      .then((body) => {
        setUser(body.user)
        if (body.user && oauth.returnToManage && !oauth.hasAnyOAuthParam) {
          window.location.assign('?mode=manage')
        }
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError('로그인 상태를 확인하지 못했습니다.')
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [oauth.hasAnyOAuthParam, oauth.returnToManage])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const endpoint = mode === 'signup' ? '/api/bouquet/auth/signup' : '/api/bouquet/auth/login'
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'signup'
            ? { email, password, displayName }
            : { email, password },
        ),
      })
      const body = await response.json() as AuthResponse & ErrorResponse
      if (!response.ok) throw new Error(body.error ?? 'auth_failed')

      setUser(body.user)
      setPassword('')
      if (oauth.returnToManage && !oauth.hasAnyOAuthParam) {
        window.location.assign('?mode=manage')
      }
    } catch (reason) {
      setError(messageFor(reason instanceof Error ? reason.message : undefined))
    } finally {
      setSubmitting(false)
    }
  }

  async function logout() {
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/bouquet/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('logout_failed')
      setUser(null)
    } catch {
      setError('로그아웃하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  function continueToProject() {
    if (!oauth.complete) {
      setError('프로젝트 로그인 요청 정보가 올바르지 않습니다.')
      return
    }

    const url = new URL('/api/bouquet/oauth/authorize', window.location.origin)
    url.searchParams.set('client_id', oauth.clientId)
    url.searchParams.set('redirect_uri', oauth.redirectUri)
    url.searchParams.set('state', oauth.state)
    url.searchParams.set('code_challenge', oauth.codeChallenge)
    url.searchParams.set('code_challenge_method', oauth.codeChallengeMethod)
    window.location.assign(url.toString())
  }

  const invalidOAuthRequest = oauth.hasAnyOAuthParam && !oauth.complete

  return (
    <main className="bouquet-auth-shell">
      <a className="bouquet-auth-home" href="/" aria-label="BloomBouquet으로 돌아가기">
        <span aria-hidden="true">✿</span>
        <strong>BloomBouquet</strong>
      </a>

      <section className="bouquet-auth-card" aria-live="polite">
        <div className="bouquet-auth-brand">
          <div className="bouquet-auth-flower" aria-hidden="true">✿</div>
          <p>ONE ACCOUNT · EVERY PROJECT</p>
          <h1>꽃다발 로그인</h1>
          <span>
            BloomBouquet의 모든 프로젝트를 하나의 계정으로 이용하세요.
          </span>
        </div>

        {invalidOAuthRequest && (
          <div className="bouquet-auth-alert bouquet-auth-alert-error">
            프로젝트에서 전달한 로그인 요청이 올바르지 않습니다.
          </div>
        )}

        {oauth.complete && (
          <div className="bouquet-auth-project">
            <span>로그인 요청 프로젝트</span>
            <strong>{oauth.projectHost || oauth.clientId}</strong>
            <small>비밀번호는 프로젝트에 전달되지 않습니다.</small>
          </div>
        )}

        {loading ? (
          <div className="bouquet-auth-loading">로그인 상태를 확인하는 중...</div>
        ) : user ? (
          <div className="bouquet-auth-session">
            <div className="bouquet-auth-avatar" aria-hidden="true">
              {user.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p>꽃다발 계정으로 로그인됨</p>
              <h2>{user.displayName}</h2>
              <span>{user.email}</span>
            </div>

            {oauth.complete ? (
              <button className="bouquet-auth-primary" type="button" onClick={continueToProject} disabled={submitting}>
                {oauth.projectHost ? `${oauth.projectHost} 계속하기` : '프로젝트로 계속하기'}
              </button>
            ) : oauth.returnToManage ? (
              <a className="bouquet-auth-primary bouquet-auth-primary-link" href="?mode=manage">
                프로젝트 관리로 돌아가기
              </a>
            ) : (
              <a className="bouquet-auth-primary bouquet-auth-primary-link" href="/">
                프로젝트 둘러보기
              </a>
            )}

            <button className="bouquet-auth-secondary" type="button" onClick={logout} disabled={submitting}>
              로그아웃
            </button>
          </div>
        ) : (
          <>
            <div className="bouquet-auth-tabs" role="tablist" aria-label="꽃다발 인증 방식">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                className={mode === 'login' ? 'active' : ''}
                onClick={() => { setMode('login'); setError(null) }}
              >
                로그인
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                className={mode === 'signup' ? 'active' : ''}
                onClick={() => { setMode('signup'); setError(null) }}
              >
                회원가입
              </button>
            </div>

            <form className="bouquet-auth-form" onSubmit={submit}>
              {mode === 'signup' && (
                <label>
                  <span>이름</span>
                  <input
                    type="text"
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="꽃다발에서 사용할 이름"
                    required
                  />
                </label>
              )}

              <label>
                <span>이메일</span>
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={320}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </label>

              <label>
                <span>비밀번호</span>
                <input
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="8자 이상 입력"
                  required
                />
              </label>

              {error && <div className="bouquet-auth-alert bouquet-auth-alert-error">{error}</div>}

              <button className="bouquet-auth-primary" type="submit" disabled={submitting || invalidOAuthRequest}>
                {submitting ? '처리 중...' : mode === 'signup' ? '꽃다발 계정 만들기' : '꽃다발 로그인'}
              </button>
            </form>

            <p className="bouquet-auth-footnote">
              로그인 정보는 BloomBouquet가 관리하며 개별 프로젝트에는 인증 결과만 전달됩니다.
            </p>
          </>
        )}

        {user && error && <div className="bouquet-auth-alert bouquet-auth-alert-error">{error}</div>}
      </section>
    </main>
  )
}
