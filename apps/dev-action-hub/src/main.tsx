import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const LOCAL_SERVERS_KEY = 'dev-action-hub-local-servers'
const LOCAL_MESSAGES_KEY = 'dev-action-hub-local-messages'
const WATCHES_KEY = 'dev-action-hub-watches'
const DOCS_KEY = 'dev-action-hub-docs'
const DISCORD_KEY = 'dev-action-hub-discord'

type RoomTab = 'chat' | 'work' | 'docs' | 'alerts'

type DevServer = {
  id: number
  name: string
  slug: string
  githubOrg: string
  description: string
  ownerLogin: string
  createdAt: string
  localOnly?: boolean
}

type ChatMessage = {
  id: number
  serverId: number
  authorLogin: string
  content: string
  createdAt: string
  localOnly?: boolean
}

type Watch = {
  id: number
  serverId: number
  fullName: string
  actionsUrl: string
  enabled: boolean
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

type DevDoc = {
  id: number
  serverId: number
  title: string
  content: string
  updatedAt: string
}

type DiscordSettings = {
  webhookUrl: string
  enabled: boolean
  success: boolean
  failure: boolean
}

const defaultDiscord: DiscordSettings = {
  webhookUrl: '',
  enabled: false,
  success: true,
  failure: true,
}

const tabs: Array<{ id: RoomTab; label: string }> = [
  { id: 'chat', label: '채팅' },
  { id: 'work', label: 'GitHub 작업' },
  { id: 'docs', label: '개발 문서' },
  { id: 'alerts', label: '알림' },
]

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(body?.error || body?.message || `${response.status} ${response.statusText}`)
  }
  return body as T
}

