import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  auditLiveE2ESnapshot,
  createLiveE2ESmokeRequest,
  LIVE_E2E_MARKER,
  type LiveE2ESnapshotEnvelope,
} from '../../../bloom-runtime/ts/e2eSmoke'

import './live-e2e.css'

type BuilderUser = {
  login: string
}

type BuilderProject = {
  id: number
  title: string
  brief: string
  status: string
  repositoryFullName?: string | null
  createdAt?: string | null
}

type BuilderRun = {
  id: number
  projectId: number
  status: string
  workerId?: string | null
  failureReason?: string | null
  startedAt?: string | null
  finishedAt?: string | null
}

type LiveE2EPanelProps = {
  onClose: () => void
}

const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed'])

const preconditions = [
  'Bloom backend와 headless worker가 실행 중이어야 합니다.',
  'worker 머신에서 codex login status가 인증 상태여야 합니다.',
  'gh auth status가 대상 GitHub organization에 접근 가능해야 합니다.',
  'Git push와 BLOOM_WORKSPACE_ROOT 쓰기가 가능해야 합니다.',
  'Bloom Runtime bridge를 빌드하고 실행할 수 있어야 합니다.',
]

async function readError(response: Response) {
  const text = await response.text()
  return text || `요청에 실패했습니다. (${response.status})`
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function LiveE2EPanel({ onClose }: LiveE2EPanelProps) {
  const [fixture, setFixture] = useState(() => createLiveE2ESmokeRequest())
  const [user, setUser] = useState<BuilderUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [project, setProject] = useState<BuilderProject | null>(null)
  const [run, setRun] = useState<BuilderRun | null>(null)
  const [snapshot, setSnapshot] = useState<LiveE2ESnapshotEnvelope | null>(null)
  const [starting, setStarting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')

  const audit = useMemo(
    () => auditLiveE2ESnapshot(snapshot, run?.status ?? 'queued'),
    [snapshot, run?.status],
  )

  const handleLogin = useCallback(() => {
    window.location.href = `/auth/github?returnTo=${encodeURIComponent(window.location.pathname)}`
  }, [])

  const loadSnapshot = useCallback(async (projectId: number, runId: number) => {
    const response = await fetch(`/api/builder/projects/${projectId}/runs/${runId}/snapshot`, {
      credentials: 'include',
    })
    if (response.status === 401) {
      setUser(null)
      throw new Error('로그인이 필요합니다.')
    }
    if (response.status === 204) return null
    if (!response.ok) throw new Error(await readError(response))
    return await response.json() as LiveE2ESnapshotEnvelope
  }, [])

  const refreshEvidence = useCallback(async (
    selectedProject: BuilderProject,
    selectedRun: BuilderRun,
    silent = false,
  ) => {
    if (!silent) setRefreshing(true)
    try {
      const runResponse = await fetch(
        `/api/builder/projects/${selectedProject.id}/runs/${selectedRun.id}`,
        { credentials: 'include' },
      )
      if (runResponse.status === 401) {
        setUser(null)
        throw new Error('로그인이 필요합니다.')
      }
      if (!runResponse.ok) throw new Error(await readError(runResponse))
      const latestRun = await runResponse.json() as BuilderRun
      const latestSnapshot = await loadSnapshot(selectedProject.id, selectedRun.id)
      setRun(latestRun)
      setSnapshot(latestSnapshot)
      setProject((current) => current ? { ...current, status: latestRun.status } : current)
      if (!silent) {
        setMessage(`Run #${latestRun.id} evidence를 새로고침했습니다.`)
      }
    } catch (error) {
      if (!silent) {
        setMessage(error instanceof Error ? error.message : 'E2E evidence를 불러오지 못했습니다.')
      }
    } finally {
      if (!silent) setRefreshing(false)
    }
  }, [loadSnapshot])

  const recoverLatestSmoke = useCallback(async () => {
    try {
      const projectsResponse = await fetch('/api/builder/projects', { credentials: 'include' })
      if (projectsResponse.status === 401) return
      if (!projectsResponse.ok) throw new Error(await readError(projectsResponse))
      const projects = await projectsResponse.json() as BuilderProject[]
      const latest = projects.find((candidate) => candidate.brief.includes(LIVE_E2E_MARKER))
      if (!latest) return

      const runsResponse = await fetch(`/api/builder/projects/${latest.id}/runs`, {
        credentials: 'include',
      })
      if (!runsResponse.ok) throw new Error(await readError(runsResponse))
      const runs = await runsResponse.json() as BuilderRun[]
      const latestRun = runs[0] ?? null
      setProject(latest)
      setRun(latestRun)
      if (latestRun) {
        setSnapshot(await loadSnapshot(latest.id, latestRun.id))
        setMessage(`가장 최근 Bloom Live E2E Run #${latestRun.id}을 복구했습니다.`)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '최근 Live E2E 실행을 복구하지 못했습니다.')
    }
  }, [loadSnapshot])

  useEffect(() => {
    let active = true
    fetch('/auth/me', { credentials: 'include' })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return
        const currentUser = data?.user ?? null
        setUser(currentUser)
        if (currentUser) void recoverLatestSmoke()
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setAuthLoading(false)
      })
    return () => {
      active = false
    }
  }, [recoverLatestSmoke])

  useEffect(() => {
    if (!project || !run || TERMINAL_RUN_STATUSES.has(run.status)) return
    const timer = window.setInterval(() => {
      void refreshEvidence(project, run, true)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [project, refreshEvidence, run])

  const startSmoke = async () => {
    if (starting) return
    if (!user) {
      handleLogin()
      return
    }

    setStarting(true)
    setMessage('Pulseboard E2E 프로젝트를 정상 Bloom API로 생성하고 있습니다.')
    setProject(null)
    setRun(null)
    setSnapshot(null)

    try {
      const projectResponse = await fetch('/api/builder/projects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: fixture.request,
          platform: 'web',
          features: [],
          templateId: 'live-e2e',
        }),
      })
      if (projectResponse.status === 401) {
        handleLogin()
        return
      }
      if (!projectResponse.ok) throw new Error(await readError(projectResponse))
      const createdProject = await projectResponse.json() as BuilderProject
      setProject(createdProject)

      const runResponse = await fetch(`/api/builder/projects/${createdProject.id}/runs`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!runResponse.ok) throw new Error(await readError(runResponse))
      const createdRun = await runResponse.json() as BuilderRun
      setRun(createdRun)
      setMessage(`Run #${createdRun.id}이 실제 Bloom worker queue에 등록되었습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Live E2E 실행을 시작하지 못했습니다.')
    } finally {
      setStarting(false)
    }
  }

  const createNewFixture = () => {
    if (run && !TERMINAL_RUN_STATUSES.has(run.status)) {
      setMessage('현재 Live E2E Run이 진행 중입니다. 완료 또는 실패 후 새 fixture를 만드세요.')
      return
    }
    setFixture(createLiveE2ESmokeRequest())
    setProject(null)
    setRun(null)
    setSnapshot(null)
    setMessage('새 Pulseboard Live E2E fixture를 준비했습니다.')
  }

  const phase = snapshot?.phase ?? (run?.status === 'queued' ? 'queue' : 'none')
  const terminal = run ? TERMINAL_RUN_STATUSES.has(run.status) : false

  return (
    <section className="bloom-e2e-panel">
      <header className="bloom-e2e-header">
        <div>
          <span className="bloom-e2e-kicker">PRODUCTION PATH SMOKE</span>
          <h1>Bloom Live E2E</h1>
          <p>Pulseboard 하나를 실제 프로젝트 queue와 headless Agent Runtime으로 끝까지 통과시킵니다.</p>
        </div>
        <button className="bloom-e2e-close" type="button" onClick={onClose} aria-label="Live E2E 닫기">×</button>
      </header>

      <div className="bloom-e2e-grid">
        <div className="bloom-e2e-main">
          <section className="bloom-e2e-card bloom-e2e-fixture">
            <div className="bloom-e2e-card-heading">
              <div>
                <span>FIXTURE</span>
                <h2>{fixture.repositoryName}</h2>
              </div>
              <span className="bloom-e2e-path-badge">normal API path</span>
            </div>
            <p>
              숨겨진 테스트 shortcut 없이 일반 프로젝트 생성 API와 Run queue를 그대로 사용합니다.
              Frontend + Backend, PR evidence, Review/QA, integration merge까지 감사합니다.
            </p>
            <div className="bloom-e2e-actions">
              <button className="bloom-e2e-primary" type="button" onClick={() => void startSmoke()} disabled={starting || authLoading || Boolean(run && !terminal)}>
                {starting ? 'Live E2E 시작 중…' : !user ? '로그인하고 Live E2E 시작' : 'Pulseboard Live E2E 시작'}
              </button>
              <button className="bloom-e2e-secondary" type="button" onClick={createNewFixture} disabled={starting}>새 fixture</button>
              {project && run && (
                <button
                  className="bloom-e2e-secondary"
                  type="button"
                  onClick={() => void refreshEvidence(project, run)}
                  disabled={refreshing}
                >
                  {refreshing ? '새로고침 중…' : 'Evidence 새로고침'}
                </button>
              )}
            </div>
            {message && <p className="bloom-e2e-message" role="status">{message}</p>}
          </section>

          <section className="bloom-e2e-card">
            <div className="bloom-e2e-card-heading">
              <div>
                <span>AUDIT</span>
                <h2>{audit.completedChecks} / {audit.totalChecks} checks</h2>
              </div>
              <span className={`bloom-e2e-result ${audit.passed ? 'is-pass' : 'is-running'}`}>
                {audit.passed ? 'ALL PASS' : run?.status === 'failed' ? 'FAILED' : 'IN PROGRESS'}
              </span>
            </div>

            <div className="bloom-e2e-checks">
              {audit.checks.map((item, index) => (
                <article className={`bloom-e2e-check is-${item.status}`} key={item.id}>
                  <div className="bloom-e2e-check-top">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{item.label}</strong>
                    <em>{item.status.toUpperCase()}</em>
                  </div>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="bloom-e2e-aside">
          <section className="bloom-e2e-card">
            <div className="bloom-e2e-card-heading compact">
              <div>
                <span>RUN</span>
                <h2>Runtime evidence</h2>
              </div>
            </div>
            <dl className="bloom-e2e-runtime">
              <div><dt>Project</dt><dd>{project ? `#${project.id}` : '-'}</dd></div>
              <div><dt>Run</dt><dd>{run ? `#${run.id}` : '-'}</dd></div>
              <div><dt>Status</dt><dd>{run?.status ?? 'not started'}</dd></div>
              <div><dt>Phase</dt><dd>{phase}</dd></div>
              <div><dt>Snapshot</dt><dd>{snapshot ? `v${snapshot.version}` : '-'}</dd></div>
              <div><dt>Worker</dt><dd>{run?.workerId ?? '-'}</dd></div>
              <div><dt>Started</dt><dd>{formatDate(run?.startedAt)}</dd></div>
              <div><dt>Finished</dt><dd>{formatDate(run?.finishedAt)}</dd></div>
            </dl>
            {run?.failureReason && <p className="bloom-e2e-failure">{run.failureReason}</p>}
            {project?.repositoryFullName && (
              <p className="bloom-e2e-repository">Repository: {project.repositoryFullName}</p>
            )}
          </section>

          <section className="bloom-e2e-card">
            <div className="bloom-e2e-card-heading compact">
              <div>
                <span>PREFLIGHT</span>
                <h2>Worker prerequisites</h2>
              </div>
            </div>
            <ul className="bloom-e2e-preflight">
              {preconditions.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="bloom-e2e-note">
              이 화면은 credential을 대신 만들지 않습니다. 조건이 없으면 worker가 정상적으로 block/fail evidence를 남겨야 합니다.
            </p>
          </section>
        </aside>
      </div>
    </section>
  )
}
