import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

type TileKind = 'me' | 'friend' | 'repeatBot' | 'musicBot'
type AddMode = 'musicBot' | 'invite' | 'repeatBot' | null

type RoomTile = {
  id: string
  kind: TileKind
  name: string
  cameraOn?: boolean
  micOn?: boolean
  listening?: boolean
  sharing?: boolean
  url?: string
  queue?: string[]
  volume?: number
}

type FriendUser = {
  githubId: string
  login: string
  name?: string
  avatarUrl?: string
}

function App() {
  const [tiles, setTiles] = useState<RoomTile[]>([
    { id: 'me', kind: 'me', name: '나', cameraOn: false, micOn: false, listening: true, sharing: false },
  ])
  const [cameraOn, setCameraOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [listening, setListening] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>(null)
  const [contextBotId, setContextBotId] = useState<string | null>(null)
  const [roomId] = useState(() => new URLSearchParams(window.location.search).get('room') || crypto.randomUUID())
  const [incomingInvite, setIncomingInvite] = useState(() => new URLSearchParams(window.location.search).get('invitedBy'))
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false)
  const [roomStatus, setRoomStatus] = useState('로컬 데모 모드입니다. 실제 친구의 영상/음성은 아직 동기화되지 않습니다.')
  const cameraRef = useRef<HTMLVideoElement | null>(null)
  const shareRef = useRef<HTMLVideoElement | null>(null)
  const cameraStream = useRef<MediaStream | null>(null)
  const shareStream = useRef<MediaStream | null>(null)

  const botForMenu = tiles.find((tile) => tile.id === contextBotId)
  const sharingTile = tiles.find((tile) => tile.sharing)
  const visibleTiles = sharingTile ? tiles.filter((tile) => tile.id !== sharingTile.id) : tiles

  useEffect(() => {
    updateTile('me', { cameraOn, micOn, listening, sharing })
  }, [cameraOn, micOn, listening, sharing])

  useEffect(() => {
    const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  function goToPlayground() {
    window.location.href = '/'
  }

  async function copyRoomLink() {
    const url = new URL(window.location.href)
    url.searchParams.set('room', roomId)
    try {
      await navigator.clipboard.writeText(url.toString())
      setRoomStatus('방 링크를 복사했습니다. 현재 버전은 링크로 같은 방 UI를 여는 데모 모드입니다.')
    } catch {
      setRoomStatus(`복사에 실패했습니다. 방 ID: ${roomId}`)
    }
  }

  function acceptIncomingInvite() {
    if (!incomingInvite) return
    setTiles((current) => {
      if (current.some((tile) => tile.id === `friend-${incomingInvite}`)) return current
      return [
        ...current,
        { id: `friend-${incomingInvite}`, kind: 'friend', name: '초대한 친구', cameraOn: true, micOn: false, listening: true },
      ]
    })
    setIncomingInvite(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('invitedBy')
    window.history.replaceState(null, '', url.toString())
  }

  async function toggleCamera() {
    if (cameraOn) {
      stopStream(cameraStream.current)
      cameraStream.current = null
      if (cameraRef.current) cameraRef.current.srcObject = null
      setCameraOn(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      cameraStream.current = stream
      if (cameraRef.current) cameraRef.current.srcObject = stream
      setCameraError('')
      setCameraOn(true)
    } catch {
      setCameraError('카메라 권한이 필요합니다')
    }
  }

  async function toggleShare() {
    if (sharing) {
      stopStream(shareStream.current)
      shareStream.current = null
      if (shareRef.current) shareRef.current.srcObject = null
      setSharing(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      shareStream.current = stream
      stream.getVideoTracks()[0]?.addEventListener('ended', () => setSharing(false))
      if (shareRef.current) shareRef.current.srcObject = stream
      setSharing(true)
    } catch {
      setSharing(false)
    }
  }

  function updateTile(id: string, patch: Partial<RoomTile>) {
    setTiles((current) => current.map((tile) => tile.id === id ? { ...tile, ...patch } : tile))
  }

  function removeTile(id: string) {
    if (id === 'me') return
    setTiles((current) => current.filter((tile) => tile.id !== id))
    setContextBotId(null)
  }

  function createRepeatBot(url = '') {
    setTiles((current) => [
      ...current,
      { id: crypto.randomUUID(), kind: 'repeatBot', name: `봇 ${current.filter((tile) => tile.kind === 'repeatBot').length + 1}`, url, volume: 70 },
    ])
    closeAdd()
  }

  function createMusicBot(queue: string[] = []) {
    setTiles((current) => [
      ...current,
      { id: crypto.randomUUID(), kind: 'musicBot', name: '노래봇', queue, volume: 80 },
    ])
    closeAdd()
  }

  function closeAdd() {
    setAddMode(null)
    setAddMenuOpen(false)
  }

  return (
    <main className="study-room" onClick={() => setContextBotId(null)}>
      <header className="room-header">
        <button className="back-button" onClick={() => setReturnConfirmOpen(true)}>놀이터로 돌아가기</button>
        <div className="study-duration">
          <span>공부 중</span>
          <strong>{formatElapsed(elapsedSeconds)}</strong>
        </div>
      </header>

      <aside className="room-status" role="status">
        <strong>Study room</strong>
        <span>{roomStatus}</span>
        <button onClick={copyRoomLink}>방 링크 복사</button>
      </aside>

      <section className={sharingTile ? 'room-layout sharing' : 'room-layout'}>
        {sharingTile && (
          <article className="share-stage">
            <video ref={shareRef} autoPlay playsInline muted />
            <div className="share-label">화면 공유 중</div>
          </article>
        )}

        <div className="tile-grid" data-count={visibleTiles.length}>
          {visibleTiles.map((tile) => (
            <TileCard
              key={tile.id}
              tile={tile}
              cameraRef={tile.id === 'me' ? cameraRef : undefined}
              cameraError={cameraError}
              listening={listening}
              updateTile={updateTile}
              removeTile={removeTile}
              openBotMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (tile.kind === 'repeatBot' || tile.kind === 'musicBot') setContextBotId(tile.id)
              }}
            />
          ))}
        </div>
      </section>

      <button className="quick-invite" onClick={() => setAddMode('invite')} aria-label="친구 초대">
        <span className="people-icon" aria-hidden />
        <b>+</b>
      </button>

      <nav className="call-controls" onClick={(event) => event.stopPropagation()}>
        <div className="control-pack">
          <button className={!micOn ? 'danger' : ''} onClick={() => setMicOn((value) => !value)} title="마이크">
            {micOn ? 'Mic' : 'Mic off'}
          </button>
          <button className={!cameraOn ? 'off' : ''} onClick={toggleCamera} title="카메라">
            {cameraOn ? 'Cam' : 'Cam off'}
          </button>
        </div>

        <div className="control-pack">
          <button className={sharing ? 'active' : ''} onClick={toggleShare} title="화면 공유">Share</button>
          <div className="add-control">
            <button className="add-trigger" onClick={() => setAddMenuOpen((value) => !value)} title="추가">+</button>
            {addMenuOpen && (
              <div className="add-menu">
                <button onClick={() => setAddMode('musicBot')}>노래봇</button>
                <button onClick={() => setAddMode('invite')}>친구 초대하기</button>
                <button onClick={() => setAddMode('repeatBot')}>봇 추가하기</button>
              </div>
            )}
          </div>
          <button className={!listening ? 'off' : ''} onClick={() => setListening((value) => !value)} title="소리 듣기">
            {listening ? 'Sound' : 'Muted'}
          </button>
        </div>

        <button className="leave-button" title="나가기" onClick={() => setReturnConfirmOpen(true)}>Call end</button>
      </nav>

      {addMode && (
        <AddDialog
          mode={addMode}
          roomId={roomId}
          createRepeatBot={createRepeatBot}
          createMusicBot={createMusicBot}
          close={closeAdd}
        />
      )}

      {incomingInvite && (
        <div className="dialog-backdrop" onClick={() => setIncomingInvite(null)}>
          <section className="dialog" onClick={(event) => event.stopPropagation()}>
            <h2>가상 독서실 초대</h2>
            <p>친구가 같이 공부하자고 초대했습니다. 수락하면 이 방에 참가합니다.</p>
            <button className="primary" onClick={acceptIncomingInvite}>수락하고 참가</button>
            <button onClick={() => setIncomingInvite(null)}>거절</button>
          </section>
        </div>
      )}

      {returnConfirmOpen && (
        <div className="dialog-backdrop" onClick={() => setReturnConfirmOpen(false)}>
          <section className="dialog" onClick={(event) => event.stopPropagation()}>
            <h2>놀이터로 돌아갈까요?</h2>
            <p>현재 가상 독서실 화면을 나가고 놀이터 메인으로 이동합니다.</p>
            <button className="primary" onClick={goToPlayground}>돌아가기</button>
            <button onClick={() => setReturnConfirmOpen(false)}>계속 있기</button>
          </section>
        </div>
      )}

      {botForMenu && (
        <BotMenu
          bot={botForMenu}
          updateTile={updateTile}
          removeTile={removeTile}
        />
      )}
    </main>
  )
}

function TileCard({
  tile,
  cameraRef,
  cameraError,
  listening,
  updateTile,
  removeTile,
  openBotMenu,
}: {
  tile: RoomTile
  cameraRef?: React.RefObject<HTMLVideoElement | null>
  cameraError: string
  listening: boolean
  updateTile: (id: string, patch: Partial<RoomTile>) => void
  removeTile: (id: string) => void
  openBotMenu: (event: React.MouseEvent) => void
}) {
  return (
    <article className={`tile-card ${tile.kind}`} onContextMenu={openBotMenu}>
      {tile.kind === 'me' && <CameraTile tile={tile} cameraRef={cameraRef} cameraError={cameraError} />}
      {tile.kind === 'friend' && <FriendTile tile={tile} updateTile={updateTile} />}
      {tile.kind === 'repeatBot' && <RepeatBotTile tile={tile} listening={listening} updateTile={updateTile} />}
      {tile.kind === 'musicBot' && <MusicBotTile tile={tile} listening={listening} updateTile={updateTile} />}

      {(tile.kind === 'repeatBot' || tile.kind === 'musicBot') && (
        <button className="tile-delete" onClick={() => removeTile(tile.id)} aria-label="삭제">x</button>
      )}

      <div className="tile-footer">
        <strong>{tile.name}</strong>
        <span>{tileStatus(tile)}</span>
      </div>
    </article>
  )
}

function CameraTile({
  tile,
  cameraRef,
  cameraError,
}: {
  tile: RoomTile
  cameraRef?: React.RefObject<HTMLVideoElement | null>
  cameraError: string
}) {
  return (
    <div className="camera-tile">
      <video ref={cameraRef} autoPlay playsInline muted />
      {!tile.cameraOn && (
        <div className="camera-placeholder">
          <span>나</span>
          <small>{cameraError || '카메라 꺼짐'}</small>
        </div>
      )}
    </div>
  )
}

function FriendTile({
  tile,
  updateTile,
}: {
  tile: RoomTile
  updateTile: (id: string, patch: Partial<RoomTile>) => void
}) {
  return (
    <div className="friend-tile">
      {tile.cameraOn ? (
        <div className="study-avatar">
          <span className="head" />
          <span className="body" />
          <span className="desk" />
          <span className="book" />
        </div>
      ) : (
        <div className="camera-placeholder">
          <span>{tile.name.slice(0, 1)}</span>
          <small>카메라 꺼짐</small>
        </div>
      )}
      <div className="mini-controls">
        <button onClick={() => updateTile(tile.id, { cameraOn: !tile.cameraOn })}>캠</button>
        <button onClick={() => updateTile(tile.id, { micOn: !tile.micOn })}>마이크</button>
      </div>
    </div>
  )
}

function RepeatBotTile({
  tile,
  listening,
  updateTile,
}: {
  tile: RoomTile
  listening: boolean
  updateTile: (id: string, patch: Partial<RoomTile>) => void
}) {
  const src = useMemo(() => toYoutubeEmbed(tile.url, { loop: true, muted: !listening || (tile.volume ?? 70) === 0 }), [tile.url, listening, tile.volume])

  return (
    <div className="bot-tile">
      {src ? (
        <YoutubeFrame src={src} volume={listening ? tile.volume ?? 70 : 0} title={tile.name} />
      ) : (
        <label className="link-panel">
          <b>반복 봇</b>
          <span>유튜브 링크를 넣으면 이 화면에서 무한 반복됩니다.</span>
          <input
            value={tile.url ?? ''}
            onChange={(event) => updateTile(tile.id, { url: event.target.value })}
            placeholder="https://youtu.be/..."
          />
        </label>
      )}
    </div>
  )
}

function MusicBotTile({
  tile,
  listening,
  updateTile,
}: {
  tile: RoomTile
  listening: boolean
  updateTile: (id: string, patch: Partial<RoomTile>) => void
}) {
  const [draft, setDraft] = useState('')
  const [index, setIndex] = useState(0)
  const queue = tile.queue ?? []
  const currentUrl = queue[index % Math.max(queue.length, 1)]
  const src = useMemo(() => toYoutubeEmbed(currentUrl, { muted: !listening || (tile.volume ?? 80) === 0 }), [currentUrl, listening, tile.volume])

  function addSong() {
    if (!draft.trim()) return
    updateTile(tile.id, { queue: [...queue, draft.trim()] })
    setDraft('')
  }

  function removeSong(songIndex: number) {
    const nextQueue = queue.filter((_, itemIndex) => itemIndex !== songIndex)
    updateTile(tile.id, { queue: nextQueue })
    setIndex(0)
  }

  return (
    <div className="music-tile">
      <div className="music-player">
        {src ? (
          <YoutubeFrame src={src} volume={listening ? tile.volume ?? 80 : 0} title={tile.name} />
        ) : (
          <div className="music-empty">
            <b>노래봇</b>
            <span>유튜브 링크를 추가하면 플레이리스트로 재생됩니다.</span>
          </div>
        )}
      </div>
      <form
        className="song-form"
        onSubmit={(event) => {
          event.preventDefault()
          addSong()
        }}
      >
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="노래 유튜브 링크" />
        <button>추가</button>
        <button type="button" onClick={() => setIndex((value) => value + 1)} disabled={!queue.length}>다음</button>
      </form>
      <div className="queue-list">
        {queue.map((song, songIndex) => (
          <button
            key={`${song}-${songIndex}`}
            className={songIndex === index % Math.max(queue.length, 1) ? 'playing' : ''}
            onClick={() => setIndex(songIndex)}
            onContextMenu={(event) => {
              event.preventDefault()
              removeSong(songIndex)
            }}
          >
            {songIndex + 1}. {getYoutubeId(song) || song}
          </button>
        ))}
      </div>
    </div>
  )
}

function YoutubeFrame({ src, volume, title }: { src: string; volume: number; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    const frame = iframeRef.current
    if (!frame?.contentWindow) return
    frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [volume] }), '*')
    frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*')
  }, [src, volume])

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title}
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
    />
  )
}

