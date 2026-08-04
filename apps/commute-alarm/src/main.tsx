import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

type StopType = 'subway' | 'bus'

type Stop = {
  id: string
  name: string
  line: string
  type: StopType
  lat: number
  lng: number
}

const STOPS: Stop[] = [
  { id: 'gangnam', name: '강남역', line: '2호선/신분당선', type: 'subway', lat: 37.497952, lng: 127.027619 },
  { id: 'sadang', name: '사당역', line: '2호선/4호선', type: 'subway', lat: 37.47653, lng: 126.981685 },
  { id: 'seoul-station', name: '서울역', line: '1호선/4호선/공항철도', type: 'subway', lat: 37.554678, lng: 126.970606 },
  { id: 'hongdae', name: '홍대입구역', line: '2호선/경의중앙/공항철도', type: 'subway', lat: 37.55679, lng: 126.923708 },
  { id: 'jamsil', name: '잠실역', line: '2호선/8호선', type: 'subway', lat: 37.513305, lng: 127.100129 },
  { id: 'gwanghwamun', name: '광화문역', line: '5호선', type: 'subway', lat: 37.571607, lng: 126.97691 },
  { id: 'suwon', name: '수원역', line: '1호선/수인분당', type: 'subway', lat: 37.265974, lng: 126.999874 },
  { id: 'pangyo', name: '판교역', line: '신분당선/경강선', type: 'subway', lat: 37.394761, lng: 127.111217 },
  { id: 'gangnam-bus', name: '강남역 중앙차로', line: '서울 버스 정류장', type: 'bus', lat: 37.500626, lng: 127.026616 },
  { id: 'seoul-bus', name: '서울역버스환승센터', line: '서울 버스 정류장', type: 'bus', lat: 37.55595, lng: 126.972317 },
  { id: 'hongdae-bus', name: '홍대입구역 정류장', line: '서울 버스 정류장', type: 'bus', lat: 37.557192, lng: 126.923697 },
  { id: 'jamsil-bus', name: '잠실역 정류장', line: '서울 버스 정류장', type: 'bus', lat: 37.513788, lng: 127.100557 },
]

const STORAGE_KEY = 'commute-alarm-settings'

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const earthRadius = 6371000
  const toRad = (value: number) => value * Math.PI / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

