import React, { FormEvent, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { registerPushSubscription } from './push'
import './styles.css'

const LOCAL_SERVERS_KEY = 'dev-action-hub-local-servers'
const LOCAL_MESSAGES_KEY = 'dev-action-hub-local-messages'
const LOCAL_DM_KEY = 'dev-action-hub-local-dms'
const WATCHES_KEY = 'dev-action-hub-watches'
const DOCS_KEY = 'dev-action-hub-docs'
const TASKS_KEY = 'dev-action-hub-tasks'
const API_SPECS_KEY = 'dev-action-hub-api-specs'
const PERSONAS_KEY = 'dev-action-hub-personas'
const DEPLOYS_KEY = 'dev-action-hub-deploys'
const DISCORD_KEY = 'dev-action-hub-discord'
const DM_ACTIVITY_KEY = 'dev-action-hub-dm-activity'
const SELECTED_DM_KEY = 'dev-action-hub-selected-dm'
const FORWARDED_MESSAGE_IDS_KEY = 'dev-action-hub-forwarded-message-ids'
const DATA_RESET_KEY = 'dev-action-hub-data-reset-2026-07-23'
const SUPPORTED_REACTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '👏', '😮', '😢', '🙏', '✅', '🚀', '👀']
const DEFAULT_REPO = 'sunwoo162/Playground'

type RoomTab = 'chat' | 'overview' | 'specs' | 'analysis' | 'frontlog' | 'backlog' | 'api' | 'work' | 'deploy' | 'docs' | 'alerts'
type ViewMode = 'dm' | 'server'
type DmSection = 'messages' | 'friends'
type Presence = 'online' | 'idle' | 'offline'
type WorkStatus = 'todo' | 'doing' | 'review' | 'done'
type Priority = 'low' | 'medium' | 'high'

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
  deleted?: boolean
  pinned?: boolean
  reactions?: string
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

type GitHubRunApiItem = {
  id: number
  name: string
  status: string
  conclusion: string | null
  head_branch: string
  html_url: string
  created_at: string
  updated_at: string
}

type DevDoc = {
  id: string
  serverId: string
  title: string
  content: string
  updatedAt: string
}

type DevTask = {
  id: string
  serverId: string
  area: 'feature' | 'frontend' | 'backend' | 'api' | 'deploy'
  title: string
  detail: string
  status: WorkStatus
  priority: Priority
  updatedAt: string
}

type ApiSpec = {
  id: string
  serverId: string
  method: string
  path: string
  purpose: string
  request: string
  response: string
  status: WorkStatus
  updatedAt: string
}

type PersonaNote = {
  id: string
  serverId: string
  segment: string
  need: string
  pain: string
  metric: string
  updatedAt: string
}

