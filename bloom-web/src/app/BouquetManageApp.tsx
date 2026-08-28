import { FormEvent, useEffect, useMemo, useState } from 'react'

import './bouquet-manage.css'

type BouquetUser = {
  id: string
  email: string
  displayName: string
}

type Team = {
  id: number
  name: string
  slug: string
  createdAt: string
}

type Submission = {
  id: number
  version: string
  demoUrl: string
  frontendRepositoryUrl: string | null
  backendRepositoryUrl: string | null
  requiresAuth: boolean
  authPolicyId: string
  bouquetClientId: string | null
  bouquetRedirectUri: string | null
  evaluationRunId: number | null
  evaluationStatus: string | null
  overallScore: number | null
  overallStars: number | null
  createdAt: string
}

type Project = {
  id: number
  teamId: number
  teamName: string
  name: string
  slug: string
  description: string
  published: boolean
  latestSubmission: Submission | null
  createdAt: string
  updatedAt: string
}

type SessionResponse = {
  user: BouquetUser | null
}

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  if (response.status === 401 || response.status === 403) {
    throw new ApiError('login_required', response.status)
  }
  if (!response.ok) {
    const message = (await response.text()).trim()
    throw new ApiError(message || `HTTP ${response.status}`, response.status)
  }
  return response.json() as Promise<T>
}

function errorMessage(reason: unknown) {
  if (reason instanceof ApiError && reason.message === 'login_required') {
    return '꽃다발 로그인이 필요합니다.'
  }
  if (reason instanceof Error && reason.message.trim()) return reason.message
  return '요청을 처리하지 못했습니다. 다시 시도해주세요.'
}

