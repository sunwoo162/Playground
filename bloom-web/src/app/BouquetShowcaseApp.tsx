import { useEffect, useMemo, useState } from 'react'

import {
  BouquetWordmark,
  EmptyState,
  Metric,
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

type AgentEvaluation = {
  agentRole: string
  score: number
  stars: number
  assessment: string
  evidence: string[]
  severity: string
  impact: string
  recommendation: string
  priority: string
  confidence: string
  technicalTerms: string[]
  createdAt: string
}

type EvaluationReport = {
  runId: number
  status: string
  overallScore: number | null
  overallStars: number | null
  reportSummary: string | null
  agentEvaluations: AgentEvaluation[]
  startedAt: string | null
  completedAt: string | null
}

const ROLE_LABELS: Record<string, string> = {
  'user-a': 'User Agent A',
  'user-b': 'User Agent B',
  'ux-research': 'UX Research',
  frontend: 'Frontend',
  backend: 'Backend',
  security: 'Security',
  accessibility: 'Accessibility',
  performance: 'Performance',
  qa: 'QA',
  documentation: 'Documentation',
  'code-review': 'Code Review',
}

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

function stars(value: number | null) {
  if (value == null) return '평가 전'
  return `★ ${value.toFixed(1)}`
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

function cardSize(index: number) {
  if (index === 0) return 'bouquet-project-featured'
  if (index % 5 === 1) return 'is-wide'
  if (index % 5 === 2) return 'is-tall'
  return 'is-compact'
}

export default function BouquetShowcaseApp() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<EvaluationReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)

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

  const teams = useMemo(() => new Set(projects.map((project) => project.teamName)).size, [projects])
  const completed = useMemo(
    () => projects.filter((project) => project.latestSubmission?.evaluationStatus === 'COMPLETED').length,
    [projects],
  )
  const keyFindings = useMemo(() => {
    if (!report) return []
    return [...report.agentEvaluations]
      .sort((a, b) => (SEVERITY_ORDER[a.severity.toUpperCase()] ?? 9) - (SEVERITY_ORDER[b.severity.toUpperCase()] ?? 9))
      .slice(0, 3)
  }, [report])

  async function openReport(runId: number) {
    setReportLoading(true)
    try {
      const response = await fetch(`/api/bloom-bouquet/public/evaluations/${runId}`)
      if (!response.ok) throw new Error(`평가 보고서를 불러오지 못했습니다. (${response.status})`)
      setReport(await response.json() as EvaluationReport)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '평가 보고서를 불러오지 못했습니다.')
    } finally {
      setReportLoading(false)
    }
  }

  return (
    <main className="bouquet-showcase-shell">
      <header className="bouquet-showcase-header">
        <div className="bouquet-showcase-nav"><BouquetWordmark /></div>
        <div className="bouquet-showcase-intro">
          <p className="bouquet-kicker">CURATED BUILDS · INDEPENDENT REVIEW</p>
          <h1>만든 프로젝트를<br />제대로 보여주고, 제대로 평가합니다.</h1>
          <p className="bouquet-showcase-copy">여러 팀의 실제 배포 프로젝트를 한곳에 모으고, 독립적인 10년+ 시니어 Agent들이 사용성과 기술 완성도를 검토합니다.</p>
        </div>
        <div className="bouquet-showcase-metrics" aria-label="BloomBouquet summary">
          <Metric value={projects.length} label="Projects" />
          <Metric value={teams} label="Teams" />
          <Metric value={completed} label="Reviewed" />
        </div>
      </header>

      {loading && (
        <section className="bouquet-bento-grid" aria-label="프로젝트를 불러오는 중">
          <div className="bouquet-skeleton bouquet-project-featured" />
          <div className="bouquet-skeleton is-wide" />
          <div className="bouquet-skeleton is-compact" />
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
          description="첫 프로젝트가 등록되면 배포 화면과 Senior Agent 평가 결과가 이곳에 함께 나타납니다."
        />
      )}

      {!loading && !error && projects.length > 0 && (
        <section className="bouquet-bento-grid" aria-label="Projects">
          {projects.map((project, index) => {
            const submission = project.latestSubmission
            const featured = index === 0
            return (
              <article className={`bouquet-project-card ${cardSize(index)}`} key={project.id}>
                <ProjectVisual
                  name={project.name}
                  teamName={project.teamName}
                  status={submission?.evaluationStatus ?? null}
                  featured={featured}
                />
                <div className="bouquet-project-card-body">
                  <div className="bouquet-project-card-topline">
                    <span>TEAM {project.teamName}</span>
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
                    <span>{stars(submission?.overallStars ?? null)}</span>
                    {submission?.requiresAuth && <span>꽃다발 인증</span>}
                  </div>
                  <div className="bouquet-project-actions">
                    {submission?.demoUrl && <PrimaryButton href={submission.demoUrl}>프로젝트 보기</PrimaryButton>}
                    {submission?.evaluationRunId && (
                      <SecondaryButton disabled={reportLoading} onClick={() => openReport(submission.evaluationRunId!)}>평가 보기</SecondaryButton>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      )}

      {report && (
        <div className="bouquet-report-backdrop" role="presentation" onMouseDown={() => setReport(null)}>
          <section
            className="bouquet-report-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="BloomBouquet evaluation report"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="bouquet-report-sticky">
              <div>
                <p className="bouquet-kicker">EVALUATION RUN #{report.runId}</p>
                <h2>Senior Agent Review</h2>
              </div>
              <button className="bouquet-report-close" type="button" onClick={() => setReport(null)} aria-label="Close report">×</button>
            </div>

            <div className="bouquet-report-hero">
              <div className="bouquet-report-score"><strong>{report.overallScore ?? '—'}</strong><span>Overall / 100</span></div>
              <div className="bouquet-report-rating"><strong>{stars(report.overallStars)}</strong><span>Independent senior-agent rating</span></div>
              <StatusBadge status={report.status}>{statusLabel(report.status)}</StatusBadge>
            </div>

            {report.reportSummary && (
              <section className="bouquet-report-summary-copy">
                <p className="bouquet-kicker">EVALUATOR SUMMARY</p>
                <p>{report.reportSummary}</p>
              </section>
            )}

            {keyFindings.length > 0 && (
              <section className="bouquet-key-findings" aria-label="Key findings">
                <div className="bouquet-report-section-heading"><p className="bouquet-kicker">KEY FINDINGS</p><span>우선순위가 높은 리뷰</span></div>
                <div className="bouquet-key-finding-grid">
                  {keyFindings.map((evaluation) => (
                    <article key={evaluation.agentRole}>
                      <StatusBadge status={evaluation.severity === 'CRITICAL' || evaluation.severity === 'HIGH' ? 'FAILED' : evaluation.severity === 'MEDIUM' ? 'QUEUED' : null}>
                        {evaluation.severity} · {evaluation.priority}
                      </StatusBadge>
                      <h3>{ROLE_LABELS[evaluation.agentRole] ?? evaluation.agentRole}</h3>
                      <p>{evaluation.recommendation}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="bouquet-agent-reviews">
              <div className="bouquet-report-section-heading"><p className="bouquet-kicker">AGENT REVIEWS</p><span>{report.agentEvaluations.length} independent reviews</span></div>
              {report.agentEvaluations.map((evaluation) => (
                <article className="bouquet-agent-review" key={evaluation.agentRole}>
                  <header className="bouquet-agent-review-header">
                    <div><span>{ROLE_LABELS[evaluation.agentRole] ?? evaluation.agentRole}</span><strong>{evaluation.score} / 100 · {stars(evaluation.stars)}</strong></div>
                    <StatusBadge status={evaluation.severity === 'CRITICAL' || evaluation.severity === 'HIGH' ? 'FAILED' : evaluation.severity === 'MEDIUM' ? 'QUEUED' : null}>
                      {evaluation.severity} · {evaluation.priority}
                    </StatusBadge>
                  </header>
                  <div className="bouquet-agent-primary-copy">
                    <div><h4>Assessment</h4><p>{evaluation.assessment}</p></div>
                    <div><h4>Recommendation</h4><p>{evaluation.recommendation}</p></div>
                  </div>
                  <details className="bouquet-agent-details">
                    <summary>Evidence & technical detail</summary>
                    <div className="bouquet-agent-detail-grid">
                      <div><h4>Impact</h4><p>{evaluation.impact}</p></div>
                      <div><h4>Confidence</h4><p>{evaluation.confidence}</p></div>
                    </div>
                    {evaluation.evidence.length > 0 && <ul>{evaluation.evidence.map((item) => <li key={item}>{item}</li>)}</ul>}
                    {evaluation.technicalTerms.length > 0 && <div className="bouquet-agent-terms">{evaluation.technicalTerms.map((term) => <span key={term}>{term}</span>)}</div>}
                  </details>
                </article>
              ))}
            </section>
          </section>
        </div>
      )}
    </main>
  )
}
