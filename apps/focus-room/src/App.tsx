import { useEffect, useMemo, useRef, useState } from 'react'

type PlaceId = 'study-cafe' | 'classroom' | 'cafe' | 'library' | 'night-reading' | 'park' | 'train' | 'rain-cafe'
type ScreenId = 'notion' | 'pdf' | 'chatgpt' | 'youtube' | 'vscode' | 'ide' | 'docs'
type TimeId = 'morning' | 'noon' | 'evening' | 'dawn'
type WeatherId = 'sunny' | 'rain' | 'snow' | 'cloudy'

interface Place {
  id: PlaceId
  icon: string
  name: string
  description: string
  accent: string
  wall: string
  floor: string
}

const PLACES: Place[] = [
  { id: 'study-cafe', icon: '6', name: '스터디카페', description: '칸막이 좌석, 조용한 키보드 소리, 개인 스탠드', accent: '#5dd0a0', wall: '#27313a', floor: '#33271f' },
  { id: 'classroom', icon: '□', name: '학교 교실', description: '창가 책상, 칠판, 복도에서 들리는 낮은 발소리', accent: '#7fb3ff', wall: '#d9d2b8', floor: '#5a4939' },
  { id: 'cafe', icon: '☕', name: '카페', description: '커피 바, 큰 창문, 잔잔한 대화와 컵 소리', accent: '#ffb35c', wall: '#3b3130', floor: '#4a3328' },
  { id: 'library', icon: '▤', name: '도서관', description: '서가 사이 나무 책상, 페이지 넘기는 소리', accent: '#9cc3ff', wall: '#33423b', floor: '#46382b' },
  { id: 'night-reading', icon: '◐', name: '야간 독서실', description: '어두운 칸막이와 노란 독서등만 남은 자리', accent: '#a8a5ff', wall: '#151923', floor: '#1e1b24' },
  { id: 'park', icon: '♧', name: '공원 벤치', description: '벤치 앞 작은 테이블, 바람과 나무 그림자', accent: '#9ee493', wall: '#54735d', floor: '#39513c' },
  { id: 'train', icon: '✈', name: '기차', description: '좌석 테이블, 창밖으로 흐르는 풍경과 레일 소리', accent: '#98c1d9', wall: '#38495e', floor: '#293241' },
  { id: 'rain-cafe', icon: '☔', name: '빗소리 카페', description: '비 내리는 창가, 따뜻한 조명, 조용한 카페', accent: '#67e8f9', wall: '#263443', floor: '#2f2d35' },
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

function App() {
  const [placeId, setPlaceId] = useState<PlaceId>('study-cafe')
  const [screenId, setScreenId] = useState<ScreenId>('notion')
  const [timeId, setTimeId] = useState<TimeId>('evening')
  const [weatherId, setWeatherId] = useState<WeatherId>('rain')
  const [entered, setEntered] = useState(false)
  const [yaw, setYaw] = useState(0)
  const [focusMinutes, setFocusMinutes] = useState(50)
  const [secondsLeft, setSecondsLeft] = useState(50 * 60)
  const [running, setRunning] = useState(false)
  const [warning, setWarning] = useState(false)
  const dragRef = useRef({ active: false, x: 0, yaw: 0 })

  const place = PLACES.find((item) => item.id === placeId) ?? PLACES[0]
  const screen = SCREENS[screenId]
  const wrappedYaw = ((yaw % 360) + 360) % 360
  const frontDistance = Math.min(Math.abs(wrappedYaw), Math.abs(360 - wrappedYaw))
  const lookingAtDesk = frontDistance < 54
  const deskOpacity = Math.max(0, 1 - frontDistance / 62)
  const deskScale = 0.9 + deskOpacity * 0.1
  const deskDrop = (1 - deskOpacity) * 14
  const panoX = -(wrappedYaw / 90) * 100

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
    if (!warning) return
    const timeout = window.setTimeout(() => setWarning(false), 2200)
    return () => window.clearTimeout(timeout)
  }, [warning])

  const timeText = useMemo(() => {
    const minutes = Math.floor(secondsLeft / 60)
    const seconds = secondsLeft % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }, [secondsLeft])

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    dragRef.current = { active: true, x: event.clientX, yaw }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current.active) return
    const delta = event.clientX - dragRef.current.x
    setYaw(dragRef.current.yaw - delta * 0.18)
  }

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    dragRef.current.active = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const enterRoom = () => {
    setEntered(true)
    setYaw(0)
    setRunning(true)
  }

  const leaveRoom = () => {
    setEntered(false)
    setRunning(false)
  }

  const outsideFocus = () => {
    if (entered && lookingAtDesk) setWarning(true)
  }

  return (
    <main
      className={`focus-room is-${placeId} is-${timeId} is-${weatherId} ${entered ? 'entered' : 'selecting'} ${lookingAtDesk ? 'looking-front' : 'looking-away'}`}
      style={{
        '--yaw': `${yaw}deg`,
        '--pano-x': `${panoX}vw`,
        '--desk-opacity': deskOpacity.toFixed(3),
        '--desk-scale': deskScale.toFixed(3),
        '--desk-drop': `${deskDrop.toFixed(2)}vh`,
        '--sky-offset': `${-yaw * 5}px`,
        '--accent': place.accent,
        '--wall': place.wall,
        '--floor': place.floor,
      } as React.CSSProperties}
    >
      {!entered && (
        <section className="place-select">
          <a className="back-link" href="/">← 놀이터</a>
          <div className="intro">
            <span>Immersive Focus Seat</span>
            <h1>내가 그 자리에 앉아있는 360도 공부 공간</h1>
            <p>장소를 고르면 시점이 의자에 고정됩니다. 마우스를 드래그해서 주변을 둘러보고, 앞의 노트북으로 공부합니다.</p>
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
            className="pov-stage"
            aria-label={`${place.name} 좌석 360도 시점`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={outsideFocus}
          >
            <div className="pano-world">
              <div className="view view-front">
                <div className="window-panel"><span>{WEATHER[weatherId]}</span></div>
                <div className="ambient-person person-left" />
                <div className="ambient-person person-right" />
              </div>
              <div className="view view-right">
                <div className="bookshelf" />
                <div className="side-table" />
              </div>
              <div className="view view-back">
                <div className="distant-counter" />
                <div className="moving-shadow" />
              </div>
              <div className="view view-left">
                <div className="bookshelf wide" />
                <div className="ambient-person reading" />
              </div>
              <div className="view view-front view-front-copy">
                <div className="window-panel"><span>{WEATHER[weatherId]}</span></div>
                <div className="ambient-person person-left" />
                <div className="ambient-person person-right" />
              </div>
            </div>
            <div className="ceiling" />
            <div className="floor-plane" />
            <div className="weather-layer" />

            <div className="desk-pov" onClick={(event) => event.stopPropagation()}>
              <div className="left-hand" />
              <div className="right-hand" />
              <div className="coffee-cup" />
              <div className="pen-tray" />
              <div className="study-book" />
              <div className="sticky-note">
                <strong>오늘 목표</strong>
                <span>React Query</span>
                <span>코테 2문제</span>
                <span>컴활</span>
              </div>
              <div className="laptop-pov">
                <div className="laptop-lid">
                  <div className="browser-strip">
                    <i />
                    <i />
                    <i />
                    <strong>{screen.label}</strong>
                  </div>
                  <div className="study-screen">
                    <div className="cursor" />
                    <header>
                      <strong>{screen.title}</strong>
                      <em>{timeText}</em>
                    </header>
                    <div className="screen-content">
                      {screen.items.map((item) => <span key={item}>{item}</span>)}
                    </div>
                    <button onClick={leaveRoom}>나가기</button>
                  </div>
                </div>
                <div className="laptop-keyboard" />
              </div>
            </div>

            {!lookingAtDesk && <div className="turn-hint">앞쪽으로 돌리면 책상과 노트북이 다시 보입니다</div>}
            {warning && <div className="focus-warning">집중하세요. 공부는 앞의 노트북에서 진행됩니다.</div>}
          </section>

          <aside className="hud">
            <div className="hud-top">
              <button onClick={leaveRoom}>나가기</button>
              <span>{place.name}</span>
              <strong>{Math.round(wrappedYaw)}°</strong>
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
