import { EmptyState, StatusBadge } from './BouquetUI'

type Identity = {
  projectId: string
  taskId: string
  runId: string
  agentId: string | null
}

type TimelineEvent = {
  eventId: string
  seq: number
  type: string
  state: string
  at: string
  summary: string
  evidenceIds: string[]
}

type Evidence = {
  id: string
  kind: string
  summary: string
}

type Artifact = {
  id: string
  kind: string
  summary: string
  reference: string
  at: string
}
type Decision = {
  id: string
  problem: string | null
  observations: string[]
  options: string[]
  decision: string
  reason: string
  outcome: string | null
  evidenceIds: string[]
  at: string
}

type Recovery = {
  id: string
  failureId: string
  action: string
  reason: string
  status: string
  result: string | null
  at: string
}

type Failure = {
  id: string
  failureType: string
  severity: string
  summary: string
  cause: string | null
  evidenceIds: string[]
  at: string
  recoveries: Recovery[]
}
type RunResult = {
  status: string
  summary: string
  startedAt: string
  completedAt: string
}

export type RunHistoryProjection = {
  version: 1
  identity: Identity
  state: string | null
  status: string | null
  startedAt: string | null
  completedAt: string | null
  timeline: TimelineEvent[]
  decisions: Decision[]
  failures: Failure[]
  evidence: Evidence[]
  artifacts: Artifact[]
  runResult: RunResult | null
}

export type DevelopmentHistoryResponse = {
  id: number
  harnessRunId: string
  projection: RunHistoryProjection
  createdAt: string | null
  updatedAt: string | null
}

type Props = {
  runs: DevelopmentHistoryResponse[]
  loading: boolean
  error: string | null
}
function formatDateTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

function stateLabel(state: string | null) {
  switch (state) {
    case 'COMPLETE': return '완료'
    case 'FAILED': return '실패'
    case 'BLOCKED': return '차단됨'
    case 'RECOVERING': return '복구 중'
    case 'RUNNING': return '진행 중'
    case 'TESTING': return '테스트 중'
    case 'REVIEWING': return '리뷰 중'
    case 'DEPLOYING': return '배포 중'
    case 'CANCELLED': return '취소됨'
    case 'PLANNING': return '계획 중'
    case 'QUEUED': return '대기 중'
    default: return state ?? '기록 중'
  }
}

