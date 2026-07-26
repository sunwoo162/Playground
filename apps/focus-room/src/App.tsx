import { useEffect, useMemo, useState } from 'react'

type PlaceId = 'study-cafe' | 'classroom' | 'cafe' | 'library' | 'night-reading' | 'park' | 'train' | 'rain-cafe'
type ScreenId = 'notion' | 'pdf' | 'chatgpt' | 'youtube' | 'vscode' | 'ide' | 'docs'
type TimeId = 'morning' | 'noon' | 'evening' | 'dawn'
type WeatherId = 'sunny' | 'rain' | 'snow' | 'cloudy'
type LightId = 'bright' | 'warm' | 'night' | 'desk'
type SeatId = 'window' | 'inside' | 'double' | 'solo'

interface Place {
  id: PlaceId
  icon: string
  name: string
  mood: string
  cue: string
  palette: {
    floor: string
    wall: string
    accent: string
    light: string
  }
}

const PLACES: Place[] = [
  { id: 'study-cafe', icon: '6', name: '스터디카페', mood: '칸막이 좌석과 조용한 백색소음', cue: '옆자리 키보드 소리와 낮은 책장', palette: { floor: '#33271f', wall: '#28313a', accent: '#5dd0a0', light: '#f6d28c' } },
  { id: 'classroom', icon: '□', name: '학교 교실', mood: '수업 전 빈 교실의 집중감', cue: '칠판, 창가 책상, 복도 발소리', palette: { floor: '#44514a', wall: '#e7e0c8', accent: '#3b82f6', light: '#fff1b8' } },
  { id: 'cafe', icon: '☕', name: '카페', mood: '잔잔한 대화와 컵 내려놓는 소리', cue: '커피 바, 큰 창문, 테이블 조명', palette: { floor: '#4a3328', wall: '#3b3130', accent: '#ffb35c', light: '#ffd6a1' } },
  { id: 'library', icon: '▤', name: '도서관', mood: '책장 사이에 앉은 정숙한 분위기', cue: '서가, 나무 책상, 페이지 넘기는 소리', palette: { floor: '#46382b', wall: '#33423b', accent: '#7fb3ff', light: '#fff3bd' } },
  { id: 'night-reading', icon: '◐', name: '야간 독서실', mood: '독서등만 켜진 깊은 밤 집중석', cue: '어두운 복도, 작은 스탠드, 조용한 숨소리', palette: { floor: '#1e1b24', wall: '#151923', accent: '#9ca3ff', light: '#f7c66b' } },
  { id: 'park', icon: '♧', name: '공원 벤치', mood: '야외 공기와 가벼운 바람', cue: '나무 그림자, 산책로, 멀리 들리는 도시 소리', palette: { floor: '#39513c', wall: '#54735d', accent: '#9ee493', light: '#fff2a6' } },
  { id: 'train', icon: '✈', name: '기차', mood: '창밖 풍경이 흐르는 이동 중 공부', cue: '좌석 테이블, 레일 소리, 지나가는 풍경', palette: { floor: '#293241', wall: '#38495e', accent: '#98c1d9', light: '#ffe8a3' } },
  { id: 'rain-cafe', icon: '☔', name: '빗소리 카페', mood: '창문에 빗방울이 맺힌 카페 좌석', cue: '빗소리, 젖은 거리, 따뜻한 조명', palette: { floor: '#2f2d35', wall: '#263443', accent: '#67e8f9', light: '#f8c77a' } },
]

const SCREENS: Record<ScreenId, { label: string; title: string; subtitle: string; lines: string[] }> = {
  notion: { label: 'Notion', title: 'Notion Study Hub', subtitle: '오늘 목표와 과목별 체크리스트', lines: ['React Query 복습', '코테 2문제', '영어 단어 60개'] },
  pdf: { label: 'PDF', title: 'PDF Reader', subtitle: '강의자료 18쪽부터 필기', lines: ['핵심 개념 표시', '예제 풀이 비교', '틀린 부분 다시 보기'] },
  chatgpt: { label: 'ChatGPT', title: 'ChatGPT Tutor', subtitle: '막힌 개념을 질문하며 정리', lines: ['시간복잡도 설명', '오답 원인 분석', '암기 문장 만들기'] },
  youtube: { label: '강의', title: 'YouTube Lecture', subtitle: '강의는 작게, 필기는 크게', lines: ['00:18:42 재생 중', '개념 구간 북마크', '노트 자동 정리'] },
  vscode: { label: 'VSCode', title: 'VSCode Web', subtitle: '웹에서 코드 작성과 실행', lines: ['src/App.tsx', 'hooks/useTimer.ts', 'npm run test'] },
  ide: { label: 'IDE', title: 'Online IDE', subtitle: '코딩 테스트 풀이 환경', lines: ['입력 예제 실행', '시간 제한 확인', '정답 제출 준비'] },
  docs: { label: '문서', title: 'Google Docs', subtitle: '보고서 초안 작성', lines: ['목차 정리', '자료 출처 메모', '최종 문장 다듬기'] },
}

