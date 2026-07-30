import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

type Mood = 'library' | 'rainCafe' | 'night' | 'campus' | 'office' | 'coding'
type Phase = 'focus' | 'break' | 'meditation'

const moods: Record<Mood, { label: string; room: string; sound: string; tint: string }> = {
  library: { label: '도서관', room: '긴 책상과 낮은 발소리', sound: '책장 넘김', tint: '#476B5C' },
  rainCafe: { label: '비오는 카페', room: '창가 좌석과 빗물 자국', sound: '비 + 커피머신', tint: '#3D6076' },
  night: { label: '새벽 독서실', room: '스탠드 불빛과 깊은 정적', sound: '백색소음', tint: '#504C7E' },
  campus: { label: '대학교 열람실', room: '넓은 열람석과 형광등', sound: '연필 소리', tint: '#6F7047' },
  office: { label: '회사 사무실', room: '키보드와 모니터 불빛', sound: '키보드 소리', tint: '#4A6678' },
  coding: { label: '코딩 스튜디오', room: '듀얼 모니터와 터미널', sound: '기계식 키보드', tint: '#326F68' },
}

const people = [
  ['여학생 공부중', '필기', 'notes'],
  ['남학생 코딩중', '코딩', 'code'],
  ['시험공부중', '암기', 'book'],
  ['노트필기중', '정리', 'pen'],
  ['문제풀이중', '계산', 'paper'],
  ['강의보는중', '강의', 'screen'],
  ['스터디 플래너', '계획', 'plan'],
  ['새벽 집중러', '복습', 'lamp'],
  ['자격증 준비', '기출', 'mark'],
  ['논문 읽는중', '읽기', 'paper'],
  ['알고리즘 풀이', '코테', 'code'],
  ['한국사 회독', '회독', 'book'],
  ['영단어 암기', '단어', 'mark'],
  ['자료 정리', '정리', 'notes'],
  ['프로젝트 구현', '빌드', 'screen'],
  ['시험 전날', '집중', 'lamp'],
] as const

const phaseText: Record<Phase, string> = {
  focus: '집중중',
  break: '휴식',
  meditation: '명상',
}

function App() {
  const [entered, setEntered] = useState(false)
  const [mood, setMood] = useState<Mood>('library')
  const [count, setCount] = useState(4)
  const [phase, setPhase] = useState<Phase>('focus')
  const [seconds, setSeconds] = useState(50 * 60)
  const [running, setRunning] = useState(false)
  const [goal, setGoal] = useState('React Query 3강')
  const [done, setDone] = useState(35)
  const [soundOn, setSoundOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const visiblePeople = useMemo(() => people.slice(0, count), [count])
  const sessionLabel = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value > 1) return value - 1
        setPhase((current) => {
          if (current === 'focus') {
            setDone((v) => Math.min(100, v + 20))
            setSeconds(5 * 60)
            return 'break'
          }
          if (current === 'break') {
            setSeconds(5 * 60)
            return 'meditation'
          }
          setSeconds(50 * 60)
          return 'focus'
        })
        return 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running])

  async function toggleCamera() {
    if (cameraOn) {
      const stream = videoRef.current?.srcObject as MediaStream | null
      stream?.getTracks().forEach((track) => track.stop())
      if (videoRef.current) videoRef.current.srcObject = null
      setCameraOn(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraError('')
      setCameraOn(true)
    } catch {
      setCameraError('카메라 권한이 필요합니다.')
    }
  }

  function resetPhase(next: Phase) {
    setPhase(next)
    setSeconds(next === 'focus' ? 50 * 60 : 5 * 60)
  }

  if (!entered) {
    return (
      <main className="entry">
        <section className="entry-panel">
          <p className="kicker">AI 가상 스터디 공간</p>
          <h1>오늘은 어떤 분위기에서 공부하시겠어요?</h1>
          <div className="mood-grid">
            {(Object.entries(moods) as [Mood, typeof moods[Mood]][]).map(([key, item]) => (
              <button className={mood === key ? 'selected' : ''} key={key} onClick={() => setMood(key)}>
                <span style={{ background: item.tint }} />
                {item.label}
              </button>
            ))}
          </div>
          <div className="entry-row">
            <label>
              사람 수
              <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
                {[1, 2, 4, 8, 16].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <button className="enter" onClick={() => { setEntered(true); setRunning(true) }}>방 입장</button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className={`room phase-${phase}`} style={{ '--mood': moods[mood].tint } as React.CSSProperties}>
      <section className="stage">
        <div className="room-top">
          <div>
            <p className="kicker">{moods[mood].label}</p>
            <h1>{moods[mood].room}</h1>
          </div>
          <div className="timer">
            <strong>{sessionLabel}</strong>
            <span>{phaseText[phase]}</span>
          </div>
        </div>

        <div className="video-wall" data-count={count}>
          {visiblePeople.map((person, index) => (
            <StudyTile key={person[0]} person={person} index={index} phase={phase} />
          ))}
          <article className="tile me">
            <div className="camera">
              <video ref={videoRef} autoPlay playsInline muted />
              {!cameraOn && <span>내 캠</span>}
            </div>
            <div className="tile-caption">
              <strong>나</strong>
              <small>{cameraOn ? '집중도 93%' : cameraError || '카메라 꺼짐'}</small>
            </div>
          </article>
        </div>
      </section>

      <aside className="control">
        <div className="goal">
          <label>오늘 목표</label>
          <input value={goal} onChange={(event) => setGoal(event.target.value)} />
          <div className="progress"><span style={{ width: `${done}%` }} /></div>
          <small>{done}%</small>
        </div>

        <div className="seg">
          {(Object.keys(moods) as Mood[]).map((key) => (
            <button key={key} className={mood === key ? 'on' : ''} onClick={() => setMood(key)}>{moods[key].label}</button>
          ))}
        </div>

        <div className="control-grid">
          <button onClick={() => setRunning((v) => !v)}>{running ? '일시정지' : '시작'}</button>
          <button onClick={toggleCamera}>{cameraOn ? '캠 끄기' : '캠 켜기'}</button>
          <button onClick={() => setSoundOn((v) => !v)}>{soundOn ? moods[mood].sound : '무음'}</button>
          <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
            {[1, 2, 4, 8, 16].map((value) => <option key={value} value={value}>{value}명</option>)}
          </select>
        </div>

        <div className="phase-buttons">
          <button onClick={() => resetPhase('focus')}>50분 공부</button>
          <button onClick={() => resetPhase('break')}>5분 휴식</button>
          <button onClick={() => resetPhase('meditation')}>5분 명상</button>
        </div>

        <div className="summary">
          <span>오늘 3시간 42분</span>
          <span>50분 세션 4회</span>
          <span>휴식 4회</span>
          <span>명상 4회</span>
        </div>
      </aside>
    </main>
  )
}

function StudyTile({ person, index, phase }: { person: typeof people[number]; index: number; phase: Phase }) {
  const activity = phase === 'focus' ? person[1] : phase === 'break' ? ['물 마심', '기지개', '창밖 보기', '커피'][index % 4] : '조용히 호흡'
  return (
    <article className={`tile avatar-${person[2]}`} style={{ '--delay': `${index * -7.5}s` } as React.CSSProperties}>
      <div className="avatar-scene">
        <div className="head" />
        <div className="body" />
        <div className="desk" />
        <div className="hands" />
        <div className="steam" />
      </div>
      <div className="tile-caption">
        <strong>{person[0]}</strong>
        <small>{activity}</small>
      </div>
    </article>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