function AddDialog({
  mode,
  roomId,
  createRepeatBot,
  createMusicBot,
  close,
}: {
  mode: AddMode
  roomId: string
  createRepeatBot: (url?: string) => void
  createMusicBot: (queue?: string[]) => void
  close: () => void
}) {
  const [url, setUrl] = useState('')
  const [friends, setFriends] = useState<FriendUser[]>([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [inviteStatus, setInviteStatus] = useState('')

  useEffect(() => {
    if (mode !== 'invite') return
    setLoadingFriends(true)
    setInviteStatus('')
    fetch('/api/friends', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('친구 목록을 불러오지 못했습니다')))
      .then((data: FriendUser[]) => setFriends(data))
      .catch((error) => setInviteStatus(error instanceof Error ? error.message : '친구 목록을 불러오지 못했습니다'))
      .finally(() => setLoadingFriends(false))
  }, [mode])

  async function sendRoomInvite(friend: FriendUser) {
    setInviteStatus(`${friend.name || friend.login}님에게 초대 알림을 보내는 중입니다.`)
    try {
      const response = await fetch('/api/virtual-study-room/invite', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: friend.githubId, roomId }),
      })
      if (!response.ok) throw new Error(await response.text())
      setInviteStatus(`${friend.name || friend.login}님에게 초대 알림을 보냈습니다.`)
    } catch (error) {
      setInviteStatus(error instanceof Error ? error.message : '초대 알림을 보내지 못했습니다')
    }
  }

  return (
    <div className="dialog-backdrop" onClick={close}>
      <section className="dialog" onClick={(event) => event.stopPropagation()}>
        <button className="dialog-close" onClick={close} aria-label="닫기">x</button>
        {mode === 'repeatBot' && (
          <>
            <h2>봇 추가하기</h2>
            <p>추가된 화면에 유튜브 링크를 넣으면 영상이 무한 반복됩니다.</p>
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://youtu.be/..." />
            <button className="primary" onClick={() => createRepeatBot(url)}>봇 화면 추가</button>
          </>
        )}
        {mode === 'musicBot' && (
          <>
            <h2>노래봇</h2>
            <p>유튜브 링크를 플레이리스트에 넣고 소리 나게 재생합니다.</p>
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="첫 번째 노래 링크" />
            <button className="primary" onClick={() => createMusicBot(url.trim() ? [url.trim()] : [])}>노래봇 추가</button>
          </>
        )}
        {mode === 'invite' && (
          <>
            <h2>친구 초대하기</h2>
            <p>놀이터 친구 목록에서 초대할 사람을 선택하세요. 친구인 사용자에게만 초대 알림을 보낼 수 있습니다.</p>
            {loadingFriends ? (
              <p>친구 목록을 불러오는 중입니다.</p>
            ) : friends.length === 0 ? (
              <p>초대할 친구가 없습니다. 놀이터 친구 기능에서 친구를 먼저 추가해주세요.</p>
            ) : (
              <div className="invite-friend-list">
                {friends.map((friend) => (
                  <div className="invite-friend" key={friend.githubId}>
                    {friend.avatarUrl ? <img src={friend.avatarUrl} alt={friend.login} /> : <span>{(friend.name || friend.login).slice(0, 1)}</span>}
                    <div>
                      <strong>{friend.name || friend.login}</strong>
                      <small>@{friend.login}</small>
                    </div>
                    <button onClick={() => sendRoomInvite(friend)}>초대</button>
                  </div>
                ))}
              </div>
            )}
            {inviteStatus && <p className="invite-status">{inviteStatus}</p>}
          </>
        )}
      </section>
    </div>
  )
}

