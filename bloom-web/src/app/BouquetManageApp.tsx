import { FormEvent, useEffect, useMemo, useState } from 'react'

import { BouquetWordmark, Field, Metric, PrimaryButton, SecondaryButton, StatusBadge, Surface } from './BouquetUI'
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

type ManagePanel = 'overview' | 'team' | 'project' | 'submission'

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

const PANEL_LABELS: Array<{ id: ManagePanel; number: string; label: string; description: string }> = [
  { id: 'overview', number: '00', label: 'Overview', description: '현재 등록 상태' },
  { id: 'team', number: '01', label: 'Team', description: '팀 선택·생성' },
  { id: 'project', number: '02', label: 'Project', description: '프로젝트 선택·생성' },
  { id: 'submission', number: '03', label: 'Submission', description: '배포·평가 등록' },
]

export default function BouquetManageApp() {
  const [user, setUser] = useState<BouquetUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [teams, setTeams] = useState<Team[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [activePanel, setActivePanel] = useState<ManagePanel>('overview')
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
  const latestSubmission = selectedProject?.latestSubmission ?? null
  const reviewedProjects = projects.filter((project) => project.latestSubmission?.evaluationStatus === 'COMPLETED').length

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
      setActivePanel('project')
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
      setActivePanel('submission')
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
      setActivePanel('overview')
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
        <div className="bouquet-manage-topbar"><BouquetWordmark /></div>
        <div className="bouquet-manage-loading"><span className="bouquet-skeleton" /><p>프로젝트 관리 정보를 불러오는 중...</p></div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="bouquet-manage-shell">
        <div className="bouquet-manage-topbar"><BouquetWordmark /></div>
        <Surface className="bouquet-manage-auth-required">
          <p className="bouquet-kicker">PROJECT OWNER ACCESS</p>
          <h1>프로젝트 관리는<br />주인만 할 수 있습니다.</h1>
          <p>팀과 프로젝트를 등록하려면 꽃다발 계정으로 로그인해주세요.</p>
          {error && <div className="bouquet-manage-error">{error}</div>}
          <PrimaryButton href="?mode=auth&return_to=manage">꽃다발 로그인</PrimaryButton>
        </Surface>
      </main>
    )
  }

  return (
    <main className="bouquet-manage-shell">
      <div className="bouquet-manage-topbar">
        <BouquetWordmark />
        <div className="bouquet-manage-account">
          <span>{user.displayName}</span>
          <small>{user.email}</small>
        </div>
      </div>

      <header className="bouquet-manage-header">
        <div>
          <p className="bouquet-kicker">PROJECT OWNER CONSOLE</p>
          <h1>프로젝트 관리</h1>
          <p>Team → Project → Submission 순서의 수동 등록은 필요할 때만 열고, 현재 작업에 집중하세요.</p>
        </div>
        <div className="bouquet-manage-header-metrics">
          <Metric value={teams.length} label="Teams" />
          <Metric value={projects.length} label="Projects" />
          <Metric value={reviewedProjects} label="Reviewed" />
        </div>
      </header>

      {error && <div className="bouquet-manage-error" role="alert">{error}</div>}
      {success && (
        <section className="bouquet-manage-success" aria-live="polite">
          <StatusBadge status={success.evaluationStatus}>평가 Run 생성 완료</StatusBadge>
          <div><strong>Run #{success.evaluationRunId}</strong><p>{success.evaluationStatus} 상태로 등록되었습니다. production evaluator가 자동으로 평가를 시작합니다.</p></div>
          <SecondaryButton href="/">공개 평가 현황 보기</SecondaryButton>
        </section>
      )}

      <section className="bouquet-manage-workspace">
        <nav className="bouquet-manage-rail" aria-label="프로젝트 관리 메뉴">
          <div className="bouquet-manage-rail-heading"><span>Workspace</span><strong>{selectedProject?.name ?? selectedTeam?.name ?? '새 프로젝트'}</strong></div>
          {PANEL_LABELS.map((panel) => (
            <button
              key={panel.id}
              type="button"
              className={activePanel === panel.id ? 'is-active' : ''}
              aria-current={activePanel === panel.id ? 'page' : undefined}
              onClick={() => setActivePanel(panel.id)}
            >
              <span>{panel.number}</span>
              <div><strong>{panel.label}</strong><small>{panel.description}</small></div>
            </button>
          ))}
        </nav>

        <div className="bouquet-manage-main">
          <Surface className="bouquet-manage-context">
            <div>
              <p className="bouquet-kicker">CURRENT CONTEXT</p>
              <strong>{selectedProject?.name ?? selectedTeam?.name ?? '아직 선택된 프로젝트가 없습니다'}</strong>
            </div>
            <div className="bouquet-manage-context-controls">
              <Field label="Team">
                <select value={selectedTeamId ?? ''} onChange={(event) => selectTeam(event.target.value ? Number(event.target.value) : null)}>
                  <option value="">팀 선택</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </Field>
              <Field label="Project">
                <select
                  value={selectedProjectId ?? ''}
                  disabled={selectedTeamId == null}
                  onChange={(event) => { setSelectedProjectId(event.target.value ? Number(event.target.value) : null); setSuccess(null) }}
                >
                  <option value="">프로젝트 선택</option>
                  {teamProjects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.published ? ' · 공개' : ' · 미공개'}</option>)}
                </select>
              </Field>
            </div>
          </Surface>

          {activePanel === 'overview' && (
            <div className="bouquet-manage-panel bouquet-manage-overview">
              <div className="bouquet-manage-panel-heading"><div><p className="bouquet-kicker">OVERVIEW</p><h2>지금 필요한 다음 작업</h2></div><StatusBadge status={latestSubmission?.evaluationStatus ?? null}>{latestSubmission?.evaluationStatus ?? '미등록'}</StatusBadge></div>

              <div className="bouquet-manage-overview-grid">
                <Surface className="bouquet-manage-overview-primary">
                  <span>Selected project</span>
                  <h3>{selectedProject?.name ?? '프로젝트를 선택하세요'}</h3>
                  <p>{selectedProject?.description ?? 'Team과 Project를 선택하면 최신 배포와 평가 상태를 한 번에 볼 수 있습니다.'}</p>
                  {latestSubmission ? (
                    <div className="bouquet-manage-overview-meta">
                      <span>v{latestSubmission.version}</span>
                      <span>{latestSubmission.demoUrl}</span>
                    </div>
                  ) : (
                    <PrimaryButton onClick={() => setActivePanel(selectedProject ? 'submission' : selectedTeam ? 'project' : 'team')}>
                      {selectedProject ? 'Submission 등록' : selectedTeam ? 'Project 만들기' : 'Team 만들기'}
                    </PrimaryButton>
                  )}
                </Surface>

                <Surface className="bouquet-manage-overview-side">
                  <span>Evaluation</span>
                  <strong>{latestSubmission?.overallScore ?? '—'}</strong>
                  <small>{latestSubmission?.evaluationRunId ? `Run #${latestSubmission.evaluationRunId}` : '평가 Run 없음'}</small>
                </Surface>

                <Surface className="bouquet-manage-overview-side">
                  <span>Auth</span>
                  <strong>{latestSubmission?.requiresAuth ? 'Bouquet' : 'None'}</strong>
                  <small>{latestSubmission?.bouquetClientId ? 'OAuth client issued' : '공통 로그인 미사용'}</small>
                </Surface>
              </div>
            </div>
          )}

          {activePanel === 'team' && (
            <div className="bouquet-manage-panel">
              <div className="bouquet-manage-panel-heading"><div><p className="bouquet-kicker">01 · TEAM</p><h2>프로젝트의 팀을 관리합니다.</h2></div><span>{teams.length} teams</span></div>
              <Surface className="bouquet-manage-form-surface">
                <Field label="기존 팀">
                  <select value={selectedTeamId ?? ''} onChange={(event) => selectTeam(event.target.value ? Number(event.target.value) : null)}>
                    <option value="">팀 선택</option>
                    {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                </Field>
                <div className="bouquet-manage-divider"><span>또는 새 팀</span></div>
                <form className="bouquet-manage-form" onSubmit={createTeam}>
                  <Field label="팀 이름"><input value={teamName} onChange={(event) => setTeamName(event.target.value)} maxLength={120} required placeholder="예: 백합" /></Field>
                  <Field label="Slug" hint="선택"><input value={teamSlug} onChange={(event) => setTeamSlug(event.target.value)} placeholder="lily-team" /></Field>
                  <PrimaryButton type="submit" disabled={busy !== null}>{busy === 'team' ? '생성 중...' : '새 팀 만들기'}</PrimaryButton>
                </form>
              </Surface>
            </div>
          )}

          {activePanel === 'project' && (
            <div className="bouquet-manage-panel">
              <div className="bouquet-manage-panel-heading"><div><p className="bouquet-kicker">02 · PROJECT</p><h2>평가할 프로젝트 정보를 등록합니다.</h2></div><span>{teamProjects.length} projects</span></div>
              <Surface className={`bouquet-manage-form-surface ${selectedTeamId == null ? 'is-disabled' : ''}`}>
                <Field label="기존 프로젝트">
                  <select value={selectedProjectId ?? ''} disabled={selectedTeamId == null} onChange={(event) => setSelectedProjectId(event.target.value ? Number(event.target.value) : null)}>
                    <option value="">프로젝트 선택</option>
                    {teamProjects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.published ? ' · 공개' : ' · 미공개'}</option>)}
                  </select>
                </Field>
                <div className="bouquet-manage-divider"><span>또는 새 프로젝트</span></div>
                <form className="bouquet-manage-form" onSubmit={createProject}>
                  <Field label="프로젝트 이름"><input value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={160} disabled={selectedTeamId == null} required placeholder="프로젝트 이름" /></Field>
                  <Field label="Slug" hint="선택"><input value={projectSlug} onChange={(event) => setProjectSlug(event.target.value)} disabled={selectedTeamId == null} placeholder="my-project" /></Field>
                  <Field label="설명" className="bouquet-manage-full"><textarea value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} maxLength={4000} disabled={selectedTeamId == null} required rows={4} placeholder="프로젝트가 해결하는 문제와 핵심 기능을 적어주세요." /></Field>
                  <PrimaryButton type="submit" disabled={busy !== null || selectedTeamId == null}>{busy === 'project' ? '생성 중...' : '새 프로젝트 만들기'}</PrimaryButton>
                </form>
              </Surface>
            </div>
          )}

          {activePanel === 'submission' && (
            <div className="bouquet-manage-panel">
              <div className="bouquet-manage-panel-heading"><div><p className="bouquet-kicker">03 · SUBMISSION</p><h2>배포를 등록하고 평가를 시작합니다.</h2></div>{selectedProject && <StatusBadge status={selectedProject.latestSubmission?.evaluationStatus ?? null}>{selectedProject.published ? '공개 프로젝트' : '미공개'}</StatusBadge>}</div>
              <Surface className={`bouquet-manage-form-surface ${selectedProjectId == null ? 'is-disabled' : ''}`}>
                <form className="bouquet-manage-form bouquet-manage-submission-form" onSubmit={publishSubmission}>
                  <Field label="버전"><input value={version} onChange={(event) => setVersion(event.target.value)} maxLength={80} disabled={selectedProjectId == null} required placeholder="1.0.0" /></Field>
                  <Field label="Demo URL"><input type="url" value={demoUrl} onChange={(event) => setDemoUrl(event.target.value)} disabled={selectedProjectId == null} required placeholder="https://example.com" /></Field>
                  <Field label="Frontend GitHub" hint="선택"><input type="url" value={frontendRepositoryUrl} onChange={(event) => setFrontendRepositoryUrl(event.target.value)} disabled={selectedProjectId == null} placeholder="https://github.com/org/frontend" /></Field>
                  <Field label="Backend GitHub" hint="선택"><input type="url" value={backendRepositoryUrl} onChange={(event) => setBackendRepositoryUrl(event.target.value)} disabled={selectedProjectId == null} placeholder="https://github.com/org/backend" /></Field>

                  <label className="bouquet-manage-check bouquet-manage-full">
                    <input type="checkbox" checked={requiresAuth} onChange={(event) => setRequiresAuth(event.target.checked)} disabled={selectedProjectId == null} />
                    <span><strong>꽃다발 공통 로그인 사용</strong><small>활성화하면 HTTPS Demo URL과 동일 origin의 callback URL이 필요합니다.</small></span>
                  </label>

                  {requiresAuth && (
                    <Field label="Auth Callback URL" className="bouquet-manage-full"><input type="url" value={authRedirectUri} onChange={(event) => setAuthRedirectUri(event.target.value)} disabled={selectedProjectId == null} required placeholder="https://example.com/auth/bouquet/callback" /></Field>
                  )}

                  <div className="bouquet-manage-full bouquet-manage-submit-row">
                    <PrimaryButton type="submit" disabled={busy !== null || selectedProjectId == null}>{busy === 'submission' ? '등록 중...' : 'Submission 등록 · 평가 시작'}</PrimaryButton>
                  </div>
                </form>
              </Surface>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