const TIMES: Record<TimeId, string> = { morning: '아침', noon: '점심', evening: '저녁', dawn: '새벽' }
const WEATHER: Record<WeatherId, string> = { sunny: '맑음', rain: '비', snow: '눈', cloudy: '흐림' }
const LIGHTS: Record<LightId, string> = { bright: '밝음', warm: '노란조명', night: '야간', desk: '독서등' }
const SEATS: Record<SeatId, string> = { window: '창가', inside: '안쪽', double: '2인석', solo: '혼자석' }
const DESK_ITEMS = ['커피', '텀블러', '아이패드', '식물', '시계', '메모지']
const SOUNDS = ['빗소리', '카페 소음', '키보드', '연필', '백색소음', '선풍기']
const FRIENDS = [
  { name: '김철수', state: '집중 중' },
  { name: '박영희', state: '공부 시작' },
  { name: '나', state: '집중 중' },
]

function App() {
  const [placeId, setPlaceId] = useState<PlaceId>('study-cafe')
  const [screenId, setScreenId] = useState<ScreenId>('notion')
  const [timeId, setTimeId] = useState<TimeId>('evening')
  const [weatherId, setWeatherId] = useState<WeatherId>('rain')
  const [lightId, setLightId] = useState<LightId>('desk')
  const [seatId, setSeatId] = useState<SeatId>('window')
  const [entered, setEntered] = useState(false)
  const [pan, setPan] = useState(48)
  const [focusMinutes, setFocusMinutes] = useState(50)
  const [secondsLeft, setSecondsLeft] = useState(50 * 60)
  const [running, setRunning] = useState(false)
  const [warning, setWarning] = useState(false)
  const [goalText, setGoalText] = useState('React Query\n코테 2문제\n컴활')
  const [deskItems, setDeskItems] = useState<string[]>(['커피', '메모지', '시계'])
  const [soundMix, setSoundMix] = useState<Record<string, number>>({
    빗소리: 45,
    '카페 소음': 30,
    키보드: 35,
    연필: 20,
    백색소음: 30,
    선풍기: 0,
  })

  const place = PLACES.find((item) => item.id === placeId) ?? PLACES[0]
  const screen = SCREENS[screenId]
  const studiedSeconds = focusMinutes * 60 - secondsLeft
  const level = studiedSeconds > 2400 ? '우등생' : studiedSeconds > 1200 ? '학생' : '새싹'
  const goals = goalText.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 5)

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
    const timeout = window.setTimeout(() => setWarning(false), 5000)
    return () => window.clearTimeout(timeout)
  }, [warning])

  const timeText = useMemo(() => {
    const minutes = Math.floor(secondsLeft / 60)
    const seconds = secondsLeft % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }, [secondsLeft])

  const enterRoom = () => {
    setEntered(true)
    setRunning(true)
  }

  const leaveRoom = () => {
    setEntered(false)
    setRunning(false)
  }

  const handleOutsideClick = () => {
    if (entered) setWarning(true)
  }

  return (
    <main
      className={`focus-app is-${timeId} is-${weatherId} is-${lightId} seat-${seatId} ${entered ? 'is-entered' : ''}`}
      style={{
        '--pan': `${pan}%`,
        '--floor': place.palette.floor,
        '--wall': place.palette.wall,
        '--accent': place.palette.accent,
        '--light': place.palette.light,
      } as React.CSSProperties}
    >
      <section className="room-view" aria-label={`${place.name} 360도 집중 공간`} onClick={handleOutsideClick}>
        <div className="panorama" />
        <div className="weather-layer" />
        <div className="window-light">
          <span>{WEATHER[weatherId]}</span>
        </div>
        <div className="passer passer-one" />
        <div className="passer passer-two" />
        <div className="shelf shelf-left" />
        <div className="shelf shelf-right" />
        <div className="study-people">
          <div className="person typing"><span /></div>
          <div className="person reading"><span /></div>
          <div className="person marking"><span /></div>
        </div>
        <div className="desk">
          {deskItems.includes('커피') && <div className="mug" />}
          {deskItems.includes('텀블러') && <div className="tumbler" />}
          {deskItems.includes('아이패드') && <div className="tablet" />}
          {deskItems.includes('식물') && <div className="plant" />}
          {deskItems.includes('시계') && <div className="clock">{timeText}</div>}
          <div className="notebook-paper" />
          <div className="postit">
            <strong>오늘 목표</strong>
            {goals.map((goal) => <span key={goal}>✓ {goal}</span>)}
          </div>
          <div className="laptop" onClick={(event) => event.stopPropagation()}>
            <div className="laptop-screen">
              <div className="browser-bar">
                <span />
                <span />
                <span />
                <strong>{screen.label}</strong>
              </div>
              <div className={`web-screen screen-${screenId}`}>
                <div className="screen-cursor" />
                <div className="screen-header">
                  <strong>{screen.title}</strong>
                  <em>{timeText}</em>
                </div>
                <p>{screen.subtitle}</p>
                <div className="screen-lines">
                  {screen.lines.map((line) => <i key={line}>{line}</i>)}
                </div>
                <button className="screen-exit" onClick={leaveRoom}>
                  나가기
                </button>
              </div>
            </div>
            <div className="laptop-base" />
          </div>
        </div>
        {warning && <div className="focus-warning">⚠ 집중하세요! 5초 후 자동 복귀</div>}
      </section>

      <aside className="control-panel">
        <div className="brand-row">
          <a className="home-link" href="/">← 놀이터</a>
          <span className="live-dot">FOCUS ROOM</span>
        </div>

        <div className="title-block">
          <h1>몰입형 가상 면학석</h1>
          <p>{entered ? `${place.name} ${SEATS[seatId]} 자리, ${TIMES[timeId]} ${WEATHER[weatherId]} 날씨` : '집에서도 실제 카페나 스터디카페에 앉아있는 느낌을 만듭니다.'}</p>
        </div>

        <div className="panel-group">
          <span className="group-label">장소 선택</span>
          <div className="place-grid">
            {PLACES.map((item) => (
              <button key={item.id} className={item.id === placeId ? 'active' : ''} onClick={() => setPlaceId(item.id)}>
                <strong>{item.icon}</strong>
                <small>{item.name}</small>
              </button>
            ))}
          </div>
          <p className="place-cue">{place.mood} · {place.cue}</p>
        </div>

        <div className="panel-group compact-grid">
          <label><span>자리</span><select value={seatId} onChange={(e) => setSeatId(e.target.value as SeatId)}>{Object.entries(SEATS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label><span>시간대</span><select value={timeId} onChange={(e) => setTimeId(e.target.value as TimeId)}>{Object.entries(TIMES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label><span>날씨</span><select value={weatherId} onChange={(e) => setWeatherId(e.target.value as WeatherId)}>{Object.entries(WEATHER).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label><span>조명</span><select value={lightId} onChange={(e) => setLightId(e.target.value as LightId)}>{Object.entries(LIGHTS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        </div>

        <div className="panel-group">
          <span className="group-label">노트북 앱</span>
          <div className="app-tabs">
            {(Object.keys(SCREENS) as ScreenId[]).map((id) => <button key={id} className={screenId === id ? 'active' : ''} onClick={() => setScreenId(id)}>{SCREENS[id].label}</button>)}
          </div>
        </div>

        <label className="range-row">
          <span>360° 시야 회전</span>
          <input type="range" min="0" max="100" value={pan} onChange={(event) => setPan(Number(event.target.value))} />
        </label>

        <div className="panel-group">
          <span className="group-label">ASMR 믹서</span>
          <div className="sound-mixer">
            {SOUNDS.map((sound) => (
              <label key={sound}>
                <span>{sound}</span>
                <input type="range" min="0" max="100" value={soundMix[sound]} onChange={(e) => setSoundMix({ ...soundMix, [sound]: Number(e.target.value) })} />
              </label>
            ))}
          </div>
        </div>

        <div className="panel-group">
          <span className="group-label">책상 꾸미기</span>
          <div className="desk-items">
            {DESK_ITEMS.map((item) => (
              <button key={item} className={deskItems.includes(item) ? 'active' : ''} onClick={() => setDeskItems((items) => items.includes(item) ? items.filter((value) => value !== item) : [...items, item])}>
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="panel-group">
          <span className="group-label">오늘 일정</span>
          <textarea value={goalText} onChange={(event) => setGoalText(event.target.value)} />
          <div className="ai-plan">
            <strong>AI 시간표</strong>
            <span>09:00~11:00 {goals[0] || '주요 과목'}</span>
            <span>11:10~12:00 {goals[1] || '문제 풀이'}</span>
            <span>13:00~14:00 {goals[2] || '복습'}</span>
          </div>
        </div>

        <div className="friends-card">
          <div><span>친구 공간</span><strong>{FRIENDS.length}명 입장</strong></div>
          {FRIENDS.map((friend) => <p key={friend.name}><b>{friend.name}</b><em>{friend.state}</em></p>)}
        </div>

        <div className="timer-card">
          <span>{running ? '진행 중' : entered ? '일시 정지' : '입장 전'} · 레벨 {level}</span>
          <strong>{timeText}</strong>
          <label className="focus-select">
            <span>집중 시간</span>
            <select value={focusMinutes} onChange={(event) => setFocusMinutes(Number(event.target.value))}>
              <option value={25}>25분</option>
              <option value={50}>50분</option>
              <option value={90}>90분</option>
            </select>
          </label>
          <div className="badges"><span>7일 연속</span><span>개발자</span><span>올빼미</span></div>
          <div className="timer-actions">
            {!entered ? <button className="primary-action" onClick={enterRoom}>입장하기</button> : <><button onClick={() => setRunning((value) => !value)}>{running ? '멈춤' : '시작'}</button><button onClick={leaveRoom}>나가기</button></>}
          </div>
        </div>
      </aside>
    </main>
  )
}

export default App