function BotMenu({
  bot,
  updateTile,
  removeTile,
}: {
  bot: RoomTile
  updateTile: (id: string, patch: Partial<RoomTile>) => void
  removeTile: (id: string) => void
}) {
  return (
    <aside className="bot-context" onClick={(event) => event.stopPropagation()}>
      <strong>{bot.name}</strong>
      <label>
        소리 {bot.volume ?? 80}%
        <input
          type="range"
          min="0"
          max="100"
          value={bot.volume ?? 80}
          onChange={(event) => updateTile(bot.id, { volume: Number(event.target.value) })}
        />
      </label>
      <button onClick={() => removeTile(bot.id)}>삭제</button>
    </aside>
  )
}

function tileStatus(tile: RoomTile) {
  if (tile.kind === 'repeatBot') return `반복 재생 · ${tile.volume ?? 70}%`
  if (tile.kind === 'musicBot') return `플레이리스트 ${(tile.queue ?? []).length}곡 · ${tile.volume ?? 80}%`
  if (tile.sharing) return '화면 공유 중'
  if (!tile.cameraOn) return '카메라 꺼짐'
  if (!tile.micOn) return '마이크 꺼짐'
  return '공부 중'
}

function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}시간 ${minutes}분`
  if (minutes > 0) return `${minutes}분 ${String(seconds).padStart(2, '0')}초`
  return `${seconds}초`
}

function toYoutubeEmbed(url: string | undefined, options: { loop?: boolean; muted?: boolean } = {}) {
  const id = getYoutubeId(url)
  if (!id) return ''
  const params = new URLSearchParams({
    autoplay: '1',
    controls: '1',
    enablejsapi: '1',
    playsinline: '1',
    rel: '0',
    mute: options.muted ? '1' : '0',
  })
  if (options.loop) {
    params.set('loop', '1')
    params.set('playlist', id)
  }
  return `https://www.youtube.com/embed/${id}?${params.toString()}`
}

function getYoutubeId(url?: string) {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.replace('/', '')
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.split('/')[2]
      if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.split('/')[2]
      return parsed.searchParams.get('v') ?? ''
    }
  } catch {
    return ''
  }
  return ''
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

createRoot(document.getElementById('root')!).render(<App />)
