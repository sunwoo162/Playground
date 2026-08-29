import { useEffect, useState } from 'react'

import {
  BouquetWordmark,
  EmptyState,
  PrimaryButton,
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

type ProjectDetail = {
  project: Project
  submissions: Submission[]
}

type Props = {
  projectId: number
}

function statusLabel(status: string | null) {
  switch (status) {
    case 'COMPLETED': return '평가 완료'
    case 'RUNNING': return '평가 진행 중'
    case 'QUEUED': return '평가 대기'
    case 'FAILED': return '평가 실패'
    default: return '미평가'
  }
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ko-KR')
}

export default function BouquetProjectDetailApp({ projectId }: Props) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/bloom-bouquet/public/projects/${projectId}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) throw new Error('프로젝트를 찾지 못했습니다.')
        if (!response.ok) throw new Error(`프로젝트 정보를 불러오지 못했습니다. (${response.status})`)
        return response.json() as Promise<ProjectDetail>
      })
      .then(setDetail)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : '프로젝트 정보를 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [projectId])

  if (loading) {
    return (
      <main className="bouquet-public-detail-shell">
        <div className="bouquet-public-topbar"><BouquetWordmark /><a className="bouquet-public-back" href="/">← Showcase</a></div>
        <div className="bouquet-public-detail"><div className="bouquet-skeleton" /></div>
      </main>
    )
  }

  if (error || !detail) {
    return (
      <main className="bouquet-public-detail-shell">
        <div className="bouquet-public-topbar"><BouquetWordmark /><a className="bouquet-public-back" href="/">← Showcase</a></div>
        <div className="bouquet-public-detail">
          <EmptyState
            eyebrow="PROJECT NOT AVAILABLE"
            title="프로젝트를 열 수 없습니다."
            description={error ?? '프로젝트 정보를 확인할 수 없습니다.'}
            action={<SecondaryButton href="/">Showcase로 돌아가기</SecondaryButton>}
          />
        </div>
      </main>
    )
  }

  const { project, submissions } = detail
  const latest = project.latestSubmission

  return (
    <main className="bouquet-public-detail-shell">
      <div className="bouquet-public-topbar">
        <BouquetWordmark />
        <a className="bouquet-public-back" href="/">← Showcase</a>
      </div>

      <article className="bouquet-public-detail">
        <header className="bouquet-detail-heading">
          <div>
            <p className="bouquet-kicker">TEAM {project.teamName} · PUBLIC PROJECT</p>
            <h1>{project.name}</h1>
            <p>{project.description}</p>
          </div>
          <div className="bouquet-detail-score">
            <ScoreBadge score={latest?.overallScore ?? null} stars={latest?.overallStars ?? null} />
            <StatusBadge status={latest?.evaluationStatus ?? null}>{statusLabel(latest?.evaluationStatus ?? null)}</StatusBadge>
          </div>
        </header>

        <div className="bouquet-detail-layout">
          <div className="bouquet-detail-main">
            <ProjectVisual name={project.name} teamName={project.teamName} status={latest?.evaluationStatus ?? null} />

            <section aria-labelledby="version-history-title">
              <p className="bouquet-section-label" id="version-history-title">Version History</p>
              {submissions.length > 0 ? (
                <div className="bouquet-version-list">
                  {submissions.map((submission) => (
                    <article className="bouquet-version-row" key={submission.id}>
                      <strong>v{submission.version}</strong>
                      <span>{formatDate(submission.createdAt)}</span>
                      <StatusBadge status={submission.evaluationStatus}>{statusLabel(submission.evaluationStatus)}</StatusBadge>
                      <span>{submission.overallScore == null ? '—' : `${submission.overallScore} / 100`}</span>
                      {submission.id === latest?.id ? <small>LATEST</small> : <small />}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState eyebrow="NO RELEASE" title="아직 등록된 버전이 없습니다." description="첫 Submission이 등록되면 버전과 평가 상태가 이곳에 기록됩니다." />
              )}
            </section>
          </div>

          <aside className="bouquet-detail-side" aria-label="프로젝트 메타데이터">
            <div className="bouquet-detail-side-section"><span>Team</span><strong>{project.teamName}</strong></div>
            <div className="bouquet-detail-side-section"><span>Latest Version</span><strong>{latest ? `v${latest.version}` : '—'}</strong></div>
            <div className="bouquet-detail-side-section"><span>Authentication</span><strong>{latest?.requiresAuth ? 'Bouquet OAuth' : 'Not required'}</strong></div>
            <div className="bouquet-detail-side-section"><span>Updated</span><strong>{formatDate(project.updatedAt)}</strong></div>
            <div className="bouquet-detail-actions">
              {latest?.demoUrl && <PrimaryButton href={latest.demoUrl}>Live Demo</PrimaryButton>}
              {latest?.frontendRepositoryUrl && <SecondaryButton href={latest.frontendRepositoryUrl}>Frontend GitHub</SecondaryButton>}
              {latest?.backendRepositoryUrl && <SecondaryButton href={latest.backendRepositoryUrl}>Backend GitHub</SecondaryButton>}
              {latest?.evaluationRunId && (
                <SecondaryButton href={`/?project=${projectId}&report=${latest.evaluationRunId}`}>Agent 평가 리포트 보기</SecondaryButton>
              )}
            </div>
            {!latest?.evaluationRunId && (
              <div className="bouquet-detail-side-section"><span>Evaluation</span><strong>아직 평가 Run이 없습니다.</strong></div>
            )}
          </aside>
        </div>
      </article>
    </main>
  )
}
