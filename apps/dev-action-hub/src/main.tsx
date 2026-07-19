import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const APP_PATH = '/apps/dev-action-hub/'
const DISCORD_KEY = 'dev-action-hub-discord'
const SENT_RUN_KEY = 'dev-action-hub-sent-runs'
const TROUBLE_KEY = 'dev-action-hub-trouble'

type Watch = {
  id: number
  fullName: string
  actionsUrl: string
  enabled: boolean
  lastRunName?: string
  lastRunStatus?: string
  lastRunConclusion?: string
  lastRunUrl?: string
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

type FeatureSpec = {
  title: string
  description: string
  priority: string
  status: string
}

type ApiSpec = {
  method: string
  endpoint: string
  description: string
}

type Project = {
  id: number
  title: string
  description: string
  overview: string
  spec: FeatureSpec[]
  api: ApiSpec[]
  users: { persona: string; goal: string; painPoint: string }[]
}

type DiscordSettings = {
  webhookUrl: string
  enabled: boolean
  success: boolean
  failure: boolean
}

type DevServer = {
  id: number
  name: string
  slug: string
  githubOrg: string
  description: string
  ownerLogin: string
  createdAt: string
}

type ChatMessage = {
  id: number
  serverId: number
  authorLogin: string
  content: string
  createdAt: string
}

const emptyFeature: FeatureSpec = { title: '', description: '', priority: '중간', status: '진행 전' }
const emptyApi: ApiSpec = { method: 'GET', endpoint: '', description: '' }
const defaultDiscord: DiscordSettings = { webhookUrl: '', enabled: false, success: true, failure: true }

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function App() {
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState('개발 문서와 액션 상태를 불러오는 중...')
  const [repoInput, setRepoInput] = useState('')
  const [watches, setWatches] = useState<Watch[]>([])
  const [selectedWatchId, setSelectedWatchId] = useState<number | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Project | null>(null)
  const [troubleshooting, setTroubleshooting] = useState('')
  const [discord, setDiscord] = useState<DiscordSettings>(() => readJson(DISCORD_KEY, defaultDiscord))
  const [sentRuns, setSentRuns] = useState<Record<string, boolean>>(() => readJson(SENT_RUN_KEY, {}))
  const [servers, setServers] = useState<DevServer[]>([])
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null)
  const [serverName, setServerName] = useState('')
  const [serverDescription, setServerDescription] = useState('')
  const [serverOrgInput, setServerOrgInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatText, setChatText] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatSending, setChatSending] = useState(false)

  const selectedWatch = useMemo(
    () => watches.find((watch) => watch.id === selectedWatchId) || watches[0],
    [watches, selectedWatchId],
  )
  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId) || servers[0],
    [servers, selectedServerId],
  )
  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    if (selectedWatch) loadRuns(selectedWatch.id)
  }, [selectedWatch?.id])

  useEffect(() => {
    const project = projects.find((item) => item.id === selectedProjectId) || projects[0]
    setDraft(project ? cloneProject(project) : null)
    setTroubleshooting(project ? localStorage.getItem(`${TROUBLE_KEY}-${project.id}`) || '' : '')
  }, [projects, selectedProjectId])

  useEffect(() => {
    localStorage.setItem(DISCORD_KEY, JSON.stringify(discord))
  }, [discord])

  useEffect(() => {
    localStorage.setItem(SENT_RUN_KEY, JSON.stringify(sentRuns))
  }, [sentRuns])

  useEffect(() => {
    setServerOrgInput(selectedServer?.githubOrg || selectedServer?.slug || '')
  }, [selectedServer?.id, selectedServer?.githubOrg, selectedServer?.slug])

  useEffect(() => {
    if (!selectedServer?.id) {
      setChatMessages([])
      return
    }
    loadMessages(selectedServer.id)
    const timer = window.setInterval(() => loadMessages(selectedServer.id, true), 3000)
    return () => window.clearInterval(timer)
  }, [selectedServer?.id])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chatMessages.length, selectedServer?.id])

  useEffect(() => {
    const latest = runs.find((run) => run.status === 'completed')
    if (!latest || !selectedWatch || !discord.enabled || !discord.webhookUrl.trim()) return
    const shouldNotify =
      latest.conclusion === 'success' ? discord.success : ['failure', 'cancelled', 'timed_out'].includes(latest.conclusion) && discord.failure
    const key = `${selectedWatch.id}:${latest.id}:${latest.conclusion}`
    if (!shouldNotify || sentRuns[key]) return
    sendDiscordRun(latest, selectedWatch)
      .then(() => setSentRuns((items) => ({ ...items, [key]: true })))
      .catch((error) => setStatus(error instanceof Error ? error.message : 'Discord 알림 전송 실패'))
  }, [runs, selectedWatch?.id, discord])

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
    if (!response.ok) throw new Error(data.error || data.message || '요청에 실패했어요.')
    return data
  }

  async function loadAll() {
    await Promise.all([loadWatches(), loadProjects(), loadServers()])
  }

  async function loadWatches() {
    try {
      const data = await request<Watch[]>('/api/action-notifier/repos')
      setWatches(data)
      if (!selectedWatchId && data.length > 0) setSelectedWatchId(data[0].id)
      setStatus(data.length ? '연결된 레포와 개발 문서를 확인했어요.' : '레포를 연결해 Actions와 Discord 알림을 묶어보세요.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '레포 정보를 불러오지 못했어요.')
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

  async function loadProjects() {
    try {
      const data = await request<Project[]>('/api/dev-notes/projects')
      setProjects(data)
      if (!selectedProjectId && data.length > 0) setSelectedProjectId(data[0].id)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '개발자 노트를 불러오지 못했어요.')
    }
  }

  async function loadServers() {
    try {
      const data = await request<DevServer[]>('/api/dev-hub/servers')
      setServers(data)
      setSelectedServerId((current) => (current && data.some((server) => server.id === current) ? current : data[0]?.id || null))
      if (data.length === 0) setChatMessages([])
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '개발 서버를 불러오지 못했어요.')
    }
  }

  async function loadMessages(serverId: number, silent = false) {
    if (!silent) setChatLoading(true)
    try {
      const data = await request<ChatMessage[]>(`/api/dev-hub/servers/${serverId}/messages`)
      setChatMessages(data)
    } catch (error) {
      if (!silent) setStatus(error instanceof Error ? error.message : '채팅을 불러오지 못했어요.')
    } finally {
      if (!silent) setChatLoading(false)
    }
  }

  async function connectRepo(event: React.FormEvent) {
    event.preventDefault()
    const repository = repoInput.trim()
    if (!repository) return
    const watch = await request<Watch>('/api/action-notifier/repos', {
      method: 'POST',
      body: JSON.stringify({ repository }),
    })
    setRepoInput('')
    setSelectedWatchId(watch.id)
    await loadWatches()
  }

  async function toggleWatch(watch: Watch) {
    const updated = await request<Watch>(`/api/action-notifier/repos/${watch.id}/notification`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !watch.enabled }),
    })
    setWatches((items) => items.map((item) => (item.id === updated.id ? updated : item)))
  }

  async function createProject() {
    const created = await request<Project>('/api/dev-notes/projects', {
      method: 'POST',
      body: JSON.stringify({ title: '새 개발 문서', description: 'GitHub Actions와 함께 관리할 개발 문서' }),
    })
    setProjects((items) => [created, ...items])
    setSelectedProjectId(created.id)
  }

  async function saveProject() {
    if (!draft) return
    const saved = await request<Project>(`/api/dev-notes/projects/${draft.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: draft.title,
        description: draft.description,
        overview: draft.overview,
        spec: draft.spec.filter((item) => item.title.trim() || item.description.trim()),
        api: draft.api.filter((item) => item.endpoint.trim() || item.description.trim()),
        users: draft.users,
      }),
    })
    localStorage.setItem(`${TROUBLE_KEY}-${draft.id}`, troubleshooting)
    setProjects((items) => items.map((item) => (item.id === saved.id ? saved : item)))
    setStatus('개발 문서를 저장했어요.')
  }

  async function sendDiscordRun(run: Run, watch: Watch) {
    const ok = run.conclusion === 'success'
    await sendDiscord({
      title: ok ? 'GitHub Actions 성공' : 'GitHub Actions 실패',
      description: `${watch.fullName} / ${run.name}`,
      color: ok ? 5763719 : 15548997,
      fields: [
        { name: '브랜치', value: run.branch || '-', inline: true },
        { name: '결과', value: run.conclusion || run.status, inline: true },
        { name: 'Actions', value: run.htmlUrl || watch.actionsUrl, inline: false },
      ],
    })
  }

  async function sendDiscord(payload: { title: string; description: string; color: number; fields?: unknown[] }) {
    const webhookUrl = discord.webhookUrl.trim()
    if (!webhookUrl) throw new Error('Discord 웹훅 URL을 입력해야 합니다.')
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Playground Dev Action Hub',
        embeds: [payload],
      }),
    })
    if (!response.ok) throw new Error('Discord 웹훅 전송에 실패했어요.')
  }

  async function testDiscord() {
    await sendDiscord({
      title: 'Discord 연동 테스트',
      description: '개발 액션 허브에서 보낸 테스트 메시지입니다.',
      color: 3447003,
    })
    setStatus('Discord 테스트 메시지를 보냈어요.')
  }

  async function createDevServer(event: React.FormEvent) {
    event.preventDefault()
    const name = serverName.trim()
    if (!name) return
    const server = await request<DevServer>('/api/dev-hub/servers', {
      method: 'POST',
      body: JSON.stringify({ name, description: serverDescription.trim() }),
    })
    setServers((items) => [server, ...items])
    setSelectedServerId(server.id)
    setServerName('')
    setServerDescription('')
    setStatus('서버를 만들었어요. GitHub Organization은 GitHub에서 직접 생성한 뒤 연결해야 합니다.')
  }

  async function saveServerOrg() {
    if (!selectedServer) return
    const updated = await request<DevServer>(`/api/dev-hub/servers/${selectedServer.id}/github-org`, {
      method: 'PATCH',
      body: JSON.stringify({ githubOrg: serverOrgInput.trim() }),
    })
    setServers((items) => items.map((server) => (server.id === updated.id ? updated : server)))
    setStatus('GitHub Organization 연결 이름을 저장했어요.')
  }

  async function sendChat(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedServer || !chatText.trim() || chatSending) return
    const content = chatText.trim()
    setChatSending(true)
    try {
      const message = await request<ChatMessage>(`/api/dev-hub/servers/${selectedServer.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      setChatMessages((items) => [...items.filter((item) => item.id !== message.id), message])
      setChatText('')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '메시지 전송에 실패했어요.')
    } finally {
      setChatSending(false)
    }
  }

  function updateDraft<K extends keyof Project>(key: K, value: Project[K]) {
    setDraft((item) => (item ? { ...item, [key]: value } : item))
  }

  function updateFeature(index: number, patch: Partial<FeatureSpec>) {
    if (!draft) return
    const spec = draft.spec.length ? [...draft.spec] : [emptyFeature]
    spec[index] = { ...spec[index], ...patch }
    updateDraft('spec', spec)
  }

  function updateApi(index: number, patch: Partial<ApiSpec>) {
    if (!draft) return
    const api = draft.api.length ? [...draft.api] : [emptyApi]
    api[index] = { ...api[index], ...patch }
    updateDraft('api', api)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="back-link" href="/">← 놀이터</a>
        <div className="title-block">
          <h1>개발 액션 허브</h1>
          <p>개발 서버, 문서, GitHub Actions, Discord 알림을 한 화면에서 관리</p>
        </div>
        <a className="ghost-btn" href={selectedWatch?.actionsUrl || 'https://github.com'} target="_blank" rel="noreferrer">
          GitHub Actions
        </a>
      </header>

      <main className="main">
        <section className="status-bar">{status}</section>

        <section className="grid">
          <aside className="side-panel">
            <div className="panel-head">
              <h2>개발 서버</h2>
              <span>{servers.length}개</span>
            </div>
            <form className="server-form" onSubmit={createDevServer}>
              <input value={serverName} onChange={(event) => setServerName(event.target.value)} placeholder="서버 이름" />
              <input value={serverDescription} onChange={(event) => setServerDescription(event.target.value)} placeholder="설명" />
              <button className="primary-btn">서버 만들기</button>
            </form>
            <div className="list">
              {servers.map((server) => (
                <button
                  key={server.id}
                  className={`list-item ${server.id === selectedServer?.id ? 'active' : ''}`}
                  onClick={() => setSelectedServerId(server.id)}
                >
                  <strong>{server.name}</strong>
                  <span>{server.githubOrg ? `@${server.githubOrg}` : 'GitHub org 미연결'}</span>
                </button>
              ))}
              {servers.length === 0 && <div className="empty small">Discord 서버처럼 묶을 공간을 먼저 만드세요.</div>}
            </div>

            <div className="panel-head">
              <h2>레포</h2>
              <span>{watches.length}개</span>
            </div>
            <form className="connect-form" onSubmit={connectRepo}>
              <input value={repoInput} onChange={(event) => setRepoInput(event.target.value)} placeholder="owner/repo" />
              <button>연결</button>
            </form>
            <div className="list">
              {watches.map((watch) => (
                <button
                  key={watch.id}
                  className={`list-item ${watch.id === selectedWatch?.id ? 'active' : ''}`}
                  onClick={() => setSelectedWatchId(watch.id)}
                >
                  <strong>{watch.fullName}</strong>
                  <span>{watch.lastRunConclusion || watch.lastRunStatus || '대기 중'}</span>
                </button>
              ))}
            </div>

            <div className="panel-head mt">
              <h2>개발 문서</h2>
              <button className="small-btn" onClick={createProject}>+ 문서</button>
            </div>
            <div className="list">
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={`list-item ${project.id === draft?.id ? 'active' : ''}`}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <strong>{project.title}</strong>
                  <span>{project.description || '설명 없음'}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="work-panel">
            {selectedServer && (
              <div className="org-card">
                <div>
                  <span className="eyebrow">GitHub Organization 연결</span>
                  <h2>{selectedServer.name}</h2>
                  <p>
                    GitHub은 외부 앱의 Organization 자동 생성을 지원하지 않습니다.
                    아래 이름으로 GitHub에서 직접 생성한 뒤 이 서버에 연결하세요.
                  </p>
                </div>
                <div className="org-row">
                  <input value={serverOrgInput} onChange={(event) => setServerOrgInput(event.target.value)} placeholder="github-org-name" />
                  <button className="ghost-btn" type="button" onClick={saveServerOrg}>연결 저장</button>
                  <a className="ghost-btn" href="https://github.com/organizations/plan" target="_blank" rel="noreferrer">Organization 만들기</a>
                  <a className="ghost-btn" href={`https://github.com/${serverOrgInput || selectedServer.githubOrg || selectedServer.slug}`} target="_blank" rel="noreferrer">연결 확인</a>
                </div>
              </div>
            )}

            <div className="panel-head">
              <h2>{draft?.title || '개발 문서'}</h2>
              <button className="primary-btn" onClick={saveProject} disabled={!draft}>저장</button>
            </div>
            {draft ? (
              <div className="editor-stack">
                <input className="title-input" value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} />
                <textarea value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} placeholder="문서 설명" />
                <textarea value={draft.overview || ''} onChange={(event) => updateDraft('overview', event.target.value)} placeholder="개요" />
                <textarea value={troubleshooting} onChange={(event) => setTroubleshooting(event.target.value)} placeholder="트러블슈팅 메모" />

                <div className="table-block">
                  <div className="table-title">
                    <h3>기능 명세</h3>
                    <button onClick={() => updateDraft('spec', [...(draft.spec || []), emptyFeature])}>+ 추가</button>
                  </div>
                  {(draft.spec.length ? draft.spec : [emptyFeature]).map((item, index) => (
                    <div className="spec-row" key={index}>
                      <input value={item.title} onChange={(event) => updateFeature(index, { title: event.target.value })} placeholder="기능명" />
                      <select value={item.priority} onChange={(event) => updateFeature(index, { priority: event.target.value })}>
                        <option>높음</option>
                        <option>중간</option>
                        <option>낮음</option>
                      </select>
                      <select value={item.status} onChange={(event) => updateFeature(index, { status: event.target.value })}>
                        <option>진행 전</option>
                        <option>진행 중</option>
                        <option>완료</option>
                      </select>
                      <input value={item.description} onChange={(event) => updateFeature(index, { description: event.target.value })} placeholder="설명" />
                    </div>
                  ))}
                </div>

                <div className="table-block">
                  <div className="table-title">
                    <h3>API 명세</h3>
                    <button onClick={() => updateDraft('api', [...(draft.api || []), emptyApi])}>+ 추가</button>
                  </div>
                  {(draft.api.length ? draft.api : [emptyApi]).map((item, index) => (
                    <div className="api-row" key={index}>
                      <select value={item.method} onChange={(event) => updateApi(index, { method: event.target.value })}>
                        <option>GET</option>
                        <option>POST</option>
                        <option>PUT</option>
                        <option>PATCH</option>
                        <option>DELETE</option>
                      </select>
                      <input value={item.endpoint} onChange={(event) => updateApi(index, { endpoint: event.target.value })} placeholder="/api/..." />
                      <input value={item.description} onChange={(event) => updateApi(index, { description: event.target.value })} placeholder="설명" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty">개발 문서를 선택하거나 새로 만드세요.</div>
            )}
          </section>

          <aside className="side-panel">
            <div className="panel-head">
              <h2>Actions</h2>
              {selectedWatch && <button className="small-btn" onClick={() => toggleWatch(selectedWatch)}>{selectedWatch.enabled ? '알림 끄기' : '알림 켜기'}</button>}
            </div>
            <div className="run-list">
              {runs.map((run) => (
                <a className={`run-item ${run.conclusion || run.status}`} href={run.htmlUrl} target="_blank" rel="noreferrer" key={run.id}>
                  <strong>{run.name}</strong>
                  <span>{run.branch} · {run.conclusion || run.status}</span>
                </a>
              ))}
              {runs.length === 0 && <div className="empty small">최근 실행 내역이 없습니다.</div>}
            </div>

            <div className="discord-box">
              <div className="panel-head">
                <h2>Discord</h2>
                <label className="switch">
                  <input type="checkbox" checked={discord.enabled} onChange={(event) => setDiscord({ ...discord, enabled: event.target.checked })} />
                  ON
                </label>
              </div>
              <input
                type="password"
                value={discord.webhookUrl}
                onChange={(event) => setDiscord({ ...discord, webhookUrl: event.target.value })}
                placeholder="Discord webhook URL"
              />
              <label><input type="checkbox" checked={discord.success} onChange={(event) => setDiscord({ ...discord, success: event.target.checked })} /> 성공 알림</label>
              <label><input type="checkbox" checked={discord.failure} onChange={(event) => setDiscord({ ...discord, failure: event.target.checked })} /> 실패 알림</label>
              <button className="ghost-btn full" onClick={testDiscord}>테스트 전송</button>
            </div>

            <div className="chat-box">
              <div className="panel-head">
                <h2>서버 채팅</h2>
                <span>{selectedServer?.name || '서버 없음'}</span>
              </div>
              <div className="chat-list">
                {chatMessages.map((message) => (
                  <div className="chat-message" key={message.id}>
                    <div>
                      <strong>{message.authorLogin}</strong>
                      <span>{formatTime(message.createdAt)}</span>
                    </div>
                    <p>{message.content}</p>
                  </div>
                ))}
                {chatMessages.length === 0 && <div className="empty small">{chatLoading ? '메시지를 불러오는 중...' : '아직 메시지가 없습니다.'}</div>}
                <div ref={chatEndRef} />
              </div>
              <form className="chat-form" onSubmit={sendChat}>
                <input
                  value={chatText}
                  onChange={(event) => setChatText(event.target.value)}
                  placeholder={selectedServer ? '메시지 입력' : '서버를 먼저 만드세요'}
                  disabled={!selectedServer}
                />
                <button className="small-btn" disabled={!selectedServer || !chatText.trim() || chatSending}>
                  {chatSending ? '전송 중' : '전송'}
                </button>
              </form>
              <p className="hint">메시지는 서버 DB에 저장되어 같은 개발 서버 구성원이 함께 볼 수 있습니다. 초대/권한과 WebSocket 실시간 동기화는 다음 단계에서 붙이면 됩니다.</p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}

function cloneProject(project: Project): Project {
  return {
    ...project,
    spec: project.spec?.length ? project.spec.map((item) => ({ ...item })) : [emptyFeature],
    api: project.api?.length ? project.api.map((item) => ({ ...item })) : [emptyApi],
    users: project.users || [],
  }
}

createRoot(document.getElementById('root')!).render(<App />)