type DeployCheck = {
  id: string
  serverId: string
  title: string
  environment: string
  checked: boolean
  note: string
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

type ForwardToast = {
  targetType: 'server' | 'dm'
  targetId: string
  targetName: string
  createdAt: number
}

type DevHubStructureResult = {
  success: boolean
  repos: {
    frontend: { fullName: string; actionsUrl: string }
    backend: { fullName: string; actionsUrl: string }
  }
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

function resetLocalDevHubDataOnce() {
  if (localStorage.getItem(DATA_RESET_KEY)) return
  localStorage.removeItem(LOCAL_SERVERS_KEY)
  localStorage.removeItem(LOCAL_MESSAGES_KEY)
  localStorage.removeItem(LOCAL_DM_KEY)
  localStorage.removeItem(WATCHES_KEY)
  localStorage.removeItem(DOCS_KEY)
  localStorage.removeItem(DM_ACTIVITY_KEY)
  localStorage.removeItem(FORWARDED_MESSAGE_IDS_KEY)
  localStorage.setItem(DATA_RESET_KEY, 'done')
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

function hasStoredDirectMessage() {
  return Boolean(localStorage.getItem(SELECTED_DM_KEY)) || Object.keys(readJson<Record<string, string>>(DM_ACTIVITY_KEY, {})).length > 0
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
  if (tab === 'overview') return '개요'
  if (tab === 'specs') return '기능명세'
  if (tab === 'analysis') return '사용자분석'
  if (tab === 'frontlog') return 'frontlog'
  if (tab === 'backlog') return 'backlog'
  if (tab === 'api') return 'API명세'
  if (tab === 'work') return 'github-actions'
  if (tab === 'deploy') return '배포'
  if (tab === 'docs') return '개발-문서'
  return '알림-설정'
}

function tabDescription(tab: RoomTab, server: DevServer | null) {
  if (tab === 'overview') return '프로젝트 진행 상황'
  if (tab === 'specs') return '기능명세서와 구현 상태'
  if (tab === 'analysis') return '사용자 니즈와 지표'
  if (tab === 'frontlog') return 'frontend log'
  if (tab === 'backlog') return 'backendlog'
  if (tab === 'api') return 'API 계약과 요청/응답'
  if (tab === 'deploy') return '배포 전후 체크리스트'
  return server?.description || server?.githubOrg || '서버 작업 공간'
}

function statusLabel(status: WorkStatus) {
  if (status === 'todo') return '대기'
  if (status === 'doing') return '진행'
  if (status === 'review') return '검토'
  return '완료'
}

function priorityLabel(priority: Priority) {
  if (priority === 'high') return '높음'
  if (priority === 'medium') return '보통'
  return '낮음'
}

function runStateLabel(run?: Run) {
  if (!run) return '확인 전'
  if (run.status !== 'completed') return '진행 중'
  if (run.conclusion === 'success') return '성공'
  if (run.conclusion === 'failure') return '실패'
  if (run.conclusion === 'cancelled') return '취소됨'
  return run.conclusion || run.status
}

function runHelpText(run?: Run) {
  if (!run) return 'Actions 기록을 불러오면 배포 상태와 다음 조치를 확인할 수 있습니다.'
  if (run.status !== 'completed') return '아직 실행 중입니다. 잠시 후 새로고침하세요.'
  if (run.conclusion === 'success') return '배포가 끝났습니다. 서비스 화면에서 반영 여부만 확인하면 됩니다.'
  if (run.conclusion === 'failure') return '실패했습니다. Actions 열기에서 실패 step을 확인하고 수정 후 다시 커밋/푸시하세요.'
  return '실행이 정상 완료되지 않았습니다. Actions 화면에서 세부 로그를 확인하세요.'
}

function parseReactions(value?: string) {
  if (!value) return []
  return value
    .split(',')
    .map(item => {
      const separatorIndex = item.indexOf('=')
      if (separatorIndex === -1) return { emoji: '', count: 0, users: [] }
      const emoji = item.slice(0, separatorIndex)
      const rawUsers = item.slice(separatorIndex + 1)
      const numericCount = Number(rawUsers)
      const users = rawUsers && Number.isFinite(numericCount) && String(numericCount) === rawUsers
        ? Array.from({ length: numericCount }, (_, index) => `사용자 ${index + 1}`)
        : rawUsers.split('|').map(user => user.trim()).filter(Boolean)
      return { emoji, count: users.length, users }
    })
    .filter(item => item.emoji && item.count > 0)
}

function stripForwardPrefix(content: string) {
  return content.replace(/^\s*전달\s*[:：]\s*/, '')
}

function normalizeRepo(value: string) {
  return value.trim().replace(/^https:\/\/github.com\//, '').replace(/\.git$/, '').replace(/^\/+|\/+$/g, '')
}

function App() {
  resetLocalDevHubDataOnce()
  const [servers, setServers] = useState<DevServer[]>(() => readJson<DevServer[]>(LOCAL_SERVERS_KEY, []))
  const [selectedServerId, setSelectedServerId] = useState<string>(() => readJson<DevServer[]>(LOCAL_SERVERS_KEY, [])[0]?.id || '')
  const [viewMode, setViewMode] = useState<ViewMode>(() => (hasStoredDirectMessage() || !selectedServerId ? 'dm' : 'server'))
  const [activeTab, setActiveTab] = useState<RoomTab>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [dmSearch, setDmSearch] = useState('')
  const [selectedDmId, setSelectedDmId] = useState(() => localStorage.getItem(SELECTED_DM_KEY) || '')
  const [dmSection, setDmSection] = useState<DmSection>('messages')
  const [dmMessages, setDmMessages] = useState<Record<string, ChatMessage[]>>(() =>
    readJson(LOCAL_DM_KEY, defaultDmMessages),
  )
  const [dmActivity, setDmActivity] = useState<Record<string, string>>(() => readJson(DM_ACTIVITY_KEY, {}))
  const [dmText, setDmText] = useState('')
  const [watches, setWatches] = useState<Watch[]>(() => readJson(WATCHES_KEY, []))
  const [runs, setRuns] = useState<Run[]>([])
  const [docs, setDocs] = useState<DevDoc[]>(() => readJson(DOCS_KEY, []))
  const [tasks, setTasks] = useState<DevTask[]>(() => readJson(TASKS_KEY, []))
  const [apiSpecs, setApiSpecs] = useState<ApiSpec[]>(() => readJson(API_SPECS_KEY, []))
  const [personas, setPersonas] = useState<PersonaNote[]>(() => readJson(PERSONAS_KEY, []))
  const [deployChecks, setDeployChecks] = useState<DeployCheck[]>(() => readJson(DEPLOYS_KEY, []))
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
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null)
  const [forwardedMessageIds, setForwardedMessageIds] = useState<string[]>(() => readJson(FORWARDED_MESSAGE_IDS_KEY, []))
  const [forwardToast, setForwardToast] = useState<ForwardToast | null>(null)
  const [pinnedOpen, setPinnedOpen] = useState(false)
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null)
  const [newServer, setNewServer] = useState({ name: '', description: '', githubOrg: '' })
  const [serverEditOpen, setServerEditOpen] = useState(false)
  const [serverEdit, setServerEdit] = useState({ name: '', repoUrl: '' })
  const [settingUpStructure, setSettingUpStructure] = useState(false)
  const [repoInput, setRepoInput] = useState('')
  const [docDraft, setDocDraft] = useState({ title: '', content: '' })
  const [taskDraft, setTaskDraft] = useState({ title: '', detail: '', area: 'feature' as DevTask['area'], priority: 'medium' as Priority })
  const [apiDraft, setApiDraft] = useState({ method: 'GET', path: '', purpose: '', request: '', response: '' })
  const [personaDraft, setPersonaDraft] = useState({ segment: '', need: '', pain: '', metric: '' })
  const [deployDraft, setDeployDraft] = useState({ title: '', environment: 'production', note: '' })
  const feedRef = useRef<HTMLDivElement>(null)

  const selectedServer = servers.find(server => server.id === selectedServerId) || null
  const serverMessages = messages.filter(message => message.serverId === selectedServerId)
  const serverWatches = watches.filter(watch => watch.serverId === selectedServerId)
  const serverDocs = docs.filter(doc => doc.serverId === selectedServerId)
  const serverTasks = tasks.filter(task => task.serverId === selectedServerId)
  const serverApiSpecs = apiSpecs.filter(spec => spec.serverId === selectedServerId)
  const serverPersonas = personas.filter(persona => persona.serverId === selectedServerId)
  const serverDeployChecks = deployChecks.filter(check => check.serverId === selectedServerId)
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
    if (viewMode !== 'dm' || friends.length === 0) return
    if (selectedDmId && friends.some(friend => friend.githubId === selectedDmId)) return
    const recentFriend = [...friends].sort((a, b) => {
      const left = dmActivity[a.githubId] ? new Date(dmActivity[a.githubId]).getTime() : 0
      const right = dmActivity[b.githubId] ? new Date(dmActivity[b.githubId]).getTime() : 0
      return right - left
    })[0]
    if (recentFriend) selectDirectMessage(recentFriend.githubId)
  }, [dmActivity, friends, selectedDmId, viewMode])

  useEffect(() => {
    if (!forwardToast) return
    const timer = window.setTimeout(() => setForwardToast(null), 5000)
    return () => window.clearTimeout(timer)
  }, [forwardToast])

  useEffect(() => {
    if (viewMode !== 'server') return
    if (!['overview', 'work', 'deploy', 'frontlog', 'backlog'].includes(activeTab)) return
    const firstWatch = serverWatches[0]
    if (!firstWatch) return
    void loadRuns(firstWatch)
  }, [activeTab, selectedServerId, serverWatches.length, viewMode])

  async function createServer(event: FormEvent) {
    event.preventDefault()
    const name = newServer.name.trim()
    if (!name) return
    const githubOrg = newServer.githubOrg.trim()
    if (!githubOrg) {
      setStatus('GitHub Organization 이름을 입력해주세요.')
      return
    }
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
    setStatus(githubEmail ? `${githubEmail} 이메일을 복사했습니다. GitHub 화면에서 붙여넣어 주세요.` : 'GitHub Organization 생성 화면으로 이동합니다.')
    window.setTimeout(() => {
      window.open(githubOrgCreateUrl(githubOrg, githubEmail), '_blank', 'noopener,noreferrer')
    }, 900)
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

  function replaceMessage(updated: ChatMessage) {
    const updatedId = String(updated.id)
    if (viewMode === 'dm' && selectedDm) {
      setDmMessages(prev => ({
        ...prev,
        [selectedDm.id]: (prev[selectedDm.id] || []).map(message => (String(message.id) === updatedId ? updated : message)),
      }))
      return
    }
    setMessages(prev => prev.map(message => (String(message.id) === updatedId ? updated : message)))
  }

  function appendMessage(created: ChatMessage) {
    if (viewMode === 'dm' && selectedDm) {
      setDmMessages(prev => ({ ...prev, [selectedDm.id]: [...(prev[selectedDm.id] || []), created] }))
      updateDmActivity(selectedDm.id, created.createdAt)
      return
    }
    setMessages(prev => [...prev, created])
  }

  async function runMessageAction(message: ChatMessage, action: 'delete' | 'pin') {
    if (message.deleted && action !== 'pin') return
    const base =
      viewMode === 'dm' && selectedDm
        ? `/api/dev-hub/dm/${selectedDm.id}/messages/${message.id}`
        : selectedServer
          ? `/api/dev-hub/servers/${selectedServer.id}/messages/${message.id}`
          : ''
    if (!base) return
    try {
      const updated = await apiJson<ChatMessage>(`${base}/${action === 'pin' ? 'pin' : action}`, {
        method: 'POST',
      })
      replaceMessage(updated)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '메시지 작업을 처리하지 못했습니다.')
    }
  }

  async function forwardMessage(targetType: 'server' | 'dm', targetId: string) {
    if (!forwardingMessage || forwardingMessage.deleted) return
    const base =
      viewMode === 'dm' && selectedDm
        ? `/api/dev-hub/dm/${selectedDm.id}/messages/${forwardingMessage.id}`
        : selectedServer
          ? `/api/dev-hub/servers/${selectedServer.id}/messages/${forwardingMessage.id}`
          : ''
    if (!base) return
    try {
      const created = await apiJson<ChatMessage>(`${base}/forward`, {
        method: 'POST',
        body: JSON.stringify({ targetType, targetId }),
      })
      if ((viewMode === 'dm' && targetType === 'dm' && selectedDm?.id === targetId) || (viewMode === 'server' && targetType === 'server' && selectedServer?.id === targetId)) {
        appendMessage(created)
      }
      setForwardedMessageIds(prev => {
        const next = Array.from(new Set([...prev, String(created.id)]))
        writeJson(FORWARDED_MESSAGE_IDS_KEY, next)
        return next
      })
      setForwardingMessage(null)
      const targetName =
        targetType === 'server'
          ? servers.find(server => server.id === targetId)?.name || '서버'
          : directRooms.find(room => room.id === targetId)?.name || 'DM'
      setForwardToast({ targetType, targetId, targetName, createdAt: Date.now() })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '메시지를 전달하지 못했습니다.')
    }
  }

  async function reactToMessage(message: ChatMessage, emoji: string) {
    if (message.deleted) return
    const base =
      viewMode === 'dm' && selectedDm
        ? `/api/dev-hub/dm/${selectedDm.id}/messages/${message.id}`
        : selectedServer
          ? `/api/dev-hub/servers/${selectedServer.id}/messages/${message.id}`
          : ''
    if (!base) return
    try {
      replaceMessage(
        await apiJson<ChatMessage>(`${base}/reaction`, {
          method: 'POST',
          body: JSON.stringify({ emoji }),
        }),
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '이모티콘을 추가하지 못했습니다.')
    }
  }

  async function connectRepo(event: FormEvent) {
    event.preventDefault()
    if (!selectedServer || !repoInput.trim()) return
    const fullName = normalizeRepo(repoInput)
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
      setStatus(data[0] ? `${watch.fullName} 최신 Actions: ${runStateLabel(data[0])}` : `${watch.fullName} 실행 기록이 없습니다.`)
    } catch (error) {
      try {
        const response = await fetch(`https://api.github.com/repos/${watch.fullName}/actions/runs?per_page=8`)
        if (!response.ok) throw new Error('GitHub Actions 기록을 불러오지 못했습니다.')
        const data = await response.json() as { workflow_runs?: GitHubRunApiItem[] }
        const fallbackRuns: Run[] = (data.workflow_runs || []).map(run => ({
          id: String(run.id),
          name: run.name,
          status: run.status,
          conclusion: run.conclusion,
          branch: run.head_branch,
          htmlUrl: run.html_url,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
        }))
        setRuns(fallbackRuns)
        setStatus(fallbackRuns[0] ? `${watch.fullName} 최신 Actions: ${runStateLabel(fallbackRuns[0])}` : `${watch.fullName} 실행 기록이 없습니다.`)
      } catch (fallbackError) {
        setRuns([])
        setStatus(fallbackError instanceof Error ? fallbackError.message : error instanceof Error ? error.message : '실행 기록을 불러오지 못했습니다.')
      }
    }
  }

  function connectDefaultRepo() {
    if (!selectedServer) return
    const watch: Watch = {
      id: nowId('watch'),
      serverId: selectedServer.id,
      fullName: DEFAULT_REPO,
      actionsUrl: repoActionsUrl(DEFAULT_REPO),
      enabled: true,
    }
    setWatches(prev => {
      const next = [watch, ...prev.filter(item => !(item.serverId === selectedServer.id && item.fullName === DEFAULT_REPO))]
      writeJson(WATCHES_KEY, next)
      return next
    })
    setRepoInput('')
    setStatus(`${DEFAULT_REPO} 저장소를 연결했습니다.`)
    void loadRuns(watch)
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

  async function setupDevHubStructure() {
    if (!selectedServer?.githubOrg) {
      setStatus('GitHub Organization 이름이 필요합니다.')
      return
    }
    setSettingUpStructure(true)
    setStatus('GitHub Organization 구조를 설정하는 중입니다.')
    try {
      const result = await apiJson<DevHubStructureResult>('/github/setup-dev-hub-structure', {
        method: 'POST',
        body: JSON.stringify({ org: selectedServer.githubOrg }),
      })
      const createdWatches: Watch[] = [
        {
          id: nowId('watch'),
          serverId: selectedServer.id,
          fullName: result.repos.frontend.fullName,
          actionsUrl: result.repos.frontend.actionsUrl,
          enabled: true,
        },
        {
          id: nowId('watch'),
          serverId: selectedServer.id,
          fullName: result.repos.backend.fullName,
          actionsUrl: result.repos.backend.actionsUrl,
          enabled: true,
        },
      ]
      setWatches(prev => {
        const existingKeys = new Set(createdWatches.map(watch => `${watch.serverId}:${watch.fullName}`))
        const next = [...createdWatches, ...prev.filter(watch => !existingKeys.has(`${watch.serverId}:${watch.fullName}`))]
        writeJson(WATCHES_KEY, next)
        return next
      })
      setStatus('frontend/backend 레포와 log workflow를 설정했습니다.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Organization 구조 설정에 실패했습니다.')
    } finally {
      setSettingUpStructure(false)
    }
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

  function createTask(event: FormEvent) {
    event.preventDefault()
    if (!selectedServer || !taskDraft.title.trim()) return
    const task: DevTask = {
      id: nowId('task'),
      serverId: selectedServer.id,
      area: taskDraft.area,
      title: taskDraft.title.trim(),
      detail: taskDraft.detail.trim(),
      status: 'todo',
      priority: taskDraft.priority,
      updatedAt: new Date().toISOString(),
    }
    setTasks(prev => {
      const next = [task, ...prev]
      writeJson(TASKS_KEY, next)
      return next
    })
    setTaskDraft({ title: '', detail: '', area: 'feature', priority: 'medium' })
  }

  function updateTaskStatus(taskId: string, nextStatus: WorkStatus) {
    setTasks(prev => {
      const next = prev.map(task => task.id === taskId ? { ...task, status: nextStatus, updatedAt: new Date().toISOString() } : task)
      writeJson(TASKS_KEY, next)
      return next
    })
  }

  function createApiSpec(event: FormEvent) {
    event.preventDefault()
    if (!selectedServer || !apiDraft.path.trim()) return
    const spec: ApiSpec = {
      id: nowId('api'),
      serverId: selectedServer.id,
      method: apiDraft.method,
      path: apiDraft.path.trim(),
      purpose: apiDraft.purpose.trim(),
      request: apiDraft.request.trim(),
      response: apiDraft.response.trim(),
      status: 'todo',
      updatedAt: new Date().toISOString(),
    }
    setApiSpecs(prev => {
      const next = [spec, ...prev]
      writeJson(API_SPECS_KEY, next)
      return next
    })
    setApiDraft({ method: 'GET', path: '', purpose: '', request: '', response: '' })
  }

  function updateApiStatus(specId: string, nextStatus: WorkStatus) {
    setApiSpecs(prev => {
      const next = prev.map(spec => spec.id === specId ? { ...spec, status: nextStatus, updatedAt: new Date().toISOString() } : spec)
      writeJson(API_SPECS_KEY, next)
      return next
    })
  }

  function createPersona(event: FormEvent) {
    event.preventDefault()
    if (!selectedServer || !personaDraft.segment.trim()) return
    const persona: PersonaNote = {
      id: nowId('persona'),
      serverId: selectedServer.id,
      segment: personaDraft.segment.trim(),
      need: personaDraft.need.trim(),
      pain: personaDraft.pain.trim(),
      metric: personaDraft.metric.trim(),
      updatedAt: new Date().toISOString(),
    }
    setPersonas(prev => {
      const next = [persona, ...prev]
      writeJson(PERSONAS_KEY, next)
      return next
    })
    setPersonaDraft({ segment: '', need: '', pain: '', metric: '' })
  }

  function createDeployCheck(event: FormEvent) {
    event.preventDefault()
    if (!selectedServer || !deployDraft.title.trim()) return
    const check: DeployCheck = {
      id: nowId('deploy'),
      serverId: selectedServer.id,
      title: deployDraft.title.trim(),
      environment: deployDraft.environment.trim() || 'production',
      checked: false,
      note: deployDraft.note.trim(),
      updatedAt: new Date().toISOString(),
    }
    setDeployChecks(prev => {
      const next = [check, ...prev]
      writeJson(DEPLOYS_KEY, next)
      return next
    })
    setDeployDraft({ title: '', environment: 'production', note: '' })
  }

  function toggleDeployCheck(checkId: string) {
    setDeployChecks(prev => {
      const next = prev.map(check => check.id === checkId ? { ...check, checked: !check.checked, updatedAt: new Date().toISOString() } : check)
      writeJson(DEPLOYS_KEY, next)
      return next
    })
  }

  function openServer(serverId: string) {
    setSelectedServerId(serverId)
    setViewMode('server')
    setActiveTab('chat')
  }

  function openServerEdit() {
    if (!selectedServer) return
    setServerEdit({
      name: selectedServer.name,
      repoUrl: serverWatches[0]?.fullName || '',
    })
    setServerEditOpen(true)
  }

  function saveServerEdit(event: FormEvent) {
    event.preventDefault()
    if (!selectedServer) return
    const name = serverEdit.name.trim()
    if (!name) return
    const repoFullName = normalizeRepo(serverEdit.repoUrl)
    const updatedServer: DevServer = {
      ...selectedServer,
      name,
      slug: slugify(name),
      githubOrg: repoFullName.split('/')[0] || selectedServer.githubOrg,
      description: repoFullName || selectedServer.description,
    }

    setServers(prev => {
      const next = prev.map(server => (server.id === selectedServer.id ? updatedServer : server))
      writeJson(LOCAL_SERVERS_KEY, next)
      return next
    })

    setWatches(prev => {
      const others = prev.filter(watch => watch.serverId !== selectedServer.id)
      const next = repoFullName
        ? [
            {
              id: serverWatches[0]?.id || nowId('watch'),
              serverId: selectedServer.id,
              fullName: repoFullName,
              actionsUrl: repoActionsUrl(repoFullName),
              enabled: serverWatches[0]?.enabled ?? true,
            },
            ...others,
          ]
        : others
      writeJson(WATCHES_KEY, next)
      return next
    })

    setServerEditOpen(false)
    setStatus('서버 정보를 수정했습니다.')
  }

  function selectDirectMessage(friendId: string) {
    setSelectedDmId(friendId)
    localStorage.setItem(SELECTED_DM_KEY, friendId)
  }

  function moveToForwardTarget(toast: ForwardToast) {
    if (toast.targetType === 'server') {
      openServer(toast.targetId)
    } else {
      selectDirectMessage(toast.targetId)
      setViewMode('dm')
      setDmSection('messages')
    }
    setForwardToast(null)
  }

  const messageList = viewMode === 'dm' ? selectedDmMessages : serverMessages
  const pinnedRooms = [
    ...servers
      .map(server => ({
        id: `server-${server.id}`,
        title: server.name,
        subtitle: '서버',
        messages: messages.filter(message => message.serverId === server.id && message.pinned && !message.deleted),
      }))
      .filter(room => room.messages.length > 0),
    ...directRooms
      .map(room => ({
        id: `dm-${room.id}`,
        title: room.name,
        subtitle: room.subtitle,
        messages: (dmMessages[room.id] || []).filter(message => message.pinned && !message.deleted),
      }))
      .filter(room => room.messages.length > 0),
  ]
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

  async function openPinnedMessages() {
    setPinnedOpen(true)
    await Promise.allSettled([
      ...servers.map(server =>
        apiJson<ChatMessage[]>(`/api/dev-hub/servers/${server.id}/messages`).then(remote => {
          setMessages(prev => [...prev.filter(message => message.serverId !== server.id), ...remote])
        }),
      ),
      ...directRooms.map(room => loadDirectMessages(room.id)),
    ])
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
                    selectDirectMessage(room.id)
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
              <button onClick={openServerEdit} title="서버 정보 수정" disabled={!selectedServer}>
                +
              </button>
            </div>
            <div className="sidebar-section">
              <button className={`event-row ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>📊 개요</button>
            </div>
            <div className="sidebar-section">
              <div className="section-title">planning</div>
              {(['specs', 'analysis'] as RoomTab[]).map(tab => (
                <button key={tab} className={`channel-row ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                  # {tabLabel(tab)}
                </button>
              ))}
            </div>
            <div className="sidebar-section">
              <div className="section-title">frontend</div>
              <button className={`channel-row ${activeTab === 'frontlog' ? 'active' : ''}`} onClick={() => setActiveTab('frontlog')}>
                # frontlog
              </button>
            </div>
            <div className="sidebar-section">
              <div className="section-title">backend</div>
              <button className={`channel-row ${activeTab === 'backlog' ? 'active' : ''}`} onClick={() => setActiveTab('backlog')}>
                # backlog
              </button>
            </div>
            <div className="sidebar-section">
              <div className="section-title">채팅 채널</div>
              {(['chat', 'api', 'work', 'deploy', 'docs', 'alerts'] as RoomTab[]).map(tab => (
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
        {forwardToast && (
          <div className="forward-toast" key={forwardToast.createdAt}>
            <div>
              <strong>전달되었습니다</strong>
              <span>{forwardToast.targetName} 채팅방으로 보냈습니다.</span>
            </div>
            <button type="button" onClick={() => moveToForwardTarget(forwardToast)}>
              채팅방으로 이동하기
            </button>
            <span className="forward-toast-progress" />
          </div>
        )}
        <header className="channel-header">
          <div>
            <strong>{viewMode === 'dm' ? selectedDm?.name || '다이렉트 메시지' : `# ${tabLabel(activeTab)}`}</strong>
            <span>
              {viewingFriends
                ? `${friends.length}명의 친구`
                : viewMode === 'dm'
                  ? selectedDm?.subtitle || '친구를 선택하세요'
                  : tabDescription(activeTab, selectedServer)}
            </span>
          </div>
          <div className="header-actions">
            <button>☎</button>
            <button onClick={() => void openPinnedMessages()} title="고정된 메시지">
              📌
            </button>
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
              {status && <p className="status-banner">{status}</p>}
              {messageList.map(message => {
                const isForwarded = forwardedMessageIds.includes(String(message.id))
                return (
                <article key={message.id} className={`message-row ${isForwarded ? 'forwarded' : ''}`}>
                  {message.authorAvatarUrl ? (
                    <img className="avatar-image" src={message.authorAvatarUrl} alt={message.authorLogin} />
                  ) : (
                    <span className="avatar">{initials(message.authorLogin)}</span>
                  )}
                  <div>
                    <div className="message-meta">
                      <strong>{message.authorLogin}</strong>
                      <span>{formatDateTime(message.createdAt)}</span>
                      {isForwarded && <em className="forwarded-label">전달됨</em>}
                      {message.pinned && <em>고정됨</em>}
                    </div>
                    {isForwarded ? (
                      <div className={message.deleted ? 'forwarded-message deleted-message' : 'forwarded-message'}>
                        <span>전달된 메시지</span>
                        <p>{stripForwardPrefix(message.content)}</p>
                      </div>
                    ) : (
                      <p className={message.deleted ? 'deleted-message' : ''}>{message.content}</p>
                    )}
                    {parseReactions(message.reactions).length > 0 && (
                      <div className="reaction-row">
                        {parseReactions(message.reactions).map(reaction => (
                          <button
                            key={reaction.emoji}
                            type="button"
                            className="reaction-pill"
                            onClick={() => void reactToMessage(message, reaction.emoji)}
                            disabled={message.deleted}
                          >
                            {reaction.emoji} {reaction.count}
                            <small>{reaction.users.length > 0 ? reaction.users.join('\n') : '반응 없음'}</small>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="message-actions">
                      <span className="emoji-picker-wrap">
                        <button
                          type="button"
                          onClick={() => setReactionPickerMessageId(prev => (prev === message.id ? null : message.id))}
                          disabled={message.deleted}
                        >
                          이모티콘
                        </button>
                        {reactionPickerMessageId === message.id && (
                          <span className="emoji-picker">
                            {SUPPORTED_REACTIONS.map(emoji => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                  void reactToMessage(message, emoji)
                                  setReactionPickerMessageId(null)
                                }}
                              >
                                {emoji}
                              </button>
                            ))}
                          </span>
                        )}
                      </span>
                      <button type="button" onClick={() => runMessageAction(message, 'pin')}>
                        📌
                      </button>
                      <button type="button" onClick={() => setForwardingMessage(message)} disabled={message.deleted}>
                        전달
                      </button>
                      <button type="button" onClick={() => runMessageAction(message, 'delete')} disabled={message.deleted}>
                        삭제
                      </button>
                    </div>
                  </div>
                </article>
                )
              })}
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
            {activeTab === 'overview' && (
              <>
                <section className="ops-metrics">
                  <article className="metric-card"><span>기능</span><strong>{serverTasks.length}</strong><small>{serverTasks.filter(task => task.status === 'done').length}개 완료</small></article>
                  <article className="metric-card"><span>API</span><strong>{serverApiSpecs.length}</strong><small>{serverApiSpecs.filter(spec => spec.status === 'review').length}개 검토</small></article>
                  <article className="metric-card"><span>사용자 분석</span><strong>{serverPersonas.length}</strong><small>세그먼트 기준</small></article>
                  <article className="metric-card"><span>배포</span><strong>{serverDeployChecks.filter(check => check.checked).length}/{serverDeployChecks.length}</strong><small>체크 완료</small></article>
                </section>
                <section className="panel-grid">
                  <article className={`panel-card action-status-card ${runs[0]?.conclusion || runs[0]?.status || 'idle'}`}>
                    <div className="card-row">
                      <div>
                        <h2>GitHub Actions</h2>
                        <p>{serverWatches[0]?.fullName || '연결된 저장소가 없습니다.'}</p>
                      </div>
                      <strong>{runStateLabel(runs[0])}</strong>
                    </div>
                    <p>{runHelpText(runs[0])}</p>
                    <div className="button-row">
                      {serverWatches[0] ? (
                        <>
                          <button onClick={() => loadRuns(serverWatches[0])}>상태 새로고침</button>
                          <a href={runs[0]?.htmlUrl || serverWatches[0].actionsUrl} target="_blank" rel="noreferrer">Actions 열기</a>
                        </>
                      ) : (
                        <button onClick={connectDefaultRepo}>Playground 연결</button>
                      )}
                    </div>
                  </article>
                  <article className="panel-card">
                    <h2>다음 작업</h2>
                    {serverTasks.filter(task => task.status !== 'done').slice(0, 5).map(task => (
                      <div className="ops-row" key={task.id}>
                        <span className={`status-chip ${task.status}`}>{statusLabel(task.status)}</span>
                        <strong>{task.title}</strong>
                      </div>
                    ))}
                    {serverTasks.filter(task => task.status !== 'done').length === 0 && <p>대기 중인 작업이 없습니다.</p>}
                  </article>
                  <article className="panel-card">
                    <h2>배포 준비</h2>
                    {serverDeployChecks.slice(0, 5).map(check => (
                      <label className="check-row" key={check.id}>
                        <input type="checkbox" checked={check.checked} onChange={() => toggleDeployCheck(check.id)} />
                        <span>{check.title}</span>
                      </label>
                    ))}
                    {serverDeployChecks.length === 0 && <p>배포 체크리스트를 추가하세요.</p>}
                  </article>
                </section>
              </>
            )}
            {activeTab === 'specs' && (
              <>
                <section className="panel-card">
                  <h2>기능명세서</h2>
                  <form className="doc-form ops-form" onSubmit={createTask}>
                    <div className="form-grid">
                      <input value={taskDraft.title} onChange={event => setTaskDraft({ ...taskDraft, title: event.target.value })} placeholder="기능 이름" />
                      <select value={taskDraft.area} onChange={event => setTaskDraft({ ...taskDraft, area: event.target.value as DevTask['area'] })}>
                        <option value="feature">기능</option>
                        <option value="frontend">프론트</option>
                        <option value="backend">백엔드</option>
                        <option value="api">API</option>
                        <option value="deploy">배포</option>
                      </select>
                      <select value={taskDraft.priority} onChange={event => setTaskDraft({ ...taskDraft, priority: event.target.value as Priority })}>
                        <option value="high">높음</option>
                        <option value="medium">보통</option>
                        <option value="low">낮음</option>
                      </select>
                    </div>
                    <textarea value={taskDraft.detail} onChange={event => setTaskDraft({ ...taskDraft, detail: event.target.value })} placeholder="목표, 정책, 예외상황, 완료 기준" />
                    <button type="submit">명세 추가</button>
                  </form>
                </section>
                <section className="ops-board">
                  {(['todo', 'doing', 'review', 'done'] as WorkStatus[]).map(column => (
                    <div className="ops-column" key={column}>
                      <h3>{statusLabel(column)}</h3>
                      {serverTasks.filter(task => task.status === column).map(task => (
                        <article className="ops-item" key={task.id}>
                          <div><strong>{task.title}</strong><span>{task.area} · {priorityLabel(task.priority)}</span></div>
                          <p>{task.detail || '세부 내용 없음'}</p>
                          <select value={task.status} onChange={event => updateTaskStatus(task.id, event.target.value as WorkStatus)}>
                            <option value="todo">대기</option>
                            <option value="doing">진행</option>
                            <option value="review">검토</option>
                            <option value="done">완료</option>
                          </select>
                        </article>
                      ))}
                    </div>
                  ))}
                </section>
              </>
            )}
            {activeTab === 'analysis' && (
              <>
                <section className="panel-card">
                  <h2>사용자 분석</h2>
                  <form className="doc-form" onSubmit={createPersona}>
                    <input value={personaDraft.segment} onChange={event => setPersonaDraft({ ...personaDraft, segment: event.target.value })} placeholder="사용자 세그먼트" />
                    <textarea value={personaDraft.need} onChange={event => setPersonaDraft({ ...personaDraft, need: event.target.value })} placeholder="사용자가 얻고 싶은 결과" />
                    <textarea value={personaDraft.pain} onChange={event => setPersonaDraft({ ...personaDraft, pain: event.target.value })} placeholder="현재 불편한 점" />
                    <input value={personaDraft.metric} onChange={event => setPersonaDraft({ ...personaDraft, metric: event.target.value })} placeholder="성공 지표" />
                    <button type="submit">분석 추가</button>
                  </form>
                </section>
                <section className="panel-grid">
                  {serverPersonas.map(persona => (
                    <article className="panel-card" key={persona.id}>
                      <h3>{persona.segment}</h3>
                      <p><strong>Needs</strong> {persona.need || '-'}</p>
                      <p><strong>Pain</strong> {persona.pain || '-'}</p>
                      <small>{persona.metric || '지표 없음'}</small>
                    </article>
                  ))}
                </section>
              </>
            )}
            {activeTab === 'api' && (
              <>
                <section className="panel-card">
                  <h2>API 명세서</h2>
                  <form className="doc-form ops-form" onSubmit={createApiSpec}>
                    <div className="form-grid">
                      <select value={apiDraft.method} onChange={event => setApiDraft({ ...apiDraft, method: event.target.value })}>
                        {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(method => <option key={method}>{method}</option>)}
                      </select>
                      <input value={apiDraft.path} onChange={event => setApiDraft({ ...apiDraft, path: event.target.value })} placeholder="/api/example" />
                    </div>
                    <input value={apiDraft.purpose} onChange={event => setApiDraft({ ...apiDraft, purpose: event.target.value })} placeholder="용도" />
                    <textarea value={apiDraft.request} onChange={event => setApiDraft({ ...apiDraft, request: event.target.value })} placeholder="Request body / query / auth" />
                    <textarea value={apiDraft.response} onChange={event => setApiDraft({ ...apiDraft, response: event.target.value })} placeholder="Response 예시 / 에러" />
                    <button type="submit">API 추가</button>
                  </form>
                </section>
                <section className="panel-grid">
                  {serverApiSpecs.map(spec => (
                    <article className="panel-card api-card" key={spec.id}>
                      <div className="card-row"><h3><span>{spec.method}</span> {spec.path}</h3><select value={spec.status} onChange={event => updateApiStatus(spec.id, event.target.value as WorkStatus)}><option value="todo">대기</option><option value="doing">진행</option><option value="review">검토</option><option value="done">완료</option></select></div>
                      <p>{spec.purpose || '용도 없음'}</p>
                      <pre>{spec.request || 'Request 없음'}</pre>
                      <pre>{spec.response || 'Response 없음'}</pre>
                    </article>
                  ))}
                </section>
              </>
            )}
            {activeTab === 'deploy' && (
              <>
                <section className="panel-card">
                  <h2>배포 체크리스트</h2>
                  <form className="doc-form ops-form" onSubmit={createDeployCheck}>
                    <div className="form-grid">
                      <input value={deployDraft.title} onChange={event => setDeployDraft({ ...deployDraft, title: event.target.value })} placeholder="확인할 항목" />
                      <input value={deployDraft.environment} onChange={event => setDeployDraft({ ...deployDraft, environment: event.target.value })} placeholder="production" />
                    </div>
                    <textarea value={deployDraft.note} onChange={event => setDeployDraft({ ...deployDraft, note: event.target.value })} placeholder="확인 방법 또는 실패 시 조치" />
                    <button type="submit">체크 항목 추가</button>
                  </form>
                </section>
                <section className="panel-grid">
                  {serverDeployChecks.map(check => (
                    <article className={`panel-card deploy-card ${check.checked ? 'checked' : ''}`} key={check.id}>
                      <label className="check-row">
                        <input type="checkbox" checked={check.checked} onChange={() => toggleDeployCheck(check.id)} />
                        <strong>{check.title}</strong>
                      </label>
                      <p>{check.note || '확인 방법 없음'}</p>
                      <small>{check.environment}</small>
                    </article>
                  ))}
                  <article className="panel-card">
                    <h3>배포 후 Actions 확인</h3>
                    <p>{runHelpText(runs[0])}</p>
                    {serverWatches.length === 0 && <button onClick={connectDefaultRepo}>Playground 연결</button>}
                    {serverWatches.map(watch => <button key={watch.id} onClick={() => loadRuns(watch)}>{watch.fullName} 실행 확인</button>)}
                    {runs[0] && <a className="action-link" href={runs[0].htmlUrl} target="_blank" rel="noreferrer">최신 실행 열기</a>}
                  </article>
                </section>
              </>
            )}
            {(activeTab === 'frontlog' || activeTab === 'backlog') && (
              <>
                <section className="panel-card log-room-card">
                  <div className="card-row">
                    <div>
                      <span>{activeTab === 'frontlog' ? 'frontend' : 'backend'}</span>
                      <h2>{activeTab === 'frontlog' ? 'frontend log' : 'backendlog'}</h2>
                      <p>
                        {selectedServer?.githubOrg
                          ? `${selectedServer.githubOrg} Organization 기준으로 작업 로그를 확인합니다.`
                          : 'Organization을 연결하면 작업 로그를 확인할 수 있습니다.'}
                      </p>
                    </div>
                    <button onClick={() => void setupDevHubStructure()} disabled={settingUpStructure || !selectedServer?.githubOrg}>
                      {settingUpStructure ? '설정 중' : '구조 자동 설정'}
                    </button>
                  </div>
                </section>
                <section className="panel-grid">
                  {serverWatches.map(watch => (
                    <article className="panel-card" key={watch.id}>
                      <div className="card-row">
                        <h3>{watch.fullName}</h3>
                        <button onClick={() => loadRuns(watch)}>로그 불러오기</button>
                      </div>
                      <small>{activeTab === 'frontlog' ? 'frontend log source' : 'backendlog source'}</small>
                    </article>
                  ))}
                  {serverWatches.length === 0 && (
                    <article className="panel-card">
                      <h3>연결된 레포가 없습니다</h3>
                      <p>서버 이름 옆 + 버튼에서 레포 주소를 연결하거나 github-actions 채널에서 레포를 연결하세요.</p>
                    </article>
                  )}
                </section>
                {runs.length > 0 && (
                  <section className="panel-card">
                    <h2>{activeTab === 'frontlog' ? 'frontend log' : 'backendlog'}</h2>
                    {runs.map(run => (
                      <a key={run.id} className="run-row" href={run.htmlUrl} target="_blank" rel="noreferrer">
                        <span>{run.name}</span>
                        <strong>{runStateLabel(run)}</strong>
                      </a>
                    ))}
                  </section>
                )}
              </>
            )}
            {activeTab === 'work' && (
              <>
                <section className="panel-card">
                  <h2>GitHub 작업 연결</h2>
                  <form className="inline-form" onSubmit={connectRepo}>
                    <input value={repoInput} onChange={event => setRepoInput(event.target.value)} placeholder="owner/repo" />
                    <button type="submit">연결</button>
                  </form>
                  <div className="quick-actions">
                    <button type="button" onClick={connectDefaultRepo}>현재 Playground 바로 연결</button>
                    {serverWatches[0] && <button type="button" onClick={() => loadRuns(serverWatches[0])}>최신 Actions 확인</button>}
                  </div>
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
                    <p>{runHelpText(runs[0])}</p>
                    {runs.map(run => (
                      <a key={run.id} className="run-row" href={run.htmlUrl} target="_blank" rel="noreferrer">
                        <span>{run.name}</span>
                        <strong>{runStateLabel(run)}</strong>
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
                placeholder="예: my-dev-org"
                required
              />
            </label>
            <p className="modal-note">GitHub Organization 이름은 필수입니다. 만들기를 누르면 같은 이름의 GitHub Organization 생성 화면이 열리고, 기본 채널은 frontend/frontlog와 backend/backlog로 구성됩니다.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setCreateOpen(false)}>
                취소
              </button>
              <button type="submit">만들기</button>
            </div>
          </form>
        </div>
      )}

      {serverEditOpen && selectedServer && (
        <div className="modal-backdrop" onMouseDown={() => setServerEditOpen(false)}>
          <form className="create-modal" onSubmit={saveServerEdit} onMouseDown={event => event.stopPropagation()}>
            <h2>서버 정보 수정</h2>
            <p>현재 서버의 표시 이름과 연결할 GitHub 레포 주소를 수정합니다.</p>
            <label>
              서버 이름
              <input value={serverEdit.name} onChange={event => setServerEdit({ ...serverEdit, name: event.target.value })} autoFocus />
            </label>
            <label>
              레포 주소
              <input
                value={serverEdit.repoUrl}
                onChange={event => setServerEdit({ ...serverEdit, repoUrl: event.target.value })}
                placeholder="owner/repo 또는 https://github.com/owner/repo"
              />
            </label>
            <p className="modal-note">레포 주소를 저장하면 이 서버의 GitHub Actions 연결이 해당 레포로 바뀝니다.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setServerEditOpen(false)}>
                취소
              </button>
              <button type="submit">저장</button>
            </div>
          </form>
        </div>
      )}

      {forwardingMessage && (
        <div className="modal-backdrop" onMouseDown={() => setForwardingMessage(null)}>
          <div className="create-modal forward-modal" onMouseDown={event => event.stopPropagation()}>
            <h2>메시지 전달</h2>
            <p>{forwardingMessage.content}</p>
            <h3>서버 선택</h3>
            <div className="forward-target-list">
              {servers.map(server => (
                <button key={server.id} type="button" onClick={() => forwardMessage('server', server.id)}>
                  <span>{initials(server.name)}</span>
                  <strong>{server.name}</strong>
                </button>
              ))}
              {servers.length === 0 && <p className="forward-empty">전달할 서버가 없습니다.</p>}
            </div>
            <h3>DM 선택</h3>
            <div className="forward-target-list">
              {directRooms.map(room => (
                <button key={room.id} type="button" onClick={() => forwardMessage('dm', room.id)}>
                  <img src={room.avatarUrl} alt={room.name} />
                  <strong>{room.name}</strong>
                </button>
              ))}
              {directRooms.length === 0 && <p className="forward-empty">전달할 DM이 없습니다.</p>}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setForwardingMessage(null)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {pinnedOpen && (
        <div className="modal-backdrop" onMouseDown={() => setPinnedOpen(false)}>
          <div className="create-modal pinned-modal" onMouseDown={event => event.stopPropagation()}>
            <h2>고정된 메시지</h2>
            {pinnedRooms.length > 0 ? (
              <div className="pinned-room-list">
                {pinnedRooms.map(room => (
                  <section className="pinned-room" key={room.id}>
                    <h3>
                      {room.title}
                      <span>{room.subtitle}</span>
                    </h3>
                    {room.messages.map(message => (
                      <article className="pinned-message" key={message.id}>
                        <strong>{message.authorLogin}</strong>
                        <span>{formatDateTime(message.createdAt)}</span>
                        <p>{forwardedMessageIds.includes(String(message.id)) ? stripForwardPrefix(message.content) : message.content}</p>
                      </article>
                    ))}
                  </section>
                ))}
              </div>
            ) : (
              <p className="forward-empty">아직 고정된 메시지가 없습니다.</p>
            )}
            <div className="modal-actions">
              <button type="button" onClick={() => setPinnedOpen(false)}>
                닫기
              </button>
            </div>
          </div>
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