function App() {
  const saved = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<{ targetId: string; alertDistance: number }>
    } catch {
      return {}
    }
  }, [])

  const [query, setQuery] = useState('')
  const [targetId, setTargetId] = useState(saved.targetId || STOPS[0].id)
  const [alertDistance, setAlertDistance] = useState(saved.alertDistance || 700)
  const [tracking, setTracking] = useState(false)
  const [position, setPosition] = useState<GeolocationPosition | null>(null)
  const [status, setStatus] = useState('목표 정류장이나 역을 고른 뒤 시작하세요.')
  const [permission, setPermission] = useState(Notification.permission)
  const [alarmed, setAlarmed] = useState(false)
  const watchIdRef = useRef<number | null>(null)

  const target = STOPS.find((stop) => stop.id === targetId) || STOPS[0]
  const filteredStops = STOPS.filter((stop) => {
    const value = `${stop.name} ${stop.line}`.toLowerCase()
    return value.includes(query.trim().toLowerCase())
  })
  const distance = position ? Math.round(distanceMeters(position.coords.latitude, position.coords.longitude, target.lat, target.lng)) : null

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ targetId, alertDistance }))
  }, [targetId, alertDistance])

  useEffect(() => {
    if (!tracking || distance === null || alarmed || distance > alertDistance) return
    setAlarmed(true)
    setStatus(`${target.name}까지 약 ${distance.toLocaleString()}m 남았습니다. 내릴 준비를 하세요.`)
    triggerAlarm(target.name, distance)
  }, [tracking, distance, alertDistance, alarmed, target.name])

  const requestNotification = async () => {
    if (!('Notification' in window)) {
      setStatus('이 브라우저는 알림 API를 지원하지 않습니다.')
      return
    }
    const result = await Notification.requestPermission()
    setPermission(result)
  }

  const startTracking = () => {
    if (!navigator.geolocation) {
      setStatus('이 브라우저는 위치 API를 지원하지 않습니다.')
      return
    }
    setAlarmed(false)
    setTracking(true)
    setStatus('현재 위치를 확인하는 중입니다. 화면을 켜둔 상태가 가장 정확합니다.')
    watchIdRef.current = navigator.geolocation.watchPosition(
      (next) => {
        setPosition(next)
        setStatus('이동 중입니다. 목표 지점에 가까워지면 알람을 울립니다.')
      },
      (error) => {
        setTracking(false)
        setStatus(error.message || '위치 권한을 확인해주세요.')
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
    )
  }

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setTracking(false)
    setStatus('알람을 중지했습니다.')
  }

  return (
    <main className="commute-app">
      <section className="hero">
        <a className="back-link" href="/">← 놀이터로 돌아가기</a>
        <div>
          <span className="eyebrow">GPS 하차 알람</span>
          <h1>버스나 지하철에서 졸아도 내리기 전에 깨워요</h1>
          <p>도착할 역이나 정류장을 고르고 알림 거리를 정하면, 휴대폰 위치가 가까워졌을 때 알림과 소리로 알려줍니다.</p>
        </div>
        <div className="live-card">
          <span>목표까지</span>
          <strong>{distance === null ? '--' : `${distance.toLocaleString()}m`}</strong>
          <p>{target.name}</p>
        </div>
      </section>

      <section className="workspace">
        <div className="control-panel">
          <label>
            역/정류장 검색
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 강남, 잠실, 서울역" />
          </label>

          <div className="stop-list" role="listbox" aria-label="목표 선택">
            {filteredStops.map((stop) => (
              <button
                key={stop.id}
                className={stop.id === targetId ? 'active' : ''}
                onClick={() => {
                  setTargetId(stop.id)
                  setAlarmed(false)
                }}
              >
                <span>{stop.type === 'subway' ? 'SUB' : 'BUS'}</span>
                <strong>{stop.name}</strong>
                <small>{stop.line}</small>
              </button>
            ))}
          </div>

          <label>
            알림 거리: {alertDistance.toLocaleString()}m 전
            <input
              type="range"
              min="300"
              max="2000"
              step="100"
              value={alertDistance}
              onChange={(event) => setAlertDistance(Number(event.target.value))}
            />
          </label>

          <div className="action-row">
            <button className="secondary-button" onClick={requestNotification}>
              알림 허용
            </button>
            {tracking ? (
              <button className="primary-button stop" onClick={stopTracking}>중지</button>
            ) : (
              <button className="primary-button" onClick={startTracking}>시작</button>
            )}
          </div>
        </div>

        <div className="status-panel">
          <div className="route-line">
            <span className={tracking ? 'moving' : ''} />
          </div>
          <h2>{target.name}</h2>
          <p className="target-meta">{target.line} · {target.type === 'subway' ? '지하철역' : '버스 정류장'}</p>
          <div className="metric-grid">
            <div><span>알림 상태</span><strong>{alarmed ? '울림' : tracking ? '대기 중' : '꺼짐'}</strong></div>
            <div><span>브라우저 알림</span><strong>{permission === 'granted' ? '허용됨' : '미허용'}</strong></div>
            <div><span>위치 정확도</span><strong>{position ? `±${Math.round(position.coords.accuracy)}m` : '--'}</strong></div>
          </div>
          <p className="status-text">{status}</p>
          <button className="test-button" onClick={() => triggerAlarm(target.name, distance || alertDistance)}>
            알람 테스트
          </button>
        </div>
      </section>
    </main>
  )
}

function triggerAlarm(stopName: string, distance: number) {
  const message = `${stopName}까지 약 ${distance.toLocaleString()}m 남았습니다.`
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('하차 알람', { body: message, tag: 'commute-alarm' })
  }
  navigator.vibrate?.([700, 250, 700, 250, 1000])
  const context = new AudioContext()
  const playTone = (start: number, frequency: number) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = frequency
    oscillator.connect(gain)
    gain.connect(context.destination)
    gain.gain.setValueAtTime(0.001, context.currentTime + start)
    gain.gain.exponentialRampToValueAtTime(0.35, context.currentTime + start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + start + 0.45)
    oscillator.start(context.currentTime + start)
    oscillator.stop(context.currentTime + start + 0.5)
  }
  playTone(0, 880)
  playTone(0.55, 1046)
  playTone(1.1, 880)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
