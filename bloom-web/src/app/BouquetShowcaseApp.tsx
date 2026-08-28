import { useEffect, useMemo, useState } from 'react'

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
    <main className="bouquet-shell">
      <header className="bouquet-hero">
        <div>
          <p className="bouquet-eyebrow">PROJECT SHOWCASE · SENIOR AGENT REVIEW</p>
          <h1>BloomBouquet</h1>
          <p className="bouquet-lead">
            여러 팀의 웹 프로젝트를 한곳에 모으고, 독립적인 10년+ 시니어 Agent들이 실제 사용성과 기술 완성도를 평가합니다.
          </p>
        </div>
        <div className="bouquet-stats" aria-label="BloomBouquet summary">
          <div><strong>{projects.length}</strong><span>Projects</span></div>
          <div><strong>{teams}</strong><span>Teams</span></div>
          <div><strong>{completed}</strong><span>Reviewed</span></div>
        </div>
      </header>

      <section className="bouquet-auth-note" aria-label="Project authentication policy">
        <span className="bouquet-auth-mark">✿</span>
        <div className="bouquet-auth-copy">
          <strong>로그인은 각 프로젝트에서 시작합니다</strong>
          <p>필요한 프로젝트만 꽃다발 공통 인증을 사용합니다.</p>
        </div>
      </section>

      {loading && <div className="bouquet-state">프로젝트를 불러오는 중...</div>}
      {error && <div className="bouquet-state bouquet-state-error">{error}</div>}
      {!loading && !error && projects.length === 0 && (
        <div className="bouquet-state">
          <strong>아직 공개된 프로젝트가 없습니다.</strong>
          <span>첫 프로젝트를 등록하면 평가 Run이 자동으로 생성됩니다.</span>
        </div>
      )}

      <section className="bouquet-grid" aria-label="Projects">
        {projects.map((project) => {
          const submission = project.latestSubmission
          return (
            <article className="bouquet-card" key={project.id}>
              <div className="bouquet-card-topline">
                <span className="bouquet-team">팀 {project.teamName}</span>
                <span className={`bouquet-status bouquet-status-${(submission?.evaluationStatus ?? 'none').toLowerCase()}`}>
                  {statusLabel(submission?.evaluationStatus ?? null)}
                </span>
              </div>

              <div className="bouquet-card-heading">
                <div>
                  <h2>{project.name}</h2>
                  <p>{project.description}</p>
                </div>
                <div className="bouquet-score" aria-label="Latest score">
                  <strong>{submission?.overallScore ?? '—'}</strong>
                  <span>/ 100</span>
                </div>
              </div>

              <div className="bouquet-meta">
                <span>{stars(submission?.overallStars ?? null)}</span>
                <span>{submission ? `v${submission.version}` : '버전 없음'}</span>
                {submission?.requiresAuth && <span className="bouquet-auth-chip">꽃다발 인증</span>}
              </div>

              <div className="bouquet-card-actions">
                {submission?.demoUrl && (
                  <a href={submission.demoUrl}>프로젝트 열기 →</a>
                )}
                {submission?.evaluationRunId && (
                  <button type="button" disabled={reportLoading} onClick={() => openReport(submission.evaluationRunId!)}>
                    평가 보고서
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </section>

      {report && (
        <div className="bouquet-report-backdrop" role="presentation" onMouseDown={() => setReport(null)}>
          <section
            className="bouquet-report"
            role="dialog"
            aria-modal="true"
            aria-label="BloomBouquet evaluation report"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="bouquet-report-header">
              <div>
                <p className="bouquet-eyebrow">EVALUATION RUN #{report.runId}</p>
                <h2>Senior Agent Evaluation Report</h2>
              </div>
              <button className="bouquet-close" type="button" onClick={() => setReport(null)} aria-label="Close report">×</button>
            </div>

            <div className="bouquet-report-summary">
              <div><strong>{report.overallScore ?? '—'}</strong><span>Overall / 100</span></div>
              <div><strong>{stars(report.overallStars)}</strong><span>Overall Rating</span></div>
              <div><strong>{statusLabel(report.status)}</strong><span>Run Status</span></div>
            </div>

            {report.reportSummary && (
              <section className="bouquet-process-summary">
                <h3>Process Evaluator</h3>
                <p>{report.reportSummary}</p>
              </section>
            )}

            <div className="bouquet-agent-list">
              {report.agentEvaluations.map((evaluation) => (
                <article className="bouquet-agent-review" key={evaluation.agentRole}>
                  <div className="bouquet-agent-heading">
                    <div>
                      <span>{ROLE_LABELS[evaluation.agentRole] ?? evaluation.agentRole}</span>
                      <strong>{evaluation.score} / 100 · {stars(evaluation.stars)}</strong>
                    </div>
                    <span className={`bouquet-severity bouquet-severity-${evaluation.severity.toLowerCase()}`}>
                      {evaluation.severity.toUpperCase()} · {evaluation.priority.toUpperCase()}
                    </span>
                  </div>

                  {evaluation.technicalTerms.length > 0 && (
                    <div className="bouquet-terms">
                      {evaluation.technicalTerms.map((term) => <span key={term}>{term}</span>)}
                    </div>
                  )}

                  <div className="bouquet-review-section">
                    <h4>Assessment</h4>
                    <p>{evaluation.assessment}</p>
                  </div>
                  <div className="bouquet-review-section">
                    <h4>Evidence</h4>
                    <ul>{evaluation.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                  <div className="bouquet-review-grid">
                    <div><h4>Impact</h4><p>{evaluation.impact}</p></div>
                    <div><h4>Recommendation</h4><p>{evaluation.recommendation}</p></div>
                  </div>
                  <p className="bouquet-confidence">Confidence: {evaluation.confidence}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
