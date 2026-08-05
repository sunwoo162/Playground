import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

type Mode = 'subway' | 'bus'

type ApiConfig = {
  subway: boolean
  bus: boolean
  required: {
    subway: string
    bus: string
  }
}

type TransitTarget = {
  id: string
  type: Mode
  name: string
  line?: string
  stationCode?: string
  arsId?: string
  lat: number
  lng: number
  distance?: number
}

type SubwayArrival = {
  trainLine: string
  message: string
  status: string
  upDown: string
  destination: string
  updatedAt: string
}

type BusArrival = {
  routeId: string
  routeName: string
  direction: string
  firstArrival: string
  secondArrival: string
}

const STORAGE_KEY = 'commute-alarm-v2'

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

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `요청 실패: ${response.status}`)
  }
  return data as T
}

function App() {
  const saved = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<{ alertDistance: number; target: TransitTarget }>
    } catch {
      return {}
    }
  }, [])

  const [mode, setMode] = useState<Mode>('subway')
  const [query, setQuery] = useState('')
  const [alertDistance, setAlertDistance] = useState(saved.alertDistance || 700)
  const [target, setTarget] = useState<TransitTarget | null>(saved.target || null)
  const [config, setConfig] = useState<ApiConfig | null>(null)
  const [position, setPosition] = useState<GeolocationPosition | null>(null)
  const [tracking, setTracking] = useState(false)
  const [alarmed, setAlarmed] = useState(false)
  const [status, setStatus] = useState('내 위치를 켜고 지하철역을 검색하거나 주변 버스 정류장을 불러오세요.')
  const [permission, setPermission] = useState(Notification.permission)
  const [results, setResults] = useState<TransitTarget[]>([])
  const [subwayArrivals, setSubwayArrivals] = useState<SubwayArrival[]>([])
  const [busArrivals, setBusArrivals] = useState<BusArrival[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const importRef = useRef<HTMLInputElement | null>(null)

  const distance = position && target?.lat && target?.lng
    ? Math.round(distanceMeters(position.coords.latitude, position.coords.longitude, target.lat, target.lng))
    : null

  useEffect(() => {
    getJson<ApiConfig>('/commute-api/config')
      .then(setConfig)
      .catch((error) => setStatus(error.message))
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ alertDistance, target }))
  }, [alertDistance, target])

  useEffect(() => {
    if (!tracking || !target || distance === null || alarmed || distance > alertDistance) return
    setAlarmed(true)
    setStatus(`${target.name}까지 약 ${distance.toLocaleString()}m 남았습니다. 내릴 준비를 하세요.`)
    triggerAlarm(target.name, distance)
  }, [tracking, target, distance, alertDistance, alarmed])

  useEffect(() => {
    if (!target) return
    refreshArrivals(target)
    const id = window.setInterval(() => refreshArrivals(target, true), 30000)
    return () => window.clearInterval(id)
  }, [target?.id, target?.type])

  const requestNotification = async () => {
    if (!('Notification' in window)) {
      setStatus('이 브라우저는 알림 API를 지원하지 않습니다.')
      return
    }
    const result = await Notification.requestPermission()
    setPermission(result)
    setStatus(result === 'granted' ? '브라우저 알림이 허용되었습니다.' : '브라우저 알림이 허용되지 않았습니다.')
  }

  const locateMe = () => {
    if (!navigator.geolocation) {
      setStatus('이 브라우저는 위치 API를 지원하지 않습니다.')
      return
    }
    setStatus('현재 위치를 확인하는 중입니다.')
    navigator.geolocation.getCurrentPosition(
      (next) => {
        setPosition(next)
        setStatus('현재 위치를 가져왔습니다.')
      },
      (error) => setStatus(error.message || '위치 권한을 확인해주세요.'),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000 },
    )
  }

  const startTracking = () => {
    if (!target) {
      setStatus('먼저 내릴 역이나 정류장을 선택하세요.')
      return
    }
    if (!navigator.geolocation) {
      setStatus('이 브라우저는 위치 API를 지원하지 않습니다.')
      return
    }
    setAlarmed(false)
    setTracking(true)
    setStatus('실시간 위치 추적 중입니다. 목표 지점에 가까워지면 알람을 울립니다.')
    watchIdRef.current = navigator.geolocation.watchPosition(
      (next) => setPosition(next),
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

  const searchSubway = async () => {
    const text = query.trim()
    if (!text) {
      setStatus('검색할 역 이름을 입력하세요.')
      return
    }
    setMode('subway')
    setLoading(true)
    setStatus('서울 열린데이터 지하철 역 정보를 검색하는 중입니다.')
    try {
      const stations = await getJson<Array<Omit<TransitTarget, 'type'>>>(`/commute-api/subway/search?q=${encodeURIComponent(text)}`)
      setResults(stations.map((station) => ({ ...station, type: 'subway' })))
      setStatus(stations.length ? `${stations.length}개 역을 찾았습니다.` : '검색 결과가 없습니다.')
    } catch (error) {
      setResults([])
      setStatus(error instanceof Error ? error.message : '지하철 검색에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const loadNearbyBusStops = async () => {
    setMode('bus')
    const current = position
    if (!current) {
      setStatus('먼저 내 위치를 가져오세요.')
      locateMe()
      return
    }
    setLoading(true)
    setStatus('서울 버스 API로 주변 정류장을 불러오는 중입니다.')
    try {
      const stops = await getJson<Array<Omit<TransitTarget, 'type'>>>(`/commute-api/bus/nearby?lat=${current.coords.latitude}&lng=${current.coords.longitude}&radius=700`)
      setResults(stops.map((stop) => ({ ...stop, type: 'bus' })))
      setStatus(stops.length ? `주변 정류장 ${stops.length}개를 찾았습니다.` : '주변 정류장을 찾지 못했습니다.')
    } catch (error) {
      setResults([])
      setStatus(error instanceof Error ? error.message : '주변 버스 정류장 조회에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const selectTarget = (next: TransitTarget) => {
    setTarget(next)
    setAlarmed(false)
    setMode(next.type)
    setSubwayArrivals([])
    setBusArrivals([])
    setStatus(`${next.name}을 목표로 설정했습니다.`)
  }

  const refreshArrivals = async (selected = target, quiet = false) => {
    if (!selected) return
    setRefreshing(true)
    if (!quiet) setStatus('실시간 도착 정보를 불러오는 중입니다.')
    try {
      if (selected.type === 'subway') {
        const arrivals = await getJson<SubwayArrival[]>(`/commute-api/subway/arrivals?station=${encodeURIComponent(selected.name.replace(/역$/, ''))}`)
        setSubwayArrivals(arrivals)
      } else {
        const arrivals = await getJson<BusArrival[]>(`/commute-api/bus/arrivals?stationId=${encodeURIComponent(selected.id)}`)
        setBusArrivals(arrivals)
      }
      if (!quiet) setStatus('실시간 도착 정보를 업데이트했습니다.')
    } catch (error) {
      if (!quiet) setStatus(error instanceof Error ? error.message : '도착 정보 조회에 실패했습니다.')
    } finally {
      setRefreshing(false)
    }
  }

  const exportSettings = () => {
    const payload = {
      app: 'commute-alarm',
      version: 1,
      exportedAt: new Date().toISOString(),
      alertDistance,
      target,
      mode,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `commute-alarm-settings-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setStatus('알람 설정을 내보냈습니다.')
  }

  const importSettings = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const payload = JSON.parse(await file.text())
      if (payload?.app !== 'commute-alarm' || payload?.version !== 1) {
        throw new Error('commute-alarm 설정 파일이 아닙니다.')
      }
      const nextTarget = payload.target as TransitTarget | null
      if (nextTarget?.id && nextTarget?.name && typeof nextTarget.lat === 'number' && typeof nextTarget.lng === 'number') {
        setTarget(nextTarget)
        setMode(nextTarget.type)
      }
      if (typeof payload.alertDistance === 'number') {
        setAlertDistance(Math.min(2000, Math.max(200, payload.alertDistance)))
      }
      setAlarmed(false)
      setStatus('알람 설정을 불러왔습니다.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '알람 설정을 불러오지 못했습니다.')
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  const missingKey = mode === 'subway' ? config && !config.subway : config && !config.bus

  return (
    <main className="commute-app">
      <section className="hero">
        <a className="back-link" href="/">← 놀이터로 돌아가기</a>
        <div>
          <span className="eyebrow">실시간 대중교통 하차 알람</span>
          <h1>내 위치와 실제 지하철·버스 정보로 내리기 전에 깨워요</h1>
          <p>GPS 위치를 추적하고 서울 지하철·버스 실시간 API를 불러와 목표 지점 접근 알림과 도착 정보를 함께 보여줍니다.</p>
        </div>
        <div className="live-card">
          <span>목표까지</span>
          <strong>{distance === null ? '--' : `${distance.toLocaleString()}m`}</strong>
          <p>{target ? target.name : '목표 미선택'}</p>
        </div>
      </section>

      <section className="workspace">
        <div className="control-panel">
          <div className="mode-tabs">
            <button className={mode === 'subway' ? 'active' : ''} onClick={() => setMode('subway')}>지하철</button>
            <button className={mode === 'bus' ? 'active' : ''} onClick={() => setMode('bus')}>버스</button>
          </div>

          {missingKey && (
            <div className="api-warning">
              서버에 {mode === 'subway' ? config?.required.subway : config?.required.bus} 환경변수가 필요합니다.
            </div>
          )}

          <div className="action-row">
            <button className="secondary-button" onClick={locateMe}>내 위치</button>
            <button className="secondary-button" onClick={requestNotification}>알림 허용</button>
          </div>
          <div className="action-row">
            <button className="secondary-button" onClick={exportSettings}>설정 내보내기</button>
            <label className="import-button">
              설정 불러오기
              <input ref={importRef} type="file" accept="application/json,.json" onChange={importSettings} />
            </label>
          </div>

          {mode === 'subway' ? (
            <form className="search-row" onSubmit={(event) => { event.preventDefault(); searchSubway() }}>
              <label>
                지하철역 검색
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 강남, 홍대입구, 서울" />
              </label>
              <button className="primary-button" disabled={loading}>검색</button>
            </form>
          ) : (
            <button className="primary-button" onClick={loadNearbyBusStops} disabled={loading}>
              주변 버스 정류장 불러오기
            </button>
          )}

          <div className="stop-list" role="listbox" aria-label="목표 선택">
            {results.map((item) => (
              <button
                key={`${item.type}-${item.id}`}
                className={target?.id === item.id && target.type === item.type ? 'active' : ''}
                onClick={() => selectTarget(item)}
              >
                <span>{item.type === 'subway' ? 'SUB' : 'BUS'}</span>
                <strong>{item.name}</strong>
                <small>{item.type === 'subway' ? item.line : `${item.arsId || '정류장'} · ${item.distance ? `${Math.round(item.distance)}m` : '주변'}`}</small>
              </button>
            ))}
          </div>

          <label>
            알림 거리: {alertDistance.toLocaleString()}m 전
            <input
              type="range"
              min="200"
              max="2000"
              step="100"
              value={alertDistance}
              onChange={(event) => setAlertDistance(Number(event.target.value))}
            />
          </label>

          <div className="action-row">
            {tracking ? (
              <button className="primary-button stop" onClick={stopTracking}>추적 중지</button>
            ) : (
              <button className="primary-button" onClick={startTracking}>하차 알람 시작</button>
            )}
            <button className="secondary-button" onClick={() => target && refreshArrivals(target)} disabled={!target || refreshing}>
              도착 새로고침
            </button>
          </div>
        </div>

        <div className="status-panel">
          <div className="route-line">
            <span className={tracking ? 'moving' : ''} />
          </div>
          <h2>{target ? target.name : '목표를 선택하세요'}</h2>
          <p className="target-meta">
            {target ? `${target.type === 'subway' ? '지하철역' : '버스 정류장'} · ${target.line || target.arsId || '실시간 정보'}` : 'GPS와 교통 API를 연결해 알람을 준비합니다.'}
          </p>
          <div className="metric-grid">
            <div><span>알림 상태</span><strong>{alarmed ? '울림' : tracking ? '대기 중' : '꺼짐'}</strong></div>
            <div><span>브라우저 알림</span><strong>{permission === 'granted' ? '허용됨' : '미허용'}</strong></div>
            <div><span>위치 정확도</span><strong>{position ? `±${Math.round(position.coords.accuracy)}m` : '--'}</strong></div>
          </div>

          <section className="arrival-panel">
            <div className="panel-heading">
              <h3>실시간 도착 정보</h3>
              <span>{refreshing ? '업데이트 중' : '30초 자동 갱신'}</span>
            </div>
            {target?.type === 'subway' && subwayArrivals.length > 0 && (
              <ul className="arrival-list">
                {subwayArrivals.slice(0, 8).map((arrival, index) => (
                  <li key={`${arrival.trainLine}-${arrival.message}-${index}`}>
                    <strong>{arrival.trainLine || arrival.upDown}</strong>
                    <span>{arrival.message || arrival.status}</span>
                  </li>
                ))}
              </ul>
            )}
            {target?.type === 'bus' && busArrivals.length > 0 && (
              <ul className="arrival-list">
                {busArrivals.slice(0, 10).map((arrival) => (
                  <li key={arrival.routeId || arrival.routeName}>
                    <strong>{arrival.routeName}</strong>
                    <span>{arrival.firstArrival} {arrival.secondArrival ? `/ ${arrival.secondArrival}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
            {target && subwayArrivals.length === 0 && busArrivals.length === 0 && !refreshing && (
              <p className="empty-arrivals">아직 표시할 도착 정보가 없습니다.</p>
            )}
          </section>

          <p className="status-text">{status}</p>
          <button className="test-button" onClick={() => target && triggerAlarm(target.name, distance || alertDistance)} disabled={!target}>
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
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass()
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
