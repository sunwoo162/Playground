import { useMemo } from 'react'

import type { LiveE2ESnapshotEnvelope } from '../../../bloom-runtime/ts/e2eSmoke'
import type {
  SchedulerAggregateTelemetry,
  SchedulerWaveTelemetry,
} from '../../../bloom-runtime/ts/schedulerObservability'

import './scheduler-observability.css'

type SchedulerSnapshot = {
  waves: SchedulerWaveTelemetry[]
  metrics: SchedulerAggregateTelemetry | null
  error: string | null
}

type SchedulerObservabilityPanelProps = {
  snapshot: LiveE2ESnapshotEnvelope | null
}

function readSchedulerSnapshot(snapshot: LiveE2ESnapshotEnvelope | null): SchedulerSnapshot {
  if (!snapshot) return { waves: [], metrics: null, error: null }

  try {
    const parsed = JSON.parse(snapshot.payloadJson) as {
      schedulerObservability?: {
        waves?: SchedulerWaveTelemetry[]
        metrics?: SchedulerAggregateTelemetry | null
      }
    }
    const observability = parsed.schedulerObservability
    if (!observability) return { waves: [], metrics: null, error: null }
    return {
      waves: Array.isArray(observability.waves) ? observability.waves : [],
      metrics: observability.metrics ?? null,
      error: null,
    }
  } catch {
    return {
      waves: [],
      metrics: null,
      error: 'Scheduler observability payload를 읽지 못했습니다.',
    }
  }
}

function formatDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '-'
  if (value < 1000) return `${Math.round(value)}ms`
  const seconds = value / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const minutes = seconds / 60
  if (minutes < 60) return `${minutes.toFixed(minutes < 10 ? 1 : 0)}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = Math.round(minutes % 60)
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

function formatPercent(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0%'
  return `${Math.min(100, value * 100).toFixed(value < 0.1 ? 1 : 0)}%`
}

function formatNumber(value: number, suffix = '') {
  if (!Number.isFinite(value)) return '-'
  return `${value.toFixed(Number.isInteger(value) ? 0 : 2)}${suffix}`
}

function selectionReason(reason: string) {
  switch (reason) {
    case 'unlocks-ready-tasks':
      return '후속 Task 즉시 해제'
    case 'critical-path':
      return 'Critical path 우선'
    case 'downstream-impact':
      return 'Downstream 영향 우선'
    case 'fifo-fairness':
      return 'FIFO 공정성 슬롯'
    case 'stable-fifo':
      return '안정 FIFO'
    default:
      return reason
  }
}

function waveStatusLabel(wave: SchedulerWaveTelemetry) {
  if (wave.status === 'completed') return 'DONE'
  if (wave.status === 'blocked') return 'BLOCKED'
  return 'RUNNING'
}

export default function SchedulerObservabilityPanel({ snapshot }: SchedulerObservabilityPanelProps) {
  const telemetry = useMemo(() => readSchedulerSnapshot(snapshot), [snapshot])
  const latestWave = telemetry.waves.length > 0
    ? telemetry.waves[telemetry.waves.length - 1]
    : null
  const recentWaves = useMemo(() => telemetry.waves.slice(-8).reverse(), [telemetry.waves])
  const metrics = telemetry.metrics

  const idleRatio = metrics && metrics.observedAgentActiveMs + metrics.observedAgentIdleMs > 0
    ? metrics.observedAgentIdleMs / (metrics.observedAgentActiveMs + metrics.observedAgentIdleMs)
    : 0

  return (
    <section className="bloom-scheduler-card bloom-e2e-card">
      <div className="bloom-e2e-card-heading">
        <div>
          <span>SCHEDULER</span>
          <h2>Adaptive orchestration telemetry</h2>
        </div>
        {latestWave ? (
          <span className={`bloom-scheduler-live is-${latestWave.status}`}>
            WAVE #{latestWave.sequence} · TARGET {latestWave.targetConcurrency}
          </span>
        ) : (
          <span className="bloom-scheduler-live is-empty">WAITING</span>
        )}
      </div>

      {telemetry.error ? (
        <p className="bloom-scheduler-empty is-error">{telemetry.error}</p>
      ) : !metrics || telemetry.waves.length === 0 ? (
        <p className="bloom-scheduler-empty">
          Worker가 첫 Agent wave를 시작하면 병렬도와 Critical Path telemetry가 여기에 표시됩니다.
        </p>
      ) : (
        <>
          <div className="bloom-scheduler-kpis">
            <article>
              <span>PARALLELISM</span>
              <strong>{formatNumber(metrics.parallelismFactor, '×')}</strong>
              <small>누적 Agent runtime / wall clock</small>
            </article>
            <article>
              <span>WALL CLOCK</span>
              <strong>{formatDuration(metrics.wallClockExecutionMs)}</strong>
              <small>실제 orchestration 경과시간</small>
            </article>
            <article>
              <span>CRITICAL PATH</span>
              <strong>{formatDuration(metrics.estimatedCriticalPathRuntimeMs)}</strong>
              <small>실측 Task runtime 기반 추정</small>
            </article>
            <article>
              <span>AGENT IDLE</span>
              <strong>{formatPercent(idleRatio)}</strong>
              <small>{metrics.observedAgentCount} observed Agents</small>
            </article>
            <article>
              <span>MAX WAVE</span>
              <strong>{metrics.maxObservedWaveWidth} / 6</strong>
              <small>평균 {formatNumber(metrics.averageWaveWidth)} Agents</small>
            </article>
            <article>
              <span>CAP UTILIZATION</span>
              <strong>{formatPercent(metrics.hardCapUtilization)}</strong>
              <small>6-way hard cap 기준</small>
            </article>
          </div>

          {latestWave && (
            <section className="bloom-scheduler-current">
              <div className="bloom-scheduler-current-head">
                <div>
                  <span>LATEST DECISION</span>
                  <strong>
                    Wave #{latestWave.sequence} · {latestWave.selectedTaskCount} selected · target {latestWave.targetConcurrency}
                  </strong>
                </div>
                <div className="bloom-scheduler-demand">
                  <span>ready {latestWave.readyBefore}</span>
                  <span>running {latestWave.runningBefore}</span>
                  <span>slots {latestWave.availableSlots}</span>
                  <span>{formatDuration(latestWave.durationMs ?? 0)}</span>
                </div>
              </div>

              <div className="bloom-scheduler-selected">
                {latestWave.selectedTasks.map((task) => (
                  <article key={`${latestWave.sequence}-${task.taskId}`}>
                    <div className="bloom-scheduler-task-top">
                      <strong>{task.taskId}</strong>
                      <em>{task.role}</em>
                    </div>
                    <p>{selectionReason(task.selectionReason)}</p>
                    <dl>
                      <div><dt>unlock</dt><dd>{task.priority.unlockCount}</dd></div>
                      <div><dt>critical</dt><dd>{task.priority.criticalPathLength}</dd></div>
                      <div><dt>downstream</dt><dd>{task.priority.downstreamCount}</dd></div>
                    </dl>
                    <small>{task.agentId}</small>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="bloom-scheduler-history">
            <div className="bloom-scheduler-section-title">
              <span>RECENT WAVES</span>
              <small>{metrics.completedWaveCount}/{metrics.waveCount} completed · {metrics.blockedWaveCount} blocked</small>
            </div>
            <div className="bloom-scheduler-wave-list">
              {recentWaves.map((wave) => (
                <article key={wave.sequence} className={`is-${wave.status}`}>
                  <div className="bloom-scheduler-wave-index">
                    <strong>#{wave.sequence}</strong>
                    <span>{waveStatusLabel(wave)}</span>
                  </div>
                  <div className="bloom-scheduler-wave-bar">
                    <i style={{ width: `${Math.max(8, Math.min(100, (wave.selectedTaskCount / 6) * 100))}%` }} />
                  </div>
                  <div className="bloom-scheduler-wave-meta">
                    <span>{wave.selectedTaskCount} Agents</span>
                    <span>target {wave.targetConcurrency}</span>
                    <span>{formatDuration(wave.durationMs ?? 0)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  )
}