function nowId() {
  return Date.now() + Math.floor(Math.random() * 1000)
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'server'
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function repoActionsUrl(repo: string) {
  return `https://github.com/${repo}/actions`
}

function normalizeServer(server: Partial<DevServer>): DevServer {
  const name = server.name || '이름 없는 서버'
  return {
    id: Number(server.id || nowId()),
    name,
    slug: server.slug || slugify(name),
    githubOrg: server.githubOrg || '',
    description: server.description || '',
    ownerLogin: server.ownerLogin || 'me',
    createdAt: server.createdAt || new Date().toISOString(),
    localOnly: server.localOnly,
  }
}

function normalizeMessage(message: Partial<ChatMessage>): ChatMessage {
  return {
    id: Number(message.id || nowId()),
    serverId: Number(message.serverId || 0),
    authorLogin: message.authorLogin || '나',
    content: message.content || '',
    createdAt: message.createdAt || new Date().toISOString(),
    localOnly: message.localOnly,
  }
}

function App() {
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState('서버 목록을 불러오는 중...')
  const [servers, setServers] = useState<DevServer[]>([])
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null)
  const [serverName, setServerName] = useState('')
  const [serverDescription, setServerDescription] = useState('')
  const [serverOrgInput, setServerOrgInput] = useState('')
  const [activeTab, setActiveTab] = useState<RoomTab>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatText, setChatText] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatSending, setChatSending] = useState(false)
  const [watches, setWatches] = useState<Watch[]>(() => readJson(WATCHES_KEY, []))
  const [selectedWatchId, setSelectedWatchId] = useState<number | null>(null)
  const [repoInput, setRepoInput] = useState('')
  const [runs, setRuns] = useState<Run[]>([])
  const [docs, setDocs] = useState<DevDoc[]>(() => readJson(DOCS_KEY, []))
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null)
  const [docTitle, setDocTitle] = useState('')
  const [docContent, setDocContent] = useState('')
  const [discord, setDiscord] = useState<DiscordSettings>(() => readJson(DISCORD_KEY, defaultDiscord))

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId) || null,
    [servers, selectedServerId],
  )
  const serverWatches = useMemo(
    () => watches.filter((watch) => watch.serverId === selectedServerId),
    [watches, selectedServerId],
  )
  const selectedWatch = useMemo(
    () => serverWatches.find((watch) => watch.id === selectedWatchId) || serverWatches[0] || null,
    [serverWatches, selectedWatchId],
  )
  const serverDocs = useMemo(
    () => docs.filter((doc) => doc.serverId === selectedServerId),
    [docs, selectedServerId],
  )

  useEffect(() => {
    loadServers()
  }, [])

  useEffect(() => {
    writeJson(WATCHES_KEY, watches)
  }, [watches])

  useEffect(() => {
    writeJson(DOCS_KEY, docs)
  }, [docs])

  useEffect(() => {
    writeJson(DISCORD_KEY, discord)
  }, [discord])

  useEffect(() => {
    setServerOrgInput(selectedServer?.githubOrg || '')
    setSelectedWatchId(null)
    setSelectedDocId(null)
    setRuns([])
  }, [selectedServer?.id])

  useEffect(() => {
    if (!selectedServer) {
      setMessages([])
      return
    }
    loadMessages(selectedServer.id)
    const timer = window.setInterval(() => loadMessages(selectedServer.id, true), 3000)
    return () => window.clearInterval(timer)
  }, [selectedServer?.id])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    if (!selectedWatch) {
      setRuns([])
      return
    }
    loadRuns(selectedWatch)
  }, [selectedWatch?.id])

  useEffect(() => {
    const doc = docs.find((item) => item.id === selectedDocId)
    setDocTitle(doc?.title || '')
    setDocContent(doc?.content || '')
  }, [selectedDocId, docs])

  async function loadServers() {
    const localServers = readJson<DevServer[]>(LOCAL_SERVERS_KEY, []).map(normalizeServer)
    try {
      const remoteServers = (await apiJson<DevServer[]>('/api/dev-hub/servers')).map(normalizeServer)
      const merged = [...remoteServers, ...localServers.filter((local) => !remoteServers.some((server) => server.id === local.id))]
      setServers(merged)
      setStatus(merged.length ? '서버를 선택하거나 새 서버를 만드세요.' : '새 서버를 만들면 채팅방이 열립니다.')
    } catch (error) {
      setServers(localServers)
      setStatus(`백엔드 연결 전까지 로컬 서버로 사용할 수 있습니다. ${error instanceof Error ? error.message : ''}`.trim())
    }
  }

  async function createServer(event: React.FormEvent) {
    event.preventDefault()
    const name = serverName.trim()
    if (!name) {
      setStatus('서버 이름을 입력하세요.')
      return
    }

    try {
      const created = normalizeServer(await apiJson<DevServer>('/api/dev-hub/servers', {
        method: 'POST',
        body: JSON.stringify({ name, description: serverDescription.trim() }),
      }))
      setServers((prev) => [created, ...prev.filter((server) => server.id !== created.id)])
      setSelectedServerId(created.id)
      setActiveTab('chat')
      setStatus(`${created.name} 서버를 만들었습니다.`)
    } catch (error) {
      const localServer = normalizeServer({
        id: nowId(),
        name,
        slug: slugify(name),
        description: serverDescription.trim(),
        localOnly: true,
      })
      const next = [localServer, ...readJson<DevServer[]>(LOCAL_SERVERS_KEY, [])]
      writeJson(LOCAL_SERVERS_KEY, next)
      setServers((prev) => [localServer, ...prev])
      setSelectedServerId(localServer.id)
      setActiveTab('chat')
      setStatus(`로컬 서버로 만들었습니다. ${error instanceof Error ? error.message : ''}`.trim())
    }
    setServerName('')
    setServerDescription('')
  }

  async function loadMessages(serverId: number, silent = false) {
    if (!silent) setChatLoading(true)
    const localMessages = readJson<ChatMessage[]>(LOCAL_MESSAGES_KEY, [])
      .map(normalizeMessage)
      .filter((message) => message.serverId === serverId)
    try {
      const remoteMessages = (await apiJson<ChatMessage[]>(`/api/dev-hub/servers/${serverId}/messages`)).map(normalizeMessage)
      const merged = [...remoteMessages, ...localMessages.filter((local) => !remoteMessages.some((remote) => remote.id === local.id))]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      setMessages(merged)
      if (!silent) setStatus('채팅을 불러왔습니다.')
    } catch (error) {
      setMessages(localMessages)
      if (!silent) setStatus(`채팅 API 연결 전까지 로컬 메시지를 사용합니다. ${error instanceof Error ? error.message : ''}`.trim())
    } finally {
      if (!silent) setChatLoading(false)
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedServer || !chatText.trim()) return
    setChatSending(true)
    const content = chatText.trim()
    setChatText('')
    try {
      const sent = normalizeMessage(await apiJson<ChatMessage>(`/api/dev-hub/servers/${selectedServer.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }))
      setMessages((prev) => [...prev, sent])
      setStatus('메시지를 보냈습니다.')
    } catch (error) {
      const localMessage = normalizeMessage({
        id: nowId(),
        serverId: selectedServer.id,
        authorLogin: '나',
        content,
        localOnly: true,
      })
      const next = [...readJson<ChatMessage[]>(LOCAL_MESSAGES_KEY, []), localMessage]
      writeJson(LOCAL_MESSAGES_KEY, next)
      setMessages((prev) => [...prev, localMessage])
      setStatus(`로컬 메시지로 저장했습니다. ${error instanceof Error ? error.message : ''}`.trim())
    } finally {
      setChatSending(false)
    }
  }

  async function saveGithubOrg(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedServer) return
    const githubOrg = serverOrgInput.trim()
    try {
      const updated = normalizeServer(await apiJson<DevServer>(`/api/dev-hub/servers/${selectedServer.id}/github-org`, {
        method: 'PATCH',
        body: JSON.stringify({ githubOrg }),
      }))
      setServers((prev) => prev.map((server) => (server.id === updated.id ? updated : server)))
      setStatus('GitHub Organization 연결 정보를 저장했습니다.')
    } catch (error) {
      setServers((prev) => {
        const next = prev.map((server) => (server.id === selectedServer.id ? { ...server, githubOrg } : server))
        writeJson(LOCAL_SERVERS_KEY, next.filter((server) => server.localOnly || server.id === selectedServer.id))
        return next
      })
      setStatus(`로컬에 GitHub Organization을 저장했습니다. ${error instanceof Error ? error.message : ''}`.trim())
    }
  }

  function connectRepo(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedServer) return
    const fullName = repoInput.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '')
    if (!/^[^/\s]+\/[^/\s]+$/.test(fullName)) {
      setStatus('레포는 owner/repo 형식으로 입력하세요.')
      return
    }
    const watch: Watch = {
      id: nowId(),
      serverId: selectedServer.id,
      fullName,
      actionsUrl: repoActionsUrl(fullName),
      enabled: true,
    }
    setWatches((prev) => [watch, ...prev.filter((item) => item.fullName !== fullName || item.serverId !== selectedServer.id)])
    setSelectedWatchId(watch.id)
    setRepoInput('')
    setStatus(`${fullName} 레포를 서버에 연결했습니다.`)
  }

  function toggleWatch(watch: Watch) {
    setWatches((prev) => prev.map((item) => (item.id === watch.id ? { ...item, enabled: !item.enabled } : item)))
  }

  function loadRuns(watch: Watch) {
    setRuns([
      {
        id: nowId(),
        name: `${watch.fullName} build-and-deploy`,
        status: 'completed',
        conclusion: 'success',
        branch: 'main',
        htmlUrl: watch.actionsUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])
  }

  function createDoc() {
    if (!selectedServer) return
    const doc: DevDoc = {
      id: nowId(),
      serverId: selectedServer.id,
      title: '새 개발 문서',
      content: '# 기능 명세서\n\n## API 명세서\n\n## 트러블 슈팅\n',
      updatedAt: new Date().toISOString(),
    }
    setDocs((prev) => [doc, ...prev])
    setSelectedDocId(doc.id)
    setStatus('서버 문서를 만들었습니다.')
  }

  function saveDoc() {
    if (!selectedServer) return
    const title = docTitle.trim() || '제목 없는 문서'
    if (selectedDocId) {
      setDocs((prev) => prev.map((doc) => (
        doc.id === selectedDocId ? { ...doc, title, content: docContent, updatedAt: new Date().toISOString() } : doc
      )))
    } else {
      const doc: DevDoc = {
        id: nowId(),
        serverId: selectedServer.id,
        title,
        content: docContent,
        updatedAt: new Date().toISOString(),
      }
      setDocs((prev) => [doc, ...prev])
      setSelectedDocId(doc.id)
    }
    setStatus('개발 문서를 저장했습니다.')
  }

  function saveDiscordSettings() {
    writeJson(DISCORD_KEY, discord)
    setStatus(discord.enabled ? 'Discord 알림 설정을 저장했습니다.' : 'Discord 알림을 껐습니다.')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="back-link" href="/">← 놀이터</a>
        <div className="title-block">
          <h1>개발 서버</h1>
          <p>
            {selectedServer
              ? `${selectedServer.name} 안에서 채팅, GitHub 작업, 개발 문서를 처리합니다.`
              : '서버를 만들고 그 안에서 채팅과 작업을 진행하세요.'}
          </p>
        </div>
        {selectedServer ? (
          <button className="ghost-btn" type="button" onClick={() => setSelectedServerId(null)}>
            서버 목록
          </button>
        ) : (
          <a className="ghost-btn" href="https://github.com" target="_blank" rel="noreferrer">
            GitHub Actions
          </a>
        )}
      </header>

      <main className="main">
        <section className="status-bar">{status}</section>

        {!selectedServer ? (
          <section className="server-home">
            <form className="create-server-card" onSubmit={createServer}>
              <span className="eyebrow">새 서버</span>
              <h2>작업 서버 만들기</h2>
              <p>디스코드 서버처럼 프로젝트별 공간을 만들고, 그 안에서 채팅부터 시작합니다.</p>
              <input value={serverName} onChange={(event) => setServerName(event.target.value)} placeholder="서버 이름" />
              <input value={serverDescription} onChange={(event) => setServerDescription(event.target.value)} placeholder="서버 설명" />
              <button className="primary-btn" type="submit">서버 만들기</button>
            </form>

            <div className="server-list-panel">
              <div className="panel-head">
                <h2>내 서버</h2>
                <span>{servers.length}개</span>
              </div>
              <div className="server-card-grid">
                {servers.map((server) => (
                  <button
                    className="server-card"
                    type="button"
                    key={server.id}
                    onClick={() => {
                      setSelectedServerId(server.id)
                      setActiveTab('chat')
                    }}
                  >
                    <strong>{server.name}</strong>
                    <span>{server.description || '서버 설명 없음'}</span>
                    <em>{server.githubOrg ? `GitHub Org: ${server.githubOrg}` : 'GitHub Organization 미연동'}</em>
                  </button>
                ))}
                {servers.length === 0 && (
                  <div className="empty-state">
                    <strong>아직 서버가 없습니다.</strong>
                    <span>서버를 만들면 채팅방과 작업 탭이 함께 생성됩니다.</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="server-layout">
            <aside className="server-sidebar">
              <div className="server-profile">
                <span className="server-mark">#</span>
                <h2>{selectedServer.name}</h2>
                <p>{selectedServer.description || '서버 설명이 없습니다.'}</p>
                <small>{selectedServer.githubOrg ? `GitHub Organization: ${selectedServer.githubOrg}` : 'GitHub Organization 미연동'}</small>
              </div>
              <div className="server-switcher">
                {servers.map((server) => (
                  <button
                    className={server.id === selectedServer.id ? 'server-switch active' : 'server-switch'}
                    type="button"
                    key={server.id}
                    onClick={() => {
                      setSelectedServerId(server.id)
                      setActiveTab('chat')
                    }}
                  >
                    {server.name}
                  </button>
                ))}
              </div>
              <button className="ghost-btn full" type="button" onClick={() => setSelectedServerId(null)}>
                + 서버 추가/선택
              </button>
            </aside>

            <section className="server-room">
              <div className="room-header">
                <div>
                  <span className="eyebrow">서버 작업 공간</span>
                  <h2>{selectedServer.name}</h2>
                </div>
                <div className="room-tabs">
                  {tabs.map((tab) => (
                    <button
                      className={activeTab === tab.id ? 'room-tab active' : 'room-tab'}
                      type="button"
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {activeTab === 'chat' && (
                <div className="chat-room">
                  <div className="chat-list">
                    {chatLoading && <div className="chat-system">메시지를 불러오는 중...</div>}
                    {messages.map((message) => (
                      <div className="chat-message" key={message.id}>
                        <div className="chat-meta">
                          <strong>{message.authorLogin}</strong>
                          <span>{formatDateTime(message.createdAt)}{message.localOnly ? ' · 로컬' : ''}</span>
                        </div>
                        <p>{message.content}</p>
                      </div>
                    ))}
                    {!chatLoading && messages.length === 0 && (
                      <div className="chat-system">아직 메시지가 없습니다. 이 서버의 첫 메시지를 남기세요.</div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <form className="chat-form" onSubmit={sendMessage}>
                    <input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder={`${selectedServer.name}에 메시지 보내기`} />
                    <button className="primary-btn" type="submit" disabled={chatSending}>
                      {chatSending ? '전송 중' : '전송'}
                    </button>
                  </form>
                </div>
              )}

              {activeTab === 'work' && (
                <div className="work-grid">
                  <div className="room-card">
                    <div className="panel-head">
                      <h3>GitHub Organization</h3>
                      <span>{selectedServer.githubOrg ? '연동됨' : '미연동'}</span>
                    </div>
                    <form className="connect-form" onSubmit={saveGithubOrg}>
                      <input value={serverOrgInput} onChange={(event) => setServerOrgInput(event.target.value)} placeholder="Organization 이름" />
                      <button type="submit">저장</button>
                    </form>
                    <p className="hint">Organization 자동 생성은 GitHub 앱 권한이 추가로 필요합니다. 지금은 서버별 연결 정보를 저장합니다.</p>
                  </div>

                  <div className="room-card">
                    <div className="panel-head">
                      <h3>레포 연결</h3>
                      <span>{serverWatches.length}개</span>
                    </div>
                    <form className="connect-form" onSubmit={connectRepo}>
                      <input value={repoInput} onChange={(event) => setRepoInput(event.target.value)} placeholder="owner/repo" />
                      <button type="submit">연결</button>
                    </form>
                    <div className="list">
                      {serverWatches.map((watch) => (
                        <button
                          className={watch.id === selectedWatch?.id ? 'list-item active' : 'list-item'}
                          type="button"
                          key={watch.id}
                          onClick={() => setSelectedWatchId(watch.id)}
                        >
                          <strong>{watch.fullName}</strong>
                          <span>{watch.enabled ? '알림 ON' : '알림 OFF'}</span>
                        </button>
                      ))}
                      {serverWatches.length === 0 && <div className="chat-system">연결된 레포가 없습니다.</div>}
                    </div>
                  </div>

                  <div className="room-card wide">
                    <div className="panel-head">
                      <h3>GitHub Actions</h3>
                      {selectedWatch && <a href={selectedWatch.actionsUrl} target="_blank" rel="noreferrer">Actions 열기</a>}
                    </div>
                    {selectedWatch && (
                      <button className="ghost-btn" type="button" onClick={() => toggleWatch(selectedWatch)}>
                        {selectedWatch.enabled ? '알림 끄기' : '알림 켜기'}
                      </button>
                    )}
                    <div className="run-list">
                      {runs.map((run) => (
                        <div className={run.conclusion === 'failure' ? 'run-card fail' : 'run-card'} key={run.id}>
                          <strong>{run.name}</strong>
                          <span>{run.status} · {run.conclusion || '진행 중'} · {run.branch}</span>
                          <a href={run.htmlUrl} target="_blank" rel="noreferrer">보기</a>
                        </div>
                      ))}
                      {runs.length === 0 && <div className="chat-system">레포를 선택하면 작업 상태가 표시됩니다.</div>}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'docs' && (
                <div className="docs-grid">
                  <div className="room-card">
                    <div className="panel-head">
                      <h3>개발 문서</h3>
                      <button type="button" onClick={createDoc}>새 문서</button>
                    </div>
                    <div className="list">
                      {serverDocs.map((doc) => (
                        <button
                          className={doc.id === selectedDocId ? 'list-item active' : 'list-item'}
                          type="button"
                          key={doc.id}
                          onClick={() => setSelectedDocId(doc.id)}
                        >
                          <strong>{doc.title}</strong>
                          <span>{formatDateTime(doc.updatedAt)}</span>
                        </button>
                      ))}
                      {serverDocs.length === 0 && <div className="chat-system">서버에 저장된 문서가 없습니다.</div>}
                    </div>
                  </div>

                  <div className="room-card doc-editor">
                    <input value={docTitle} onChange={(event) => setDocTitle(event.target.value)} placeholder="문서 제목" />
                    <textarea value={docContent} onChange={(event) => setDocContent(event.target.value)} placeholder="기능 명세서, API 명세서, 트러블 슈팅을 적어보세요." />
                    <button className="primary-btn" type="button" onClick={saveDoc}>문서 저장</button>
                  </div>
                </div>
              )}

              {activeTab === 'alerts' && (
                <div className="alert-grid">
                  <div className="room-card">
                    <div className="panel-head">
                      <h3>Discord 알림</h3>
                      <span>{discord.enabled ? 'ON' : 'OFF'}</span>
                    </div>
                    <label className="toggle-row">
                      <input type="checkbox" checked={discord.enabled} onChange={(event) => setDiscord({ ...discord, enabled: event.target.checked })} />
                      GitHub Action 완료 알림 받기
                    </label>
                    <label className="toggle-row">
                      <input type="checkbox" checked={discord.success} onChange={(event) => setDiscord({ ...discord, success: event.target.checked })} />
                      성공 알림
                    </label>
                    <label className="toggle-row">
                      <input type="checkbox" checked={discord.failure} onChange={(event) => setDiscord({ ...discord, failure: event.target.checked })} />
                      실패 알림
                    </label>
                    <input value={discord.webhookUrl} onChange={(event) => setDiscord({ ...discord, webhookUrl: event.target.value })} placeholder="Discord Webhook URL" />
                    <button className="primary-btn" type="button" onClick={saveDiscordSettings}>알림 설정 저장</button>
                  </div>
                  <div className="room-card">
                    <h3>알림 기준</h3>
                    <p className="hint">서버별 레포 알림을 켜면 Action 성공/실패를 구분해서 Discord로 보낼 수 있게 구성했습니다.</p>
                  </div>
                </div>
              )}
            </section>
          </section>
        )}
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
