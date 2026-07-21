import React, { FormEvent, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { registerPushSubscription } from './push'
import './styles.css'

const LOCAL_SERVERS_KEY = 'dev-action-hub-local-servers'
const LOCAL_MESSAGES_KEY = 'dev-action-hub-local-messages'
const LOCAL_DM_KEY = 'dev-action-hub-local-dms'
const WATCHES_KEY = 'dev-action-hub-watches'
const DOCS_KEY = 'dev-action-hub-docs'
const DISCORD_KEY = 'dev-action-hub-discord'
const DM_ACTIVITY_KEY = 'dev-action-hub-dm-activity'

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
  authorAvatarUrl?: string
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
  avatarUrl: string
  status: Presence
}

type FriendUser = {
  githubId: string
  login: string
  name: string | null
  avatarUrl: string
  friendStatus: string | null
}

const defaultDmMessages: Record<string, ChatMessage[]> = {}

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

function githubOrgCreateUrl(orgName: string, email?: string) {
  const params = new URLSearchParams({ plan: 'free', organization_name: slugify(orgName) })
  if (email) {
    params.set('billing_email', email)
    params.set('contact_email', email)
    params.set('email', email)
  }
  return `https://github.com/account/organizations/new?${params.toString()}`
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
  const [selectedDmId, setSelectedDmId] = useState('')
  const [dmSection, setDmSection] = useState<DmSection>('messages')
  const [dmMessages, setDmMessages] = useState<Record<string, ChatMessage[]>>(() =>
    readJson(LOCAL_DM_KEY, defaultDmMessages),
  )
  const [dmActivity, setDmActivity] = useState<Record<string, string>>(() => readJson(DM_ACTIVITY_KEY, {}))
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
  const directRooms: DirectRoom[] = friends
    .map(friend => ({
      id: friend.githubId,
      name: friend.name || friend.login,
      subtitle: `@${friend.login}`,
      avatar: initials(friend.name || friend.login),
      avatarUrl: friend.avatarUrl,
      status: 'online' as Presence,
    }))
    .sort((a, b) => {
      const left = dmActivity[a.id] ? new Date(dmActivity[a.id]).getTime() : 0
      const right = dmActivity[b.id] ? new Date(dmActivity[b.id]).getTime() : 0
      return right - left || a.name.localeCompare(b.name, 'ko-KR')
    })
  const selectedDm = directRooms.find(room => room.id === selectedDmId) || directRooms[0] || null
  const selectedDmMessages = selectedDm ? dmMessages[selectedDm.id] || [] : []
  const filteredDms = directRooms.filter(room => room.name.includes(dmSearch) || room.subtitle.includes(dmSearch))

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
    void loadFriends()
    void registerPushSubscription()
  }, [])

  useEffect(() => {
    if (!selectedServerId) return
    loadServerMessages(selectedServerId)
    const timer = window.setInterval(() => loadServerMessages(selectedServerId), 3000)
    return () => window.clearInterval(timer)
  }, [selectedServerId])

  useEffect(() => {
    if (!selectedDmId) return
    loadDirectMessages(selectedDmId)
    const timer = window.setInterval(() => loadDirectMessages(selectedDmId), 3000)
    return () => window.clearInterval(timer)
  }, [selectedDmId])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight })
  }, [serverMessages.length, selectedDmMessages.length, viewMode])

  useEffect(() => {
    if (viewMode !== 'dm' || selectedDmId || friends.length === 0) return
    setSelectedDmId(friends[0].githubId)
  }, [friends, selectedDmId, viewMode])

  async function createServer(event: FormEvent) {
    event.preventDefault()
    const name = newServer.name.trim()
    if (!name) return
    const githubOrg = newServer.githubOrg.trim() || slugify(name)
    let githubEmail = ''

    const payload = {
      name,
      slug: slugify(name),
      githubOrg,
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

    try {
      const emailResponse = await apiJson<{ email: string }>('/github/primary-email')
      githubEmail = emailResponse.email || ''
      if (githubEmail && navigator.clipboard) {
        await navigator.clipboard.writeText(githubEmail)
      }
    } catch {
      githubEmail = ''
    }

    setNewServer({ name: '', description: '', githubOrg: '' })
    setViewMode('server')
    setActiveTab('chat')
    setCreateOpen(false)
    window.open(githubOrgCreateUrl(githubOrg, githubEmail), '_blank', 'noopener,noreferrer')
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

  function loadServerMessages(serverId: string) {
    apiJson<ChatMessage[]>(`/api/dev-hub/servers/${serverId}/messages`)
      .then(setMessages)
      .catch(() => setMessages(readJson(LOCAL_MESSAGES_KEY, [])))
  }

  function loadDirectMessages(friendId: string) {
    apiJson<ChatMessage[]>(`/api/dev-hub/dm/${friendId}/messages`)
      .then(remote => {
        setDmMessages(prev => ({ ...prev, [friendId]: remote }))
        updateDmActivity(friendId, remote.at(-1)?.createdAt)
      })
      .catch(() => undefined)
  }

  function updateDmActivity(friendId: string, createdAt?: string) {
    if (!createdAt) return
    setDmActivity(prev => {
      if (prev[friendId] === createdAt) return prev
      const next = { ...prev, [friendId]: createdAt }
      writeJson(DM_ACTIVITY_KEY, next)
      return next
    })
  }

  async function sendDirectMessage(event: FormEvent) {
    event.preventDefault()
    if (!selectedDm || !dmText.trim()) return
    const payload = { content: dmText.trim() }
    setDmText('')
    try {
      const created = await apiJson<ChatMessage>(`/api/dev-hub/dm/${selectedDm.id}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setDmMessages(prev => ({ ...prev, [selectedDm.id]: [...(prev[selectedDm.id] || []), created] }))
      updateDmActivity(selectedDm.id, created.createdAt)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '메시지를 보내지 못했습니다.')
      setDmText(payload.content)
    }
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
      const friendList = await apiJson<FriendUser[]>('/api/friends')
      setFriends(friendList)
      void refreshDmActivity(friendList)
    } catch {
      setFriends([])
    } finally {
      setFriendsLoading(false)
    }
  }

  async function refreshDmActivity(friendList: FriendUser[]) {
    await Promise.allSettled(friendList.map(friend => loadDirectMessages(friend.githubId)))
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
                  <img className="avatar-image sm" src={room.avatarUrl} alt={room.name} />
                  <span>
                    <strong>{room.name}</strong>
                    <small>{room.subtitle}</small>
                  </span>
                </button>
              ))}
              {filteredDms.length === 0 && <p className="sidebar-empty">친구를 추가하면 DM을 보낼 수 있습니다.</p>}
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
            <strong>{viewMode === 'dm' ? selectedDm?.name || '다이렉트 메시지' : `# ${tabLabel(activeTab)}`}</strong>
            <span>
              {viewingFriends
                ? `${friends.length}명의 친구`
                : viewMode === 'dm'
                  ? selectedDm?.subtitle || '친구를 선택하세요'
                  : selectedServer?.description || selectedServer?.githubOrg || '서버 작업 공간'}
            </span>
          </div>
          <div className="header-actions">
            <button>☎</button>
            <button>📌</button>
            <button onClick={openFriends}>👥</button>
            <input placeholder={`${viewMode === 'dm' ? selectedDm?.name || 'DM' : selectedServer?.name || '서버'} 검색`} />
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
          viewMode !== 'dm' || selectedDm ? (
          <>
            <div className="message-feed" ref={feedRef}>
              {messageList.map(message => (
                <article key={message.id} className="message-row">
                  {message.authorAvatarUrl ? (
                    <img className="avatar-image" src={message.authorAvatarUrl} alt={message.authorLogin} />
                  ) : (
                    <span className="avatar">{initials(message.authorLogin)}</span>
                  )}
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
                placeholder={`${viewMode === 'dm' ? selectedDm?.name : `#${tabLabel(activeTab)}`}에 메시지 보내기`}
              />
              <button type="submit">전송</button>
            </form>
          </>
          ) : (
            <div className="empty-chat empty-center">
              <h2>친구를 선택하세요</h2>
              <p>친구를 추가하면 다이렉트 메시지를 보낼 수 있습니다.</p>
              <button onClick={openFriends}>친구 추가</button>
            </div>
          )
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
                placeholder="비워두면 서버 이름으로 입력"
              />
            </label>
            <p className="modal-note">GitHub 정책상 조직 생성은 GitHub 화면에서 최종 확인해야 합니다. 만들기를 누르면 계정 이메일을 함께 전달하고, GitHub가 자동 입력을 막는 경우를 대비해 클립보드에도 복사합니다.</p>
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
