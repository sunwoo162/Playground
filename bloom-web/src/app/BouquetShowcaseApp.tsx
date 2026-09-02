import { useEffect, useMemo, useState } from 'react'

import {
  BouquetWordmark,
  EmptyState,
  Metric,
  ProjectVisual,
  ScoreBadge,
  SecondaryButton,
  StatusBadge,
} from './BouquetUI'
import './bouquet-showcase.css'

type Submission = {
  id: number
  version: string
  demoUrl: string
  frontendRepositoryUrl: string | null
  backendRepositoryUrl: string | null
  requiresAuth: boolean
  authPolicyId: string
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

type SortMode = 'newest' | 'score'

function statusLabel(status: string | null) {
  switch (status) {
    case 'COMPLETED': return '평가 완료'
    case 'RUNNING': return '평가 진행 중'
    case 'QUEUED': return '평가 대기'
    case 'FAILED': return '평가 실패'
    default: return '미평가'
  }
}

export default function BouquetShowcaseApp() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [teamFilter, setTeamFilter] = useState('ALL')
  const [sortMode, setSortMode] = useState<SortMode>('newest')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/bloom-bouquet/public/projects', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`프로젝트 목록을 불러오지 못했습니다. (${response.status})`)
        return response.json() as Promise<Project[]>
      })
      .then(setProjects)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : '프로젝트 목록을 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  const teamNames = useMemo(
    () => [...new Set(projects.map((project) => project.teamName))].sort((a, b) => a.localeCompare(b, 'ko-KR')),
    [projects],
  )
  const reviewed = useMemo(
    () => projects.filter((project) => project.latestSubmission?.evaluationStatus === 'COMPLETED').length,
    [projects],
  )
  const visibleProjects = useMemo(() => {
    const filtered = teamFilter === 'ALL'
      ? projects
      : projects.filter((project) => project.teamName === teamFilter)

    return [...filtered].sort((a, b) => {
      if (sortMode === 'score') {
        const scoreDiff = (b.latestSubmission?.overallScore ?? -1) - (a.latestSubmission?.overallScore ?? -1)
        if (scoreDiff !== 0) return scoreDiff
      }
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    })
  }, [projects, sortMode, teamFilter])

  return (
    <main className="bouquet-showcase-shell">
      <header className="bouquet-showcase-header">
        <div className="bouquet-showcase-nav"><BouquetWordmark /></div>
        <div className="bouquet-showcase-hero">
          <div className="bouquet-showcase-metrics" aria-label="BloomBouquet summary">
            <Metric value={projects.length} label="Projects" />
            <Metric value={teamNames.length} label="Teams" />
            <Metric value={reviewed} label="Reviewed" />
          </div>
        </div>
      </header>

      {!loading && !error && projects.length > 0 && (
        <section className="bouquet-showcase-controls" aria-label="프로젝트 필터와 정렬">
          <div className="bouquet-team-filter" role="group" aria-label="팀 필터">
            <button type="button" className={teamFilter === 'ALL' ? 'is-active' : ''} onClick={() => setTeamFilter('ALL')}>ALL</button>
            {teamNames.map((team) => (
              <button key={team} type="button" className={teamFilter === team ? 'is-active' : ''} onClick={() => setTeamFilter(team)}>{team}</button>
            ))}
          </div>
          <div className="bouquet-sort-control" role="group" aria-label="프로젝트 정렬">
            <button type="button" className={sortMode === 'newest' ? 'is-active' : ''} onClick={() => setSortMode('newest')}>최신순</button>
            <button type="button" className={sortMode === 'score' ? 'is-active' : ''} onClick={() => setSortMode('score')}>점수순</button>
          </div>
        </section>
      )}

      {loading && (
        <section className="bouquet-project-gallery" aria-label="프로젝트를 불러오는 중">
          <div className="bouquet-skeleton" />
          <div className="bouquet-skeleton" />
          <div className="bouquet-skeleton" />
        </section>
      )}

      {error && (
        <EmptyState
          eyebrow="LOAD ERROR"
          title="프로젝트를 불러오지 못했습니다."
          description={error}
          action={<SecondaryButton onClick={() => window.location.reload()}>다시 불러오기</SecondaryButton>}
        />
      )}

      {!loading && !error && projects.length === 0 && (
        <EmptyState
          eyebrow="FIRST BLOOM"
          title="아직 공개된 프로젝트가 없습니다."
          description="첫 프로젝트가 등록되면 실제 배포 정보와 Senior Agent 평가 결과가 이곳에 나타납니다."
        />
      )}

      {!loading && !error && projects.length > 0 && visibleProjects.length === 0 && (
        <EmptyState
          eyebrow="NO MATCH"
          title="이 팀의 프로젝트가 아직 없습니다."
          description="다른 팀을 선택하면 공개된 프로젝트를 계속 둘러볼 수 있습니다."
          action={<SecondaryButton onClick={() => setTeamFilter('ALL')}>전체 프로젝트 보기</SecondaryButton>}
        />
      )}

      {!loading && !error && visibleProjects.length > 0 && (
        <section className="bouquet-project-gallery" aria-label="Projects">
          {visibleProjects.map((project, index) => {
            const submission = project.latestSubmission
            return (
              <article className="bouquet-project-card" key={project.id}>
                <a className="bouquet-project-card-link" href={`/?project=${project.id}`} aria-label={`${project.name} 상세 보기`}>
                  <ProjectVisual name={project.name} teamName={project.teamName} status={submission?.evaluationStatus ?? null} />
                  <div className="bouquet-project-card-body">
                    <div className="bouquet-project-card-topline">
                      <span>{String(index + 1).padStart(2, '0')} · TEAM {project.teamName}</span>
                      <StatusBadge status={submission?.evaluationStatus ?? null}>{statusLabel(submission?.evaluationStatus ?? null)}</StatusBadge>
                    </div>
                    <div className="bouquet-project-heading">
                      <div>
                        <h2>{project.name}</h2>
                        <p>{project.description}</p>
                      </div>
                      <ScoreBadge score={submission?.overallScore ?? null} stars={submission?.overallStars ?? null} />
                    </div>
                    <div className="bouquet-project-meta">
                      <span>{submission ? `v${submission.version}` : '버전 없음'}</span>
                      {submission?.requiresAuth && <span>꽃다발 인증</span>}
                    </div>
                  </div>
                </a>
                {submission?.demoUrl && (
                  <a className="bouquet-project-live-link" href={submission.demoUrl}>LIVE DEMO <span aria-hidden="true">↗</span></a>
                )}
              </article>
            )
          })}
        </section>
      )}
    </main>
  )
}