export default function BouquetManageApp() {
  const [user, setUser] = useState<BouquetUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [teams, setTeams] = useState<Team[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<Submission | null>(null)

  const [teamName, setTeamName] = useState('')
  const [teamSlug, setTeamSlug] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectSlug, setProjectSlug] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [version, setVersion] = useState('')
  const [demoUrl, setDemoUrl] = useState('')
  const [frontendRepositoryUrl, setFrontendRepositoryUrl] = useState('')
  const [backendRepositoryUrl, setBackendRepositoryUrl] = useState('')
  const [requiresAuth, setRequiresAuth] = useState(false)
  const [authRedirectUri, setAuthRedirectUri] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const sessionResponse = await fetch('/api/bouquet/auth/me', {
          credentials: 'include',
        })
        if (!sessionResponse.ok) throw new Error('로그인 상태를 확인하지 못했습니다.')
        const session = await sessionResponse.json() as SessionResponse
        if (cancelled) return
        setUser(session.user)
        if (!session.user) return

        const [teamList, projectList] = await Promise.all([
          api<Team[]>('/api/bloom-bouquet/teams'),
          api<Project[]>('/api/bloom-bouquet/projects'),
        ])
        if (cancelled) return
        setTeams(teamList)
        setProjects(projectList)
        const initialTeamId = teamList[0]?.id ?? null
        setSelectedTeamId(initialTeamId)
        setSelectedProjectId(
          projectList.find((project) => project.teamId === initialTeamId)?.id ?? null,
        )
      } catch (reason) {
        if (!cancelled) {
          if (reason instanceof ApiError && reason.message === 'login_required') setUser(null)
          setError(errorMessage(reason))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  const teamProjects = useMemo(
    () => projects.filter((project) => project.teamId === selectedTeamId),
    [projects, selectedTeamId],
  )

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null

  function handleLoginRequired(reason: unknown) {
    if (reason instanceof ApiError && reason.message === 'login_required') {
      setUser(null)
    }
    setError(errorMessage(reason))
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!teamName.trim()) return
    setBusy('team')
    setError(null)
    try {
      const created = await api<Team>('/api/bloom-bouquet/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: teamName.trim(),
          slug: teamSlug.trim() || null,
        }),
      })
      setTeams((current) => [created, ...current])
      setSelectedTeamId(created.id)
      setSelectedProjectId(null)
      setTeamName('')
      setTeamSlug('')
    } catch (reason) {
      handleLoginRequired(reason)
    } finally {
      setBusy(null)
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedTeamId == null) {
      setError('먼저 팀을 선택해주세요.')
      return
    }
    setBusy('project')
    setError(null)
    try {
      const created = await api<Project>('/api/bloom-bouquet/projects', {
        method: 'POST',
        body: JSON.stringify({
          teamId: selectedTeamId,
          name: projectName.trim(),
          slug: projectSlug.trim() || null,
          description: projectDescription.trim(),
        }),
      })
      setProjects((current) => [created, ...current])
      setSelectedProjectId(created.id)
      setProjectName('')
      setProjectSlug('')
      setProjectDescription('')
    } catch (reason) {
      handleLoginRequired(reason)
    } finally {
      setBusy(null)
    }
  }

  async function publishSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedProjectId == null) {
      setError('먼저 프로젝트를 선택해주세요.')
      return
    }
    if (requiresAuth && !authRedirectUri.trim()) {
      setError('꽃다발 인증을 사용하는 프로젝트는 인증 콜백 URL이 필요합니다.')
      return
    }

    setBusy('submission')
    setError(null)
    setSuccess(null)
    try {
      const created = await api<Submission>(`/api/bloom-bouquet/projects/${selectedProjectId}/submissions`, {
        method: 'POST',
        body: JSON.stringify({
          version: version.trim(),
          demoUrl: demoUrl.trim(),
          frontendRepositoryUrl: frontendRepositoryUrl.trim() || null,
          backendRepositoryUrl: backendRepositoryUrl.trim() || null,
          requiresAuth,
          authRedirectUri: requiresAuth ? authRedirectUri.trim() : null,
        }),
      })

      if (created.evaluationRunId == null || created.evaluationStatus !== 'QUEUED') {
        throw new Error('평가 Run이 정상적으로 생성되지 않았습니다.')
      }

      setProjects((current) => current.map((project) => (
        project.id === selectedProjectId
          ? { ...project, published: true, latestSubmission: created }
          : project
      )))
      setSuccess(created)
      setVersion('')
      setDemoUrl('')
      setFrontendRepositoryUrl('')
      setBackendRepositoryUrl('')
      setRequiresAuth(false)
      setAuthRedirectUri('')
    } catch (reason) {
      handleLoginRequired(reason)
    } finally {
      setBusy(null)
    }
  }

  function selectTeam(teamId: number | null) {
    setSelectedTeamId(teamId)
    const nextProject = projects.find((project) => project.teamId === teamId)
    setSelectedProjectId(nextProject?.id ?? null)
    setSuccess(null)
  }

  if (loading) {
    return (
      <main className="bouquet-manage-shell">
        <div className="bouquet-manage-state">프로젝트 관리 정보를 불러오는 중...</div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="bouquet-manage-shell">
        <a className="bouquet-manage-home" href="/">← BloomBouquet</a>
        <section className="bouquet-manage-auth-required">
          <span className="bouquet-manage-flower" aria-hidden="true">✿</span>
          <p>PROJECT OWNER ACCESS</p>
          <h1>꽃다발 로그인이 필요합니다</h1>
          <span>팀과 프로젝트를 등록하려면 꽃다발 계정으로 로그인해주세요.</span>
          {error && <div className="bouquet-manage-error">{error}</div>}
          <a className="bouquet-manage-primary-link" href="?mode=auth&return_to=manage">꽃다발 로그인</a>
        </section>
      </main>
    )
  }

  return (
    <main className="bouquet-manage-shell">
      <header className="bouquet-manage-header">
        <div>
          <a className="bouquet-manage-home" href="/">← BloomBouquet</a>
          <p>PROJECT OWNER CONSOLE</p>
          <h1>프로젝트 관리</h1>
          <span>Team → Project → Submission 순서로 등록하면 Senior Agent 평가가 자동으로 시작됩니다.</span>
        </div>
        <div className="bouquet-manage-account">
          <strong>{user.displayName}</strong>
          <span>{user.email}</span>
        </div>
      </header>

      {error && <div className="bouquet-manage-error" role="alert">{error}</div>}
      {success && (
        <section className="bouquet-manage-success" aria-live="polite">
          <div>
            <span>평가 Run 생성 완료</span>
            <strong>Run #{success.evaluationRunId}</strong>
            <p>{success.evaluationStatus} 상태로 등록되었습니다. production evaluator가 자동으로 평가를 시작합니다.</p>
          </div>
          <a href="/">공개 평가 현황 보기 →</a>
        </section>
      )}

      <section className="bouquet-manage-grid" aria-label="Project registration stages">
        <article className="bouquet-manage-card">
          <div className="bouquet-manage-card-title"><span>01</span><div><h2>Team</h2><p>프로젝트를 소유할 팀을 선택하거나 만듭니다.</p></div></div>

          <label className="bouquet-manage-field">
            <span>기존 팀</span>
            <select
              value={selectedTeamId ?? ''}
              onChange={(event) => selectTeam(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">팀 선택</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>

          <form className="bouquet-manage-form" onSubmit={createTeam}>
            <label className="bouquet-manage-field"><span>팀 이름</span><input value={teamName} onChange={(event) => setTeamName(event.target.value)} maxLength={120} required placeholder="예: 장미" /></label>
            <label className="bouquet-manage-field"><span>Slug <small>선택</small></span><input value={teamSlug} onChange={(event) => setTeamSlug(event.target.value)} placeholder="rose-team" /></label>
            <button type="submit" disabled={busy !== null}>{busy === 'team' ? '생성 중...' : '새 팀 만들기'}</button>
          </form>
          {selectedTeam && <div className="bouquet-manage-selected">선택됨 · {selectedTeam.name}</div>}
        </article>

        <article className={`bouquet-manage-card ${selectedTeamId == null ? 'is-disabled' : ''}`}>
          <div className="bouquet-manage-card-title"><span>02</span><div><h2>Project</h2><p>평가할 프로젝트의 기본 정보를 등록합니다.</p></div></div>

          <label className="bouquet-manage-field">
            <span>기존 프로젝트</span>
            <select
              value={selectedProjectId ?? ''}
              disabled={selectedTeamId == null}
              onChange={(event) => setSelectedProjectId(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">프로젝트 선택</option>
              {teamProjects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.published ? ' · 공개' : ' · 미공개'}</option>)}
            </select>
          </label>

          <form className="bouquet-manage-form" onSubmit={createProject}>
            <label className="bouquet-manage-field"><span>프로젝트 이름</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={160} disabled={selectedTeamId == null} required placeholder="프로젝트 이름" /></label>
            <label className="bouquet-manage-field"><span>Slug <small>선택</small></span><input value={projectSlug} onChange={(event) => setProjectSlug(event.target.value)} disabled={selectedTeamId == null} placeholder="my-project" /></label>
            <label className="bouquet-manage-field"><span>설명</span><textarea value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} maxLength={4000} disabled={selectedTeamId == null} required rows={4} placeholder="프로젝트가 해결하는 문제와 핵심 기능을 적어주세요." /></label>
            <button type="submit" disabled={busy !== null || selectedTeamId == null}>{busy === 'project' ? '생성 중...' : '새 프로젝트 만들기'}</button>
          </form>
          {selectedProject && <div className="bouquet-manage-selected">선택됨 · {selectedProject.name}</div>}
        </article>

        <article className={`bouquet-manage-card bouquet-manage-card-wide ${selectedProjectId == null ? 'is-disabled' : ''}`}>
          <div className="bouquet-manage-card-title"><span>03</span><div><h2>Submission</h2><p>실제 배포 URL과 저장소를 등록하면 평가 Run이 자동 생성됩니다.</p></div></div>

          <form className="bouquet-manage-form bouquet-manage-submission-form" onSubmit={publishSubmission}>
            <label className="bouquet-manage-field"><span>버전</span><input value={version} onChange={(event) => setVersion(event.target.value)} maxLength={80} disabled={selectedProjectId == null} required placeholder="1.0.0" /></label>
            <label className="bouquet-manage-field"><span>Demo URL</span><input type="url" value={demoUrl} onChange={(event) => setDemoUrl(event.target.value)} disabled={selectedProjectId == null} required placeholder="https://example.com" /></label>
            <label className="bouquet-manage-field"><span>Frontend GitHub <small>선택</small></span><input type="url" value={frontendRepositoryUrl} onChange={(event) => setFrontendRepositoryUrl(event.target.value)} disabled={selectedProjectId == null} placeholder="https://github.com/org/frontend" /></label>
            <label className="bouquet-manage-field"><span>Backend GitHub <small>선택</small></span><input type="url" value={backendRepositoryUrl} onChange={(event) => setBackendRepositoryUrl(event.target.value)} disabled={selectedProjectId == null} placeholder="https://github.com/org/backend" /></label>

            <label className="bouquet-manage-check">
              <input type="checkbox" checked={requiresAuth} onChange={(event) => setRequiresAuth(event.target.checked)} disabled={selectedProjectId == null} />
              <span><strong>꽃다발 공통 로그인 사용</strong><small>활성화하면 HTTPS Demo URL과 동일 origin의 callback URL이 필요합니다.</small></span>
            </label>

            {requiresAuth && (
              <label className="bouquet-manage-field bouquet-manage-full"><span>Auth Callback URL</span><input type="url" value={authRedirectUri} onChange={(event) => setAuthRedirectUri(event.target.value)} disabled={selectedProjectId == null} required placeholder="https://example.com/auth/bouquet/callback" /></label>
            )}

            <button className="bouquet-manage-submit" type="submit" disabled={busy !== null || selectedProjectId == null}>{busy === 'submission' ? '등록 중...' : 'Submission 등록 · 평가 시작'}</button>
          </form>
        </article>
      </section>
    </main>
  )
}