function artifactLabel(kind: string) {
  switch (kind) {
    case 'pull-request': return 'PR'
    case 'commit': return 'Commit'
    case 'deployment': return 'Deploy'
    case 'build': return 'Build'
    case 'report': return 'Report'
    default: return kind
  }
}
export default function BouquetDevelopmentHistory({ runs, loading, error }: Props) {
  if (loading) {
    return <div className="bouquet-development-skeleton"><div className="bouquet-skeleton" /></div>
  }

  if (error) {
    return (
      <EmptyState
        eyebrow="DEVELOPMENT HISTORY"
        title="개발 과정을 불러오지 못했습니다."
        description={error}
      />
    )
  }

  if (runs.length === 0) {
    return (
      <EmptyState
        eyebrow="NO HARNESS HISTORY"
        title="아직 연결된 개발 기록이 없습니다."
        description="Harness Run이 프로젝트에 연결되면 작업 이유, 실패, 복구, 검증 과정이 이곳에 나타납니다."
      />
    )
  }

  const taskGroups = new Map<string, DevelopmentHistoryResponse[]>()
  for (const run of runs) {
    const taskId = run.projection.identity.taskId
    const group = taskGroups.get(taskId) ?? []
    group.push(run)
    taskGroups.set(taskId, group)
  }

  return (
    <section className="bouquet-development-history" aria-label="프로젝트 개발 과정">
      <section className="bouquet-development-tree" aria-label="Harness 작업 트리">
        <p className="bouquet-section-label">Work Tree</p>
        {[...taskGroups.entries()].map(([taskId, taskRuns]) => (
          <article className="bouquet-development-task-node" key={taskId}>
            <div className="bouquet-development-task-title">
              <span>Task</span>
              <strong>{taskId}</strong>
            </div>
            <div className="bouquet-development-run-branches">
              {taskRuns.map(({ harnessRunId, projection }) => (
                <div className="bouquet-development-run-node" key={harnessRunId}>
                  <div className="bouquet-development-run-node-line">
                    <span>{harnessRunId}</span>
                    <strong>{stateLabel(projection.state)}</strong>
                  </div>
                  {projection.failures.map((failure) => (
                    <div className="bouquet-development-failure-branch" key={failure.id}>
                      <span>⚠ {failure.summary}</span>
                      {failure.recoveries.map((recovery) => (
                        <small key={recovery.id}>↳ {recovery.action} · {recovery.status}</small>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      {runs.map(({ harnessRunId, projection }) => (
        <article className="bouquet-development-run" key={harnessRunId}>
          <header className="bouquet-development-run-head">
            <div>
              <p className="bouquet-section-label">RUN {harnessRunId}</p>
              <h2>{projection.identity.taskId}</h2>
              <p>{projection.runResult?.summary ?? '진행 중인 Harness Run입니다.'}</p>
            </div>
            <div className="bouquet-development-run-state">
              <StatusBadge status={projection.state}>{stateLabel(projection.state)}</StatusBadge>
              <span>{formatDateTime(projection.startedAt)} → {formatDateTime(projection.completedAt)}</span>
            </div>
          </header>
          <div className="bouquet-development-grid">
            <div className="bouquet-development-timeline">
              <p className="bouquet-section-label">Timeline</p>
              {projection.timeline.map((event) => (
                <div className="bouquet-development-event" key={event.eventId}>
                  <span className="bouquet-development-seq">{String(event.seq).padStart(2, '0')}</span>
                  <div>
                    <div className="bouquet-development-event-topline">
                      <strong>{event.summary}</strong>
                      <span>{formatDateTime(event.at)}</span>
                    </div>
                    <small>{stateLabel(event.state)} · {event.type}</small>
                  </div>
                </div>
              ))}
            </div>

            <div className="bouquet-development-notes">
              <p className="bouquet-section-label">Why & Decisions</p>
              {projection.decisions.length === 0 ? (
                <p className="bouquet-development-muted">기록된 기술 결정이 없습니다.</p>
              ) : projection.decisions.map((decision) => (
                <article className="bouquet-development-decision" key={decision.id}>
                  <span>{formatDateTime(decision.at)}</span>
                  <h3>{decision.decision}</h3>
                  {decision.problem && <p><b>문제</b>{decision.problem}</p>}
                  <p><b>이유</b>{decision.reason}</p>
                  {decision.options.length > 0 && (
                    <p><b>검토안</b>{decision.options.join(' · ')}</p>
                  )}
                  {decision.outcome && <p><b>결과</b>{decision.outcome}</p>}
                </article>
              ))}
            </div>
          </div>
          {(projection.failures.length > 0 || projection.artifacts.length > 0 || projection.evidence.length > 0) && (
            <div className="bouquet-development-supporting">
              {projection.failures.length > 0 && (
                <section>
                  <p className="bouquet-section-label">Failures & Recovery</p>
                  <div className="bouquet-development-failures">
                    {projection.failures.map((failure) => (
                      <article key={failure.id}>
                        <span>{failure.severity.toUpperCase()} · {formatDateTime(failure.at)}</span>
                        <h3>{failure.summary}</h3>
                        {failure.cause && <p>{failure.cause}</p>}
                        {failure.recoveries.map((recovery) => (
                          <div className="bouquet-development-recovery" key={recovery.id}>
                            <strong>↳ {recovery.action}</strong>
                            <span>{recovery.reason}</span>
                            {recovery.result && <small>{recovery.result}</small>}
                          </div>
                        ))}
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {projection.artifacts.length > 0 && (
                <section>
                  <p className="bouquet-section-label">Artifacts</p>
                  <div className="bouquet-development-artifacts">
                    {projection.artifacts.map((artifact) => (
                      <a href={artifact.reference} key={artifact.id} target="_blank" rel="noreferrer">
                        <span>{artifactLabel(artifact.kind)}</span>
                        <strong>{artifact.summary}</strong>
                      </a>
                    ))}
                  </div>
                </section>
              )}
              {projection.evidence.length > 0 && (
                <section>
                  <p className="bouquet-section-label">Evidence</p>
                  <div className="bouquet-development-evidence">
                    {projection.evidence.map((evidence) => (
                      <div key={evidence.id}>
                        <span>{evidence.kind}</span>
                        <strong>{evidence.summary}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  )
}
