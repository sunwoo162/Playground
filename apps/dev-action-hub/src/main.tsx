import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const LOCAL_SERVERS_KEY = 'dev-action-hub-local-servers'
const LOCAL_MESSAGES_KEY = 'dev-action-hub-local-messages'
const LOCAL_DM_KEY = 'dev-action-hub-local-dms'
const WATCHES_KEY = 'dev-action-hub-watches'
const DOCS_KEY = 'dev-action-hub-docs'
const DISCORD_KEY = 'dev-action-hub-discord'

type RoomTab = 'chat' | 'work' | 'docs' | 'alerts'
type ViewMode = 'dm' | 'server'
type DmSection = 'messages' | 'friends'
type Presence = 'online' | 'idle' | 'offline'

type DevServer = {
  id: string
  name: string
  slug: string
  githubOrg: string
  description: string
  ownerLogin: string
  createdAt: string
  localOnly?: boolean
}

type ChatMessage = {
  id: string
  serverId: string
  authorLogin: string
  content: string
  createdAt: string
  localOnly?: boolean
}

type Watch = {
  id: string
  serverId: string
  fullName: string
  actionsUrl: string
  enabled: boolean
}

type Run = {
  id: string
  name: string
  status: string
  conclusion: string | null
  branch: string
  htmlUrl: string
  createdAt: string
  updatedAt: string
}

