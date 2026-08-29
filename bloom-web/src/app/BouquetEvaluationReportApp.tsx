import { useEffect, useState } from 'react'

import { BouquetWordmark, EmptyState, SecondaryButton, StatusBadge } from './BouquetUI'
import './bouquet-showcase.css'

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

type Props = {
  projectId: number
  runId: number
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

function statusLabel(status: string | null) {
  switch (status) {
    case 'COMPLETED': return '평가 완료'
    case 'RUNNING': return '평가 진행 중'
    case 'QUEUED': return '평가 대기'
    case 'FAILED': return '평가 실패'
    default: return status ?? '미평가'
  }
}

function severityStatus(severity: string) {
  const value = severity.toUpperCase()
  if (value === 'CRITICAL' || value === 'HIGH') return 'FAILED'
  if (value === 'MEDIUM') return 'QUEUED'
  return null
}

function stars(value: number | null) {
  return value == null ? '—' : `★ ${value.toFixed(1)}`
}

export default function BouquetEvaluationReportApp({ projectId, runId }: Props) {
  const [report, setReport] = useState<EvaluationReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/bloom-bouquet/public/evaluations/${runId}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) throw new Error('평가 리포트를 찾지 못했습니다.')
        if (!response.ok) throw new Error(`평가 리포트를 불러오지 못했습니다. (${response.status})`)
        return response.json() as Promise<EvaluationReport>
      })
      .then(setReport)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : '평가 리포트를 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [runId])

  const backHref = `/?project=${projectId}`

  if (loading) {
    return (
      <main className="bouquet-report-page-shell">
        <div className="bouquet-report-topbar"><BouquetWordmark /><a className="bouquet-public-back" href={backHref}>← Project</a></div>
        <div className="bouquet-report-page"><div className="bouquet-skeleton" /></div>
      </main>
    )
  }

  if (error || !report) {
    return (
      <main className="bouquet-report-page-shell">
        <div className="bouquet-report-topbar"><BouquetWordmark /><a className="bouquet-public-back" href={backHref}>← Project</a></div>
        <div className="bouquet-report-page">
          <EmptyState
            eyebrow="REPORT NOT AVAILABLE"
            title="평가 리포트를 열 수 없습니다."
            description={error ?? '평가 결과를 확인할 수 없습니다.'}
            action={<SecondaryButton href={backHref}>프로젝트로 돌아가기</SecondaryButton>}
          />
        </div>
      </main>
    )
  }

  return (
    <main className="bouquet-report-page-shell">
      <div className="bouquet-report-topbar">
        <BouquetWordmark />
        <a className="bouquet-public-back" href={backHref}>← Project</a>
      </div>

      <article className="bouquet-report-page">
        <header className="bouquet-report-page-header">
          <div className="bouquet-report-page-meta">
            <div>
              <p className="bouquet-kicker">EVALUATION RUN #{report.runId}</p>
              <h1>Senior Agent Review</h1>
              <p>{stars(report.overallStars)} · {report.agentEvaluations.length} independent reviews</p>
            </div>
            <div className="bouquet-report-overall">
              <strong>{report.overallScore ?? '—'}</strong><span>/ 100</span>
            </div>
          </div>
          <div style={{ marginTop: 18 }}><StatusBadge status={report.status}>{statusLabel(report.status)}</StatusBadge></div>
        </header>

        {report.reportSummary && (
          <section className="bouquet-report-summary" aria-labelledby="report-summary-heading">
            <p className="bouquet-section-label" id="report-summary-heading">Evaluator Summary</p>
            <p>{report.reportSummary}</p>
          </section>
        )}

        <section aria-labelledby="agent-reviews-heading" style={{ paddingTop: 30 }}>
          <p className="bouquet-section-label" id="agent-reviews-heading">Agent Reviews</p>
          {report.agentEvaluations.length > 0 ? (
            <div className="bouquet-report-agent-list">
              {report.agentEvaluations.map((evaluation) => (
                <article className="bouquet-report-agent" key={evaluation.agentRole}>
                  <header className="bouquet-report-agent-header">
                    <div className="bouquet-report-agent-name">
                      <span>{evaluation.agentRole}</span>
                      <strong>{ROLE_LABELS[evaluation.agentRole] ?? evaluation.agentRole}</strong>
                    </div>
                    <div className="bouquet-report-agent-score">
                      <strong>{evaluation.score} / 100</strong>
                      <StatusBadge status={severityStatus(evaluation.severity)}>{evaluation.severity} · {evaluation.priority}</StatusBadge>
                    </div>
                  </header>

                  <div className="bouquet-report-agent-copy">
                    <div><h3>Assessment</h3><p>{evaluation.assessment}</p></div>
                    <div><h3>Recommendation</h3><p>{evaluation.recommendation}</p></div>
                  </div>

                  <details className="bouquet-report-agent-details">
                    <summary>Evidence & technical detail · {stars(evaluation.stars)}</summary>
                    <div className="bouquet-report-agent-detail-grid">
                      <div className="bouquet-report-agent-detail"><h3>Impact</h3><p>{evaluation.impact}</p></div>
                      <div className="bouquet-report-agent-detail"><h3>Confidence</h3><p>{evaluation.confidence}</p></div>
                    </div>
                    {evaluation.evidence.length > 0 && <ul className="bouquet-report-evidence">{evaluation.evidence.map((item) => <li key={item}>{item}</li>)}</ul>}
                    {evaluation.technicalTerms.length > 0 && <div className="bouquet-report-terms">{evaluation.technicalTerms.map((term) => <span key={term}>{term}</span>)}</div>}
                  </details>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState eyebrow="EVALUATION PENDING" title="Agent 평가가 아직 없습니다." description="평가가 진행되면 각 Senior Agent의 판단과 개선 권고가 여기에 표시됩니다." />
          )}
        </section>
      </article>
    </main>
  )
}
