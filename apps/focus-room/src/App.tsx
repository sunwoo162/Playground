import { useEffect, useMemo, useRef, useState } from 'react'
import cafePanorama from './assets/cafe-panorama.png'
import classroomPanorama from './assets/classroom-panorama.png'
import libraryPanorama from './assets/library-panorama.png'
import nightReadingPanorama from './assets/night-reading-panorama.png'
import parkPanorama from './assets/park-panorama.png'
import rainCafePanorama from './assets/rain-cafe-panorama.png'
import studyCafePanorama from './assets/study-cafe-panorama.png'
import trainPanorama from './assets/train-panorama.png'

type PlaceId = 'study-cafe' | 'classroom' | 'cafe' | 'library' | 'night-reading' | 'park' | 'train' | 'rain-cafe'
type ScreenId = 'notion' | 'pdf' | 'chatgpt' | 'youtube' | 'vscode' | 'ide' | 'docs'
type TimeId = 'morning' | 'noon' | 'evening' | 'dawn'
type WeatherId = 'sunny' | 'rain' | 'snow' | 'cloudy'

interface Place {
  id: PlaceId
  icon: string
  name: string
  description: string
  tint: string
}

const PLACES: Place[] = [
  { id: 'study-cafe', icon: '6', name: '스터디카페', description: '칸막이 좌석, 노트북, 커피, 조용한 램프가 있는 현실적인 공부 자리', tint: '#d7a45c' },
  { id: 'classroom', icon: '□', name: '학교 교실', description: '교실 책상에 앉아 노트북으로 공부하는 시점', tint: '#d8c891' },
  { id: 'cafe', icon: '☕', name: '카페', description: '카페 창가 좌석에서 공부하는 시점', tint: '#d49a62' },
  { id: 'library', icon: '▤', name: '도서관', description: '서가가 보이는 조용한 나무 책상 자리', tint: '#b7c7a1' },
  { id: 'night-reading', icon: '◐', name: '야간 독서실', description: '어두운 독서실에서 램프만 켜진 자리', tint: '#8f92c9' },
  { id: 'park', icon: '♧', name: '공원 벤치', description: '야외 벤치에서 노트북을 펼친 시점', tint: '#9abd7d' },
  { id: 'train', icon: '✈', name: '기차', description: '좌석 테이블 위 노트북과 창밖 풍경', tint: '#8eaeca' },
  { id: 'rain-cafe', icon: '☔', name: '빗소리 카페', description: '비 내리는 창가 카페에서 공부하는 시점', tint: '#7fcbd4' },
]

const SCREENS: Record<ScreenId, { label: string; title: string; items: string[] }> = {
  notion: { label: 'Notion', title: '오늘 공부 대시보드', items: ['React Query 3시간', '코테 2문제', '컴활 필기 정리'] },
  pdf: { label: 'PDF', title: '강의자료.pdf', items: ['18쪽 핵심 개념', '예제 4번 풀이', '오답 표시'] },
  chatgpt: { label: 'ChatGPT', title: 'AI 튜터', items: ['시간복잡도 질문', '개념 요약', '암기 문장 생성'] },
  youtube: { label: '강의', title: '온라인 강의', items: ['00:18:42', '개념 설명 구간', '필기 모드'] },
  vscode: { label: 'VSCode', title: 'VSCode Web', items: ['src/App.tsx', 'useTimer.ts', 'npm run build'] },
  ide: { label: 'IDE', title: '온라인 IDE', items: ['예제 입력 실행', '시간 제한 확인', '제출 준비'] },
  docs: { label: '문서', title: 'Google Docs', items: ['보고서 목차', '자료 출처', '최종 문장'] },
}

