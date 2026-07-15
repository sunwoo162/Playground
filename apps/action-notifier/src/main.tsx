import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

type Watch = {
  id: number
  owner: string
  repo: string
  fullName: string
  lastRunId?: number
  lastRunName?: string
  lastRunStatus?: string
  lastRunConclusion?: string
  lastRunUrl?: string
  updatedAt?: string
}

type Run = {
  id: number
  name: string
  status: string
  conclusion: string
  branch: string
  htmlUrl: string
  createdAt: string
  updatedAt: string
}

const APP_PATH = '/apps/action-notifier/'

function App() {
  const [repoInput, setRepoInput] = useState('')
  const [watches, setWatches] = useState<Watch[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [status, setStatus] = useState('')
  const [pushEnabled, setPushEnabled] = useState(false)
  const selected = useMemo(() => watches.find((watch) => watch.id === selectedId) || watches[0], [watches, selectedId])

  useEffect(() => {
    loadWatches()
    registerServiceWorker()
    navigator.serviceWorker?.addEventListener('message', handleWorkerMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', handleWorkerMessage)
  }, [])

  useEffect(() => {
    if (selected) loadRuns(selected.id)
  }, [selected?.id])

  async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    })
    if (response.status === 401) {
      location.href = `/auth/github?returnTo=${encodeURIComponent(APP_PATH)}`
      throw new Error('login_required')
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.error || '요청에 실패했어요.')
    }
    return data
  }

  async function loadWatches() {
    try {
      const data = await request<Watch[]>('/api/action-notifier/repos')
      setWatches(data)
      if (!selectedId && data.length > 0) setSelectedId(data[0].id)
      setStatus(data.length > 0 ? '연결된 레포를 확인했어요.' : '레포를 연결하고 알림을 켜주세요.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '레포 목록을 불러오지 못했어요.')
    }
  }

  async function loadRuns(watchId: number) {
    try {
      const data = await request<{ runs: Run[] }>(`/api/action-notifier/repos/${watchId}/runs`)
      setRuns(data.runs)
    } catch {
      setRuns([])
    }
  }

  async function connectRepo(event: React.FormEvent) {
    event.preventDefault()
    const repository = repoInput.trim()
    if (!repository) return
    try {
      const watch = await request<Watch>('/api/action-notifier/repos', {
        method: 'POST',
        body: JSON.stringify({ repository }),
      })
      setRepoInput('')
      await loadWatches()
      setSelectedId(watch.id)
      setStatus(`${watch.fullName} 연결 완료`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '레포 연결에 실패했어요.')
    }
  }

  async function deleteRepo(id: number) {
    await request(`/api/action-notifier/repos/${id}`, { method: 'DELETE' })
    setSelectedId(null)
    await loadWatches()
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('이 브라우저는 백그라운드 알림을 지원하지 않아요.')
      return
    }
    await navigator.serviceWorker.register(`${APP_PATH}sw.js`)
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    setPushEnabled(Boolean(existing))
  }

  async function enablePush() {
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('브라우저 알림 권한을 허용해야 합니다.')
        return
      }
      const keyResponse = await fetch('/push/vapid-public-key', { credentials: 'include' })
      const { publicKey } = await keyResponse.json()
      if (!publicKey) {
        setStatus('서버 VAPID 공개키가 설정되지 않았어요.')
        return
      }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      await request('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription),
      })
      setPushEnabled(true)
      setStatus('알림이 켜졌어요. 웹을 닫아도 브라우저가 실행 중이면 알림이 옵니다.')
      playBeep()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '알림 설정에 실패했어요.')
    }
  }

  function handleWorkerMessage(event: MessageEvent) {
    if (event.data?.type === 'ACTION_PUSH') {
      playBeep()
      loadWatches()
    }
  }

  function playBeep() {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.38)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="back-link" href="/">← 놀이터</a>
        <div>
          <h1>⚙️ Action 알리미</h1>
          <p>레포지토리를 연결하면 GitHub Actions 완료 시 알림을 보냅니다.</p>
        </div>
        <button className={pushEnabled ? 'btn muted' : 'btn primary'} onClick={enablePush}>
          {pushEnabled ? '알림 켜짐' : '알림 켜기'}
        </button>
      </header>

      <main className="main-grid">
        <section className="panel">
          <form className="repo-form" onSubmit={connectRepo}>
            <label htmlFor="repo">레포지토리 연결</label>
            <div className="repo-input-row">
              <input
                id="repo"
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                placeholder="owner/repo 또는 GitHub URL"
              />
              <button className="btn primary" type="submit">연결</button>
            </div>
          </form>

          <div className="watch-list">
            {watches.length === 0 ? (
              <p className="empty">아직 연결된 레포가 없습니다.</p>
            ) : watches.map((watch) => (
              <button
                key={watch.id}
                className={`watch-item ${selected?.id === watch.id ? 'active' : ''}`}
                onClick={() => setSelectedId(watch.id)}
              >
                <span>{watch.fullName}</span>
                <small>{statusLabel(watch.lastRunStatus, watch.lastRunConclusion)}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="panel detail-panel">
          {selected ? (
            <>
              <div className="detail-header">
                <div>
                  <h2>{selected.fullName}</h2>
                  <p>{selected.lastRunName || '최근 workflow 확인 중'}</p>
                </div>
                <div className="actions">
                  {selected.lastRunUrl && <a className="btn muted" href={selected.lastRunUrl} target="_blank">GitHub</a>}
                  <button className="btn danger" onClick={() => deleteRepo(selected.id)}>삭제</button>
                </div>
              </div>
              <div className="status-card">
                <strong>{statusLabel(selected.lastRunStatus, selected.lastRunConclusion)}</strong>
                <span>{selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : '아직 기록 없음'}</span>
              </div>
              <h3>최근 실행</h3>
              <div className="run-list">
                {runs.length === 0 ? <p className="empty">최근 실행 기록을 불러오지 못했어요.</p> : runs.map((run) => (
                  <a key={run.id} className="run-row" href={run.htmlUrl} target="_blank">
                    <span>{run.name}</span>
                    <strong className={run.conclusion || run.status}>{statusLabel(run.status, run.conclusion)}</strong>
                    <small>{run.branch} · {formatDate(run.updatedAt)}</small>
                  </a>
                ))}
              </div>
            </>
          ) : (
            <p className="empty">왼쪽에서 레포를 연결하세요.</p>
          )}
        </section>
      </main>

      {status && <div className="toast">{status}</div>}
    </div>
  )
}

function statusLabel(status?: string, conclusion?: string) {
  if (status === 'completed') {
    if (conclusion === 'success') return '성공'
    if (conclusion === 'failure') return '실패'
    if (conclusion === 'cancelled') return '취소'
    return conclusion || '완료'
  }
  if (status === 'in_progress') return '실행 중'
  if (status === 'queued') return '대기 중'
  return status || '확인 전'
}

function formatDate(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleString()
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

createRoot(document.getElementById('root')!).render(<App />)