type DevDoc = {
  id: string
  serverId: string
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

type DirectRoom = {
  id: string
  name: string
  subtitle: string
  avatar: string
  status: Presence
}

type FriendUser = {
  githubId: string
  login: string
  name: string | null
  avatarUrl: string
  friendStatus: string | null
}

const directRooms: DirectRoom[] = [
  { id: 'leadership', name: '리더십 향상을 위한 끄적 방', subtitle: '멤버 3명', avatar: '리', status: 'online' },
  { id: 'review', name: '코드 리뷰 메모', subtitle: '작업 메모', avatar: '리', status: 'idle' },
  { id: 'deploy', name: '배포 확인', subtitle: 'GitHub Actions', avatar: '깃', status: 'online' },
  { id: 'docs', name: '문서 정리', subtitle: '기능/API/트러블슈팅', avatar: '문', status: 'offline' },
]

const defaultDmMessages: Record<string, ChatMessage[]> = {
  leadership: [
    {
      id: 'dm-1',
      serverId: 'leadership',
      authorLogin: 'sunwoo162',
      content: '작업 서버를 만들면 그 안에서 채팅하고 깃 액션을 확인하는 식으로 정리합니다.',
      createdAt: new Date().toISOString(),
    },
  ],
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  const body = await response.text()
  if (!response.ok) throw new Error(body || response.statusText)
  return body ? (JSON.parse(body) as T) : ({} as T)
}

function nowId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function initials(value: string) {
  return value.trim().slice(0, 2).toUpperCase() || '서'
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
  return `https://github.com/${repo.replace(/^https:\/\/github.com\//, '').replace(/\.git$/, '')}/actions`
}

function tabLabel(tab: RoomTab) {
  if (tab === 'chat') return '일반'
  if (tab === 'work') return 'github-actions'
  if (tab === 'docs') return '개발-문서'
  return '알림-설정'
}

function App() {
  const [servers, setServers] = useState<DevServer[]>(() => readJson<DevServer[]>(LOCAL_SERVERS_KEY, []))
  const [selectedServerId, setSelectedServerId] = useState<string>(() => readJson<DevServer[]>(LOCAL_SERVERS_KEY, [])[0]?.id || '')
  const [viewMode, setViewMode] = useState<ViewMode>(() => (selectedServerId ? 'server' : 'dm'))
  const [activeTab, setActiveTab] = useState<RoomTab>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [dmSearch, setDmSearch] = useState('')
  const [selectedDmId, setSelectedDmId] = useState(directRooms[0].id)
  const [dmSection, setDmSection] = useState<DmSection>('messages')
  const [dmMessages, setDmMessages] = useState<Record<string, ChatMessage[]>>(() =>
    readJson(LOCAL_DM_KEY, defaultDmMessages),
  )
  const [dmText, setDmText] = useState('')
  const [watches, setWatches] = useState<Watch[]>(() => readJson(WATCHES_KEY, []))
  const [runs, setRuns] = useState<Run[]>([])
  const [docs, setDocs] = useState<DevDoc[]>(() => readJson(DOCS_KEY, []))
  const [discord, setDiscord] = useState<DiscordSettings>(() =>
    readJson(DISCORD_KEY, { webhookUrl: '', enabled: true, success: true, failure: true }),
  )
  const [status, setStatus] = useState('')
  const [friends, setFriends] = useState<FriendUser[]>([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [friendSearch, setFriendSearch] = useState('')
  const [friendSearchResults, setFriendSearchResults] = useState<FriendUser[]>([])
  const [friendSearching, setFriendSearching] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newServer, setNewServer] = useState({ name: '', description: '', githubOrg: '' })
  const [repoInput, setRepoInput] = useState('')
  const [docDraft, setDocDraft] = useState({ title: '', content: '' })
  const feedRef = useRef<HTMLDivElement>(null)

  const selectedServer = servers.find(server => server.id === selectedServerId) || null
  const serverMessages = messages.filter(message => message.serverId === selectedServerId)
  const serverWatches = watches.filter(watch => watch.serverId === selectedServerId)
  const serverDocs = docs.filter(doc => doc.serverId === selectedServerId)
  const selectedDm = directRooms.find(room => room.id === selectedDmId) || directRooms[0]
  const selectedDmMessages = dmMessages[selectedDm.id] || []
  const filteredDms = directRooms.filter(room => room.name.includes(dmSearch) || room.subtitle.includes(dmSearch))

  const members = useMemo(() => {
    const names = new Set<string>()
    if (selectedServer?.ownerLogin) names.add(selectedServer.ownerLogin)
    serverMessages.forEach(message => names.add(message.authorLogin))
    names.add('GitHub Actions')
    names.add('Discord Bot')
    return Array.from(names)
  }, [selectedServer, serverMessages])

  useEffect(() => {
    apiJson<DevServer[]>('/api/dev-hub/servers')
      .then(remote => {
        if (remote.length > 0) {
          setServers(remote)
          writeJson(LOCAL_SERVERS_KEY, remote)
          if (!selectedServerId) {
            setSelectedServerId(remote[0].id)
          }
        }
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!selectedServerId) return
    apiJson<ChatMessage[]>(`/api/dev-hub/servers/${selectedServerId}/messages`)
      .then(setMessages)
      .catch(() => setMessages(readJson(LOCAL_MESSAGES_KEY, [])))
  }, [selectedServerId])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight })
  }, [serverMessages.length, selectedDmMessages.length, viewMode])

  async function createServer(event: FormEvent) {
    event.preventDefault()
    const name = newServer.name.trim()
    if (!name) return

    const payload = {
      name,
      slug: slugify(name),
      githubOrg: newServer.githubOrg.trim() || slugify(name),
      description: newServer.description.trim(),
    }

    try {
      const created = await apiJson<DevServer>('/api/dev-hub/servers', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setServers(prev => {
        const next = [created, ...prev.filter(server => server.id !== created.id)]
        writeJson(LOCAL_SERVERS_KEY, next)
        return next
      })
      setSelectedServerId(created.id)
    } catch {
      const created: DevServer = {
        ...payload,
        id: nowId('server'),
        ownerLogin: 'sunwoo162',
        createdAt: new Date().toISOString(),
        localOnly: true,
      }
      setServers(prev => {
        const next = [created, ...prev]
        writeJson(LOCAL_SERVERS_KEY, next)
        return next
      })
      setSelectedServerId(created.id)
    }

    setNewServer({ name: '', description: '', githubOrg: '' })
    setViewMode('server')
    setActiveTab('chat')
    setCreateOpen(false)
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    if (!selectedServer || !messageText.trim()) return

    const payload = { content: messageText.trim() }
    setMessageText('')

    try {
      const created = await apiJson<ChatMessage>(`/api/dev-hub/servers/${selectedServer.id}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setMessages(prev => [...prev, created])
    } catch {
      const created: ChatMessage = {
        id: nowId('message'),
        serverId: selectedServer.id,
        authorLogin: 'sunwoo162',
        content: payload.content,
        createdAt: new Date().toISOString(),
        localOnly: true,
      }
      setMessages(prev => {
        const next = [...prev, created]
        writeJson(LOCAL_MESSAGES_KEY, next)
        return next
      })
    }
  }

  function sendDirectMessage(event: FormEvent) {
    event.preventDefault()
    if (!dmText.trim()) return
    const created: ChatMessage = {
      id: nowId('dm'),
      serverId: selectedDm.id,
      authorLogin: 'sunwoo162',
      content: dmText.trim(),
      createdAt: new Date().toISOString(),
      localOnly: true,
    }
    setDmText('')
    setDmMessages(prev => {
      const next = { ...prev, [selectedDm.id]: [...(prev[selectedDm.id] || []), created] }
      writeJson(LOCAL_DM_KEY, next)
      return next
    })
  }

  async function connectRepo(event: FormEvent) {
    event.preventDefault()
    if (!selectedServer || !repoInput.trim()) return
    const fullName = repoInput.trim().replace(/^https:\/\/github.com\//, '').replace(/\.git$/, '')
    const watch: Watch = {
      id: nowId('watch'),
      serverId: selectedServer.id,
      fullName,
      actionsUrl: repoActionsUrl(fullName),
      enabled: true,
    }
    setWatches(prev => {
      const next = [watch, ...prev.filter(item => item.fullName !== fullName)]
      writeJson(WATCHES_KEY, next)
      return next
    })
    setRepoInput('')
    setStatus(`${fullName} 저장소를 연결했습니다.`)
  }

  async function loadRuns(watch: Watch) {
    setStatus('GitHub Actions 실행 기록을 불러오는 중입니다.')
    try {
      const data = await apiJson<Run[]>(`/api/dev-hub/github/runs?repo=${encodeURIComponent(watch.fullName)}`)
      setRuns(data)
      setStatus('')
    } catch (error) {
      setRuns([])
      setStatus(error instanceof Error ? error.message : '실행 기록을 불러오지 못했습니다.')
    }
  }

  function toggleWatch(id: string) {
    setWatches(prev => {
      const next = prev.map(watch => (watch.id === id ? { ...watch, enabled: !watch.enabled } : watch))
      writeJson(WATCHES_KEY, next)
      return next
    })
  }

  function saveDiscordSettings(event: FormEvent) {
    event.preventDefault()
    writeJson(DISCORD_KEY, discord)
    setStatus('알림 설정을 저장했습니다.')
  }

  function createDoc(event: FormEvent) {
    event.preventDefault()
    if (!selectedServer || !docDraft.title.trim()) return
    const doc: DevDoc = {
      id: nowId('doc'),
      serverId: selectedServer.id,
      title: docDraft.title.trim(),
      content: docDraft.content.trim(),
      updatedAt: new Date().toISOString(),
    }
    setDocs(prev => {
      const next = [doc, ...prev]
      writeJson(DOCS_KEY, next)
      return next
    })
    setDocDraft({ title: '', content: '' })
  }

  function openServer(serverId: string) {
    setSelectedServerId(serverId)
    setViewMode('server')
    setActiveTab('chat')
  }

  const messageList = viewMode === 'dm' ? selectedDmMessages : serverMessages
  const viewingFriends = viewMode === 'dm' && dmSection === 'friends'

  async function loadFriends() {
    setFriendsLoading(true)
    try {
      setFriends(await apiJson<FriendUser[]>('/api/friends'))
    } catch {
      setFriends([])
    } finally {
      setFriendsLoading(false)
    }
  }

  function openFriends() {
    setViewMode('dm')
    setDmSection('friends')
    void loadFriends()
  }

  function friendStatusLabel(status: string | null) {
    if (!status) return '친구 추가'
    if (status === 'PENDING_SENT') return '요청 중'
    if (status === 'PENDING_RECEIVED') return '요청 받음'
    if (status === 'ACCEPTED') return '친구'
    return '친구 추가'
  }

  async function searchFriends(event: FormEvent) {
    event.preventDefault()
    const query = friendSearch.trim()
    if (!query) return
    setFriendSearching(true)
    try {
      setFriendSearchResults(await apiJson<FriendUser[]>(`/api/friends/search?q=${encodeURIComponent(query)}`))
    } catch {
      setFriendSearchResults([])
    } finally {
      setFriendSearching(false)
    }
  }

  async function sendFriendRequest(githubId: string) {
    try {
      await apiJson(`/api/friends/request/${githubId}`, { method: 'POST' })
      setFriendSearchResults(prev =>
        prev.map(user => (user.githubId === githubId ? { ...user, friendStatus: 'PENDING_SENT' } : user)),
      )
      setStatus('친구 요청을 보냈습니다.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '친구 요청을 보내지 못했습니다.')
    }
  }

  return (
    <div className="discord-shell">
      <aside className="server-rail">
        <a className="rail-home" href="/" title="놀이터로 이동">
          ←
        </a>
        <button className={`rail-button ${viewMode === 'dm' ? 'active' : ''}`} onClick={() => setViewMode('dm')} title="다이렉트 메시지">
          💬
        </button>
        <button className="rail-button rail-add" onClick={() => setCreateOpen(true)} title="서버 만들기">
          +
        </button>
        <div className="rail-divider" />
        {servers.map(server => (
          <button
            key={server.id}
            className={`rail-button ${viewMode === 'server' && selectedServerId === server.id ? 'active' : ''}`}
            onClick={() => openServer(server.id)}
            title={server.name}
          >
            {initials(server.name)}
          </button>
        ))}
      </aside>

      <aside className="discord-sidebar">
        {viewMode === 'dm' ? (
          <>
            <div className="sidebar-search">
              <input value={dmSearch} onChange={event => setDmSearch(event.target.value)} placeholder="대화 찾기 또는 시작하기" />
            </div>
            <nav className="dm-nav">
              <button className={dmSection === 'friends' ? 'active' : ''} onClick={openFriends}>
                👥 친구
              </button>
              <button onClick={() => setDmSection('messages')}>⚙️ GitHub Actions</button>
              <button onClick={() => setDmSection('messages')}>📚 개발 문서</button>
              <button onClick={() => setDmSection('messages')}>🔔 알림</button>
            </nav>
            <div className="sidebar-section">
              <div className="section-title">
                <span>다이렉트 메시지</span>
                <button onClick={() => setCreateOpen(true)}>+</button>
              </div>
              {filteredDms.map(room => (
                <button
                  key={room.id}
                  className={`dm-row ${selectedDmId === room.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedDmId(room.id)
                    setViewMode('dm')
                    setDmSection('messages')
                  }}
                >
                  <span className={`avatar sm ${room.status}`}>{room.avatar}</span>
                  <span>
                    <strong>{room.name}</strong>
                    <small>{room.subtitle}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="server-title">
              <button>{selectedServer?.name || '서버 선택'}⌄</button>
              <button onClick={() => setCreateOpen(true)} title="서버 만들기">
                +
              </button>
            </div>
            <div className="sidebar-section">
              <button className="event-row">📅 이벤트</button>
            </div>
            <div className="sidebar-section">
              <div className="section-title">채팅 채널</div>
              {(['chat', 'work', 'docs', 'alerts'] as RoomTab[]).map(tab => (
                <button key={tab} className={`channel-row ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                  # {tabLabel(tab)}
                </button>
              ))}
            </div>
            <div className="sidebar-section">
              <div className="section-title">음성 채널</div>
              <button className="channel-row">🔊 일반</button>
            </div>
          </>
        )}
      </aside>

      <main className="discord-main">
        <header className="channel-header">
          <div>
            <strong>{viewMode === 'dm' ? selectedDm.name : `# ${tabLabel(activeTab)}`}</strong>
            <span>
              {viewingFriends
                ? `${friends.length}명의 친구`
                : viewMode === 'dm'
                  ? '다이렉트 메시지'
                  : selectedServer?.description || selectedServer?.githubOrg || '서버 작업 공간'}
            </span>
          </div>
          <div className="header-actions">
            <button>☎</button>
            <button>📌</button>
            <button onClick={openFriends}>👥</button>
            <input placeholder={`${viewMode === 'dm' ? selectedDm.name : selectedServer?.name || '서버'} 검색`} />
          </div>
        </header>

        {viewingFriends ? (
          <div className="workspace-panel">
            <section className="panel-card friends-card">
              <div className="card-row">
                <div>
                  <h2>친구</h2>
                  <p>GitHub 아이디로 친구를 찾고 개발 액션 허브에서 바로 추가합니다.</p>
                </div>
                <button onClick={loadFriends}>새로고침</button>
              </div>
            </section>
            {status && <p className="status-banner">{status}</p>}
            <section className="panel-card friends-card">
              <h2>친구 추가</h2>
              <form className="inline-form" onSubmit={searchFriends}>
                <input value={friendSearch} onChange={event => setFriendSearch(event.target.value)} placeholder="GitHub 아이디로 검색" />
                <button type="submit" disabled={friendSearching}>
                  {friendSearching ? '검색 중' : '검색'}
                </button>
              </form>
              {friendSearchResults.length > 0 && (
                <div className="friend-search-results">
                  {friendSearchResults.map(user => {
                    const canRequest = !user.friendStatus
                    return (
                      <article className="friend-card" key={user.githubId}>
                        <img src={user.avatarUrl} alt={user.login} />
                        <div>
                          <strong>{user.name || user.login}</strong>
                          <span>@{user.login}</span>
                        </div>
                        <button onClick={() => canRequest && sendFriendRequest(user.githubId)} disabled={!canRequest}>
                          {friendStatusLabel(user.friendStatus)}
                        </button>
                      </article>
                    )
                  })}
                </div>
              )}
              {friendSearchResults.length === 0 && friendSearch.trim() && !friendSearching && (
                <p className="friend-empty search-empty">검색 결과가 없습니다.</p>
              )}
            </section>
            {friendsLoading ? (
              <p className="friend-empty">친구를 불러오는 중입니다.</p>
            ) : friends.length === 0 ? (
              <p className="friend-empty">아직 친구가 없습니다. 메인 놀이터에서 친구를 추가해보세요.</p>
            ) : (
              <section className="friend-grid">
                {friends.map(friend => (
                  <article className="friend-card" key={friend.githubId}>
                    <img src={friend.avatarUrl} alt={friend.login} />
                    <div>
                      <strong>{friend.name || friend.login}</strong>
                      <span>@{friend.login}</span>
                    </div>
                  </article>
                ))}
              </section>
            )}
          </div>
        ) : viewMode === 'dm' || activeTab === 'chat' ? (
          <>
            <div className="message-feed" ref={feedRef}>
              {messageList.map(message => (
                <article key={message.id} className="message-row">
                  <span className="avatar">{initials(message.authorLogin)}</span>
                  <div>
                    <div className="message-meta">
                      <strong>{message.authorLogin}</strong>
                      <span>{formatDateTime(message.createdAt)}</span>
                    </div>
                    <p>{message.content}</p>
                  </div>
                </article>
              ))}
              {messageList.length === 0 && (
                <div className="empty-chat">
                  <h2>{viewMode === 'dm' ? selectedDm.name : selectedServer?.name}</h2>
                  <p>여기에서 대화를 시작하세요.</p>
                </div>
              )}
            </div>
            <form className="composer" onSubmit={viewMode === 'dm' ? sendDirectMessage : sendMessage}>
              <button type="button">＋</button>
              <input
                value={viewMode === 'dm' ? dmText : messageText}
                onChange={event => (viewMode === 'dm' ? setDmText(event.target.value) : setMessageText(event.target.value))}
                placeholder={`${viewMode === 'dm' ? selectedDm.name : `#${tabLabel(activeTab)}`}에 메시지 보내기`}
              />
              <button type="submit">전송</button>
            </form>
          </>
        ) : (
          <div className="workspace-panel">
            {status && <p className="status-banner">{status}</p>}
            {activeTab === 'work' && (
              <>
                <section className="panel-card">
                  <h2>GitHub 작업 연결</h2>
                  <form className="inline-form" onSubmit={connectRepo}>
                    <input value={repoInput} onChange={event => setRepoInput(event.target.value)} placeholder="owner/repo" />
                    <button type="submit">연결</button>
                  </form>
                </section>
                <section className="panel-grid">
                  {serverWatches.map(watch => (
                    <article className="panel-card" key={watch.id}>
                      <div className="card-row">
                        <h3>{watch.fullName}</h3>
                        <button onClick={() => toggleWatch(watch.id)}>{watch.enabled ? '알림 ON' : '알림 OFF'}</button>
                      </div>
                      <div className="button-row">
                        <button onClick={() => loadRuns(watch)}>실행 기록</button>
                        <a href={watch.actionsUrl} target="_blank" rel="noreferrer">
                          Actions 열기
                        </a>
                      </div>
                    </article>
                  ))}
                </section>
                {runs.length > 0 && (
                  <section className="panel-card">
                    <h2>최근 실행</h2>
                    {runs.map(run => (
                      <a key={run.id} className="run-row" href={run.htmlUrl} target="_blank" rel="noreferrer">
                        <span>{run.name}</span>
                        <strong>{run.conclusion || run.status}</strong>
                      </a>
                    ))}
                  </section>
                )}
              </>
            )}
            {activeTab === 'docs' && (
              <>
                <section className="panel-card">
                  <h2>개발 문서 작성</h2>
                  <form className="doc-form" onSubmit={createDoc}>
                    <input value={docDraft.title} onChange={event => setDocDraft({ ...docDraft, title: event.target.value })} placeholder="문서 제목" />
                    <textarea
                      value={docDraft.content}
                      onChange={event => setDocDraft({ ...docDraft, content: event.target.value })}
                      placeholder="기능명세서, API 명세서, 트러블슈팅 내용을 적으세요"
                    />
                    <button type="submit">문서 추가</button>
                  </form>
                </section>
                <section className="panel-grid">
                  {serverDocs.map(doc => (
                    <article className="panel-card" key={doc.id}>
                      <h3>{doc.title}</h3>
                      <p>{doc.content || '내용 없음'}</p>
                      <small>{formatDateTime(doc.updatedAt)}</small>
                    </article>
                  ))}
                </section>
              </>
            )}
            {activeTab === 'alerts' && (
              <section className="panel-card">
                <h2>Discord 알림 설정</h2>
                <form className="doc-form" onSubmit={saveDiscordSettings}>
                  <input
                    value={discord.webhookUrl}
                    onChange={event => setDiscord({ ...discord, webhookUrl: event.target.value })}
                    placeholder="Discord Webhook URL"
                  />
                  <label>
                    <input type="checkbox" checked={discord.enabled} onChange={event => setDiscord({ ...discord, enabled: event.target.checked })} /> 알림 사용
                  </label>
                  <label>
                    <input type="checkbox" checked={discord.success} onChange={event => setDiscord({ ...discord, success: event.target.checked })} /> 성공 알림
                  </label>
                  <label>
                    <input type="checkbox" checked={discord.failure} onChange={event => setDiscord({ ...discord, failure: event.target.checked })} /> 실패 알림
                  </label>
                  <button type="submit">저장</button>
                </form>
              </section>
            )}
          </div>
        )}
      </main>

      <aside className="member-pane">
        <h3>{viewingFriends ? `친구 - ${friends.length}` : viewMode === 'dm' ? '멤버 - 3' : `온라인 - ${members.length}`}</h3>
        {viewingFriends
          ? friends.map(friend => (
              <div className="member-row" key={friend.githubId}>
                <img className="avatar-image sm" src={friend.avatarUrl} alt={friend.login} />
                <span>{friend.name || friend.login}</span>
              </div>
            ))
          : (viewMode === 'dm' ? ['sunwoo162', 'GitHub Actions', selectedDm.name] : members).map((name, index) => (
              <div className="member-row" key={name}>
                <span className={`avatar sm ${index % 3 === 0 ? 'online' : index % 3 === 1 ? 'idle' : 'offline'}`}>{initials(name)}</span>
                <span>{name}</span>
              </div>
            ))}
      </aside>

      {createOpen && (
        <div className="modal-backdrop" onMouseDown={() => setCreateOpen(false)}>
          <form className="create-modal" onSubmit={createServer} onMouseDown={event => event.stopPropagation()}>
            <h2>서버 만들기</h2>
            <p>서버 이름을 기준으로 작업 공간을 만들고, 이후 GitHub Organization 연동을 붙일 수 있습니다.</p>
            <label>
              서버 이름
              <input value={newServer.name} onChange={event => setNewServer({ ...newServer, name: event.target.value })} placeholder="예: xs" autoFocus />
            </label>
            <label>
              설명
              <input value={newServer.description} onChange={event => setNewServer({ ...newServer, description: event.target.value })} placeholder="서버 목적" />
            </label>
            <label>
              GitHub Organization 이름
              <input
                value={newServer.githubOrg}
                onChange={event => setNewServer({ ...newServer, githubOrg: event.target.value })}
                placeholder="비워두면 서버 이름으로 생성"
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setCreateOpen(false)}>
                취소
              </button>
              <button type="submit">만들기</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