const TIMES: Record<TimeId, string> = { morning: '아침', noon: '점심', evening: '저녁', dawn: '새벽' }
const WEATHER: Record<WeatherId, string> = { sunny: '맑음', rain: '비', snow: '눈', cloudy: '흐림' }
const PLACE_PANORAMAS: Record<PlaceId, string> = {
  'study-cafe': studyCafePanorama,
  classroom: classroomPanorama,
  cafe: cafePanorama,
  library: libraryPanorama,
  'night-reading': nightReadingPanorama,
  park: parkPanorama,
  train: trainPanorama,
  'rain-cafe': rainCafePanorama,
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function App() {
  const [placeId, setPlaceId] = useState<PlaceId>('study-cafe')
  const [screenId, setScreenId] = useState<ScreenId>('notion')
  const [timeId, setTimeId] = useState<TimeId>('evening')
  const [weatherId, setWeatherId] = useState<WeatherId>('sunny')
  const [entered, setEntered] = useState(false)
  const [locked, setLocked] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [yaw, setYaw] = useState(0)
  const [pitch, setPitch] = useState(0)
  const [viewYaw, setViewYaw] = useState(0)
  const [viewPitch, setViewPitch] = useState(0)
  const [focusMinutes, setFocusMinutes] = useState(50)
  const [secondsLeft, setSecondsLeft] = useState(50 * 60)
  const [running, setRunning] = useState(false)
  const dragRef = useRef({ active: false, x: 0, y: 0, yaw: 0, pitch: 0 })
  const stageRef = useRef<HTMLElement | null>(null)

  const place = PLACES.find((item) => item.id === placeId) ?? PLACES[0]
  const screen = SCREENS[screenId]
  const panorama = PLACE_PANORAMAS[placeId]
  const wrappedYaw = ((viewYaw % 360) + 360) % 360
  const frontDistance = Math.min(Math.abs(wrappedYaw), Math.abs(360 - wrappedYaw))
  const laptopFocus = frontDistance < 54 && Math.abs(viewPitch) < 38
    ? Math.max(0, 1 - frontDistance / 42) * Math.max(0, 1 - Math.abs(viewPitch) / 34)
    : 0
  const panoramaX = 50 - wrappedYaw / 360 * 100
  const panoramaY = clamp(50 + viewPitch * 0.72, 6, 94)

  useEffect(() => {
    let frameId = 0
    const render = () => {
      setViewYaw((value) => value + (yaw - value) * 0.18)
      setViewPitch((value) => value + (pitch - value) * 0.18)
      frameId = window.requestAnimationFrame(render)
    }
    frameId = window.requestAnimationFrame(render)
    return () => window.cancelAnimationFrame(frameId)
  }, [yaw, pitch])

  useEffect(() => {
    setSecondsLeft(focusMinutes * 60)
    setRunning(false)
  }, [focusMinutes, placeId])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          setRunning(false)
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running])

  useEffect(() => {
    const onPointerLockChange = () => {
      setLocked(document.pointerLockElement === stageRef.current)
    }
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== stageRef.current) return
      setYaw((value) => value + event.movementX * 0.09)
      setPitch((value) => clamp(value - event.movementY * 0.09, -58, 62))
    }
    document.addEventListener('pointerlockchange', onPointerLockChange)
    document.addEventListener('mousemove', onMouseMove)
    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      document.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  const timeText = useMemo(() => {
    const minutes = Math.floor(secondsLeft / 60)
    const seconds = secondsLeft % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }, [secondsLeft])

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest('.hud, .screen-overlay')) return
    if (document.pointerLockElement !== event.currentTarget) {
      event.currentTarget.requestPointerLock?.()
    }
    dragRef.current = { active: true, x: event.clientX, y: event.clientY, yaw, pitch }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current.active || document.pointerLockElement === event.currentTarget) return
    const dx = event.clientX - dragRef.current.x
    const dy = event.clientY - dragRef.current.y
    setYaw(dragRef.current.yaw - dx * 0.13)
    setPitch(clamp(dragRef.current.pitch - dy * 0.13, -58, 62))
  }

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    dragRef.current.active = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const enterRoom = () => {
    setEntered(true)
    setMenuOpen(false)
    setYaw(0)
    setPitch(0)
    setViewYaw(0)
    setViewPitch(0)
    setRunning(true)
  }

  const leaveRoom = () => {
    setEntered(false)
    setRunning(false)
  }

  return (
    <main
      className={`focus-room is-${placeId} is-${timeId} is-${weatherId} ${entered ? 'entered' : 'selecting'}`}
      style={{
        '--pitch': `${viewPitch.toFixed(2)}deg`,
        '--yaw': `${viewYaw.toFixed(2)}deg`,
        '--laptop-focus': laptopFocus.toFixed(3),
        '--place-tint': place.tint,
        '--panorama-image': `url(${panorama})`,
        '--panorama-x': `${panoramaX.toFixed(3)}%`,
        '--panorama-y': `${panoramaY.toFixed(3)}%`,
      } as React.CSSProperties}
    >
      {!entered && (
        <section className="place-select">
          <a className="back-link" href="/">← 놀이터</a>
          <div className="intro">
            <span>Immersive Focus Seat</span>
            <h1>진짜 자리에 앉은 것처럼 공부하는 공간</h1>
            <p>입장하면 시점은 내 눈높이에 고정됩니다. 마우스를 드래그해서 위, 아래, 좌우, 대각선으로 둘러보세요.</p>
          </div>
          <div className="place-cards">
            {PLACES.map((item) => (
              <button key={item.id} className={item.id === placeId ? 'active' : ''} onClick={() => setPlaceId(item.id)}>
                <b>{item.icon}</b>
                <strong>{item.name}</strong>
                <small>{item.description}</small>
              </button>
            ))}
          </div>
          <div className="start-panel">
            <div>
              <strong>{place.name}</strong>
              <span>{place.description}</span>
            </div>
            <button onClick={enterRoom}>자리에 앉기</button>
          </div>
        </section>
      )}

      {entered && (
        <>
          <section
            ref={stageRef}
            className="immersive-stage"
            aria-label={`${place.name} 현실형 1인칭 공부 시점`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="panorama-layer panorama-a" />
            <div className="panorama-layer panorama-b" />
            <div className="scene-grade" />
            <div className="weather-overlay" />
            <div className="look-shadow" />

            {laptopFocus > 0.02 && (
              <div className="screen-overlay">
                <div className="fake-browser">
                  <div className="browser-top">
                    <i />
                    <i />
                    <i />
                    <strong>{screen.label}</strong>
                  </div>
                  <div className="web-page">
                    <div className="cursor" />
                    <header>
                      <strong>{screen.title}</strong>
                      <em>{timeText}</em>
                    </header>
                    <div className="screen-list">
                      {screen.items.map((item) => <span key={item}>{item}</span>)}
                    </div>
                    <button onClick={leaveRoom}>나가기</button>
                  </div>
                </div>
              </div>
            )}

            <div className="crosshair" />
            <div className="look-help">{locked ? '마우스로 둘러보기 · ESC 해제' : '화면 클릭 후 마우스로 둘러보기'}</div>
          </section>

          <aside className={`hud ${menuOpen ? 'open' : ''}`}>
            <div className="hud-top">
              <button onClick={leaveRoom}>나가기</button>
              <span>{place.name}</span>
              <strong>{Math.round(wrappedYaw)}° / {Math.round(viewPitch)}°</strong>
              <button onClick={() => setMenuOpen((value) => !value)}>설정</button>
            </div>
            <div className="hud-controls">
              <select value={screenId} onChange={(event) => setScreenId(event.target.value as ScreenId)}>
                {Object.entries(SCREENS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
              </select>
              <select value={timeId} onChange={(event) => setTimeId(event.target.value as TimeId)}>
                {Object.entries(TIMES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <select value={weatherId} onChange={(event) => setWeatherId(event.target.value as WeatherId)}>
                {Object.entries(WEATHER).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <select value={focusMinutes} onChange={(event) => setFocusMinutes(Number(event.target.value))}>
                <option value={25}>25분</option>
                <option value={50}>50분</option>
                <option value={90}>90분</option>
              </select>
            </div>
            <button className="timer-button" onClick={() => setRunning((value) => !value)}>
              <span>{running ? '집중 중' : '일시정지'}</span>
              <strong>{timeText}</strong>
            </button>
          </aside>
        </>
      )}
    </main>
  )
}

export default App
