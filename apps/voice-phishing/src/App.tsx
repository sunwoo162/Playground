import { useEffect, useMemo, useState } from 'react'

type Phase = 'intro' | 'incoming' | 'call' | 'compromised' | 'final'
type Incident = 'remote-app' | 'transfer' | 'auth-code'

type Choice = {
  label: string
  risk: number
  incident?: Incident
}

type Step = {
  speaker: string
  line: string
  choices: Choice[]
}

type SaveState = 'idle' | 'saving' | 'saved' | 'login-required' | 'failed'

type RecentSession = {
  id: number
  riskScore: number
  riskyChoicesCount: number
  durationSeconds: number
  createdAt: string
}

const STEPS: Step[] = [
  {
    speaker: '서울중앙지검 수사관',
    line: '본인 명의 계좌가 범죄에 이용됐습니다. 지금 통화가 끊기면 체포영장이 진행될 수 있습니다.',
    choices: [
      { label: '전화를 끊고 공식 번호로 직접 확인한다', risk: 0 },
      { label: '무서워서 계속 듣는다', risk: 18 },
    ],
  },
  {
    speaker: '금융감독원 보안팀',
    line: '피해자 확인을 위해 보안 앱을 설치해야 합니다. 지금 문자로 보낸 링크를 누르세요.',
    choices: [
      { label: '링크 설치를 거절한다', risk: 0 },
      { label: '문자로 온 링크를 눌러 앱을 설치한다', risk: 32, incident: 'remote-app' },
    ],
  },
  {
    speaker: '은행 보안 담당자',
    line: '계좌가 이미 위험합니다. 임시 보호 계좌로 잔액을 옮기면 바로 안전 처리됩니다.',
    choices: [
      { label: '송금하지 않고 은행 대표번호로 확인한다', risk: 0 },
      { label: '불안해서 일부 금액을 송금한다', risk: 34, incident: 'transfer' },
    ],
  },
  {
    speaker: '카드사 상담원',
    line: '환급 확인을 위해 방금 도착한 인증번호 여섯 자리를 불러주세요. 시간이 지나면 취소됩니다.',
    choices: [
      { label: '인증번호 제공을 거부한다', risk: 0 },
      { label: '인증번호를 읽어준다', risk: 24, incident: 'auth-code' },
    ],
  },
]

const INCIDENT_COPY: Record<Incident, { title: string; alerts: string[]; account: string; feed: string[] }> = {
  'remote-app': {
    title: '원격 제어 앱이 실행됨',
    alerts: ['화면 녹화 권한 허용됨', '알림 읽기 권한 허용됨', '다른 앱 위에 표시 권한 허용됨'],
    account: '은행 앱 실행 감지',
    feed: ['문자 인증 알림이 화면에 표시됩니다', '상대가 누를 위치를 계속 지시합니다', '통화를 끊지 말라고 압박합니다'],
  },
  transfer: {
    title: '송금 요청이 처리됨',
    alerts: ['300,000원 이체 완료', '추가 송금 요구 발생', '피해금 회수 가능 시간 감소'],
    account: '출금 -300,000원',
    feed: ['상대가 잔액을 다시 확인하라고 합니다', '더 큰 금액을 보호 계좌로 옮기라고 합니다', '이미 보낸 돈은 즉시 지급정지가 필요합니다'],
  },
  'auth-code': {
    title: '인증번호가 노출됨',
    alerts: ['새 기기 로그인 시도', '간편결제 등록 위험', '대출 신청 본인인증 위험'],
    account: '본인 인증 통과',
    feed: ['인증번호는 계정 권한을 넘기는 열쇠가 됩니다', '문자와 알림이 공격자에게 보일 수 있습니다', '즉시 비밀번호와 인증수단 변경이 필요합니다'],
  },
}

const EXPLANATIONS = [
  '수사기관과 금융기관은 전화로 앱 설치, 안전 계좌 송금, 인증번호 제공을 요구하지 않습니다.',
  '공격자는 피해자를 통화에 묶어 두고 가족, 은행, 경찰에게 확인할 시간을 빼앗습니다.',
  '앱 설치 후에는 화면, 문자, 알림이 노출될 수 있어 계좌 이체와 계정 탈취로 이어질 수 있습니다.',
  '이미 송금했거나 앱을 설치했다면 다른 기기로 112, 금융회사 대표번호, 1332에 즉시 연락해야 합니다.',
]

function speak(text: string) {
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  utterance.rate = 1.05
  utterance.pitch = 0.82
  window.speechSynthesis.speak(utterance)
}

function App() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [stepIndex, setStepIndex] = useState(0)
  const [risk, setRisk] = useState(0)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [lastIncident, setLastIncident] = useState<Incident | null>(null)
  const [choicesCount, setChoicesCount] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])

  const step = STEPS[stepIndex]
  const latestIncident = lastIncident ?? incidents.at(-1) ?? 'remote-app'
  const riskLabel = useMemo(() => {
    if (risk < 20) return '낮음'
    if (risk < 50) return '주의'
    if (risk < 75) return '위험'
    return '매우 위험'
  }, [risk])

  useEffect(() => {
    if (phase === 'call' && step) speak(step.line)
    if (phase === 'final') window.speechSynthesis.cancel()
  }, [phase, step])

  useEffect(() => {
    if (phase !== 'final' || saveState !== 'idle') return

    const durationSeconds = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0
    setSaveState('saving')
    fetch('/api/voice-phishing/sessions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        riskScore: risk,
        choicesCount,
        durationSeconds,
        incidents,
      }),
    })
      .then(async (res) => {
        if (res.status === 401) {
          setSaveState('login-required')
          return
        }
        if (!res.ok) throw new Error(await res.text())
        setSaveState('saved')
        const recent = await fetch('/api/voice-phishing/sessions/recent', { credentials: 'include' })
        if (recent.ok) setRecentSessions(await recent.json())
      })
      .catch(() => setSaveState('failed'))
  }, [choicesCount, incidents, phase, risk, saveState, startedAt])

  const start = () => {
    window.speechSynthesis.cancel()
    setPhase('incoming')
    setStepIndex(0)
    setRisk(0)
    setIncidents([])
    setLastIncident(null)
    setChoicesCount(0)
    setStartedAt(Date.now())
    setSaveState('idle')
    setRecentSessions([])
  }

  const answerCall = () => {
    setPhase('call')
  }

  const choose = (choice: Choice) => {
    window.speechSynthesis.cancel()
    setChoicesCount((current) => current + 1)
    setRisk((current) => Math.min(100, current + choice.risk))
    if (choice.incident) {
      setLastIncident(choice.incident)
      setIncidents((current) => [...current, choice.incident as Incident])
      setPhase('compromised')
      return
    }
    goNext()
  }

  const goNext = () => {
    const next = stepIndex + 1
    if (next >= STEPS.length) {
      setPhase('final')
      return
    }
    setStepIndex(next)
    setPhase('call')
  }

  return (
    <main className={`experience phase-${phase}`}>
      {phase === 'intro' && (
        <section className="intro-screen">
          <div>
            <span className="eyebrow">보이스피싱 실감 체험</span>
            <h1>시작하면 모르는 번호에서 전화가 옵니다.</h1>
            <p>
              실제 개인정보는 입력하지 않습니다. 통화 음성, 화면 압박, 앱 설치 후 피해 화면을
              브라우저 안에서만 재현합니다.
            </p>
          </div>
          <button className="start-button" onClick={start}>시작하기</button>
        </section>
      )}

      {phase !== 'intro' && phase !== 'final' && (
        <section className="phone-stage">
          <PhoneFrame>
            {phase === 'incoming' && <IncomingCall onAnswer={answerCall} onDecline={() => setPhase('final')} />}
            {phase === 'call' && step && <CallScreen step={step} stepIndex={stepIndex} risk={risk} onChoose={choose} />}
            {phase === 'compromised' && <CompromisedScreen incident={latestIncident} onContinue={goNext} />}
          </PhoneFrame>
        </section>
      )}

      {phase === 'final' && (
        <section className="final-screen">
          <div className="final-summary">
            <span className="eyebrow">체험 종료</span>
            <h1>피해 위험도 {risk}% · {riskLabel}</h1>
            <p>
              현실에서는 한 번의 앱 설치, 한 번의 송금, 한 번의 인증번호 공유만으로도 피해가
              시작될 수 있습니다.
            </p>
            <div className="final-actions">
              <button className="start-button" onClick={start}>다시 체험하기</button>
              <a className="outline-link" href="tel:112">112 신고</a>
              <a className="outline-link" href="tel:1332">1332 금융상담</a>
            </div>
          </div>
          <div className="explain-panel">
            <h2>해설과 대처법</h2>
            <ol>
              {EXPLANATIONS.map((item) => <li key={item}>{item}</li>)}
            </ol>
            {incidents.length > 0 && (
              <div className="incident-log">
                <strong>체험 중 발생한 위험</strong>
                {incidents.map((incident, index) => (
                  <span key={`${incident}-${index}`}>{INCIDENT_COPY[incident].title}</span>
                ))}
              </div>
            )}
            <SaveStatus state={saveState} recentSessions={recentSessions} />
          </div>
        </section>
      )}
    </main>
  )
}

function SaveStatus({
  state,
  recentSessions,
}: {
  state: SaveState
  recentSessions: RecentSession[]
}) {
  const label = {
    idle: '결과 저장 준비 중',
    saving: '체험 결과 저장 중',
    saved: '체험 결과가 DB에 저장됐습니다',
    'login-required': '로그인하면 체험 기록이 DB에 저장됩니다',
    failed: '체험 결과 저장에 실패했습니다',
  }[state]

  return (
    <div className="save-status">
      <strong>{label}</strong>
      {recentSessions.length > 0 && (
        <div className="recent-sessions">
          <span>최근 기록</span>
          {recentSessions.slice(0, 3).map((session) => (
            <p key={session.id}>
              위험도 {session.riskScore}% · 위험 선택 {session.riskyChoicesCount}개 · {session.durationSeconds}초
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="real-phone">
      <div className="speaker" />
      {children}
    </div>
  )
}

function IncomingCall({ onAnswer, onDecline }: { onAnswer: () => void; onDecline: () => void }) {
  return (
    <div className="incoming-screen">
      <div className="status-row"><span>13:32</span><span>LTE 78%</span></div>
      <div className="incoming-center">
        <span className="unknown-avatar">?</span>
        <p>알 수 없는 번호</p>
        <h2>010-48**-39**</h2>
        <span className="ringing-text">수신 전화...</span>
      </div>
      <div className="call-actions">
        <button className="decline-button" onClick={onDecline}>거절</button>
        <button className="answer-button" onClick={onAnswer}>받기</button>
      </div>
    </div>
  )
}

function CallScreen({
  step,
  stepIndex,
  risk,
  onChoose,
}: {
  step: Step
  stepIndex: number
  risk: number
  onChoose: (choice: Choice) => void
}) {
  return (
    <div className="call-screen">
      <div className="status-row"><span>통화 중 00:{String(17 + stepIndex * 23).padStart(2, '0')}</span><span>위험도 {risk}%</span></div>
      <div className="caller-live">
        <span className="caller-symbol">!</span>
        <p>{step.speaker}</p>
        <div className="live-wave"><span /><span /><span /><span /></div>
      </div>
      <div className="call-transcript">
        <span>상대방</span>
        <p>{step.line}</p>
      </div>
      <div className="choice-dock">
        {step.choices.map((choice) => (
          <button key={choice.label} onClick={() => onChoose(choice)}>{choice.label}</button>
        ))}
      </div>
    </div>
  )
}

function CompromisedScreen({ incident, onContinue }: { incident: Incident; onContinue: () => void }) {
  const copy = INCIDENT_COPY[incident]

  return (
    <div className="device-compromised">
      <div className="status-row danger-row"><span>13:34</span><span>외부 제어 의심</span></div>
      <div className="system-warning">
        <strong>{copy.title}</strong>
        <p>교육용 연출 화면입니다. 실제 기기 권한이나 파일에는 접근하지 않습니다.</p>
      </div>
      <div className="permission-stack">
        {copy.alerts.map((alert) => (
          <div key={alert}><span />{alert}</div>
        ))}
      </div>
      <div className="bank-overlay">
        <span>모바일뱅킹 알림</span>
        <strong>{copy.account}</strong>
      </div>
      <div className="attacker-feed">
        {copy.feed.map((item) => <p key={item}>{item}</p>)}
      </div>
      <button className="continue-button" onClick={onContinue}>계속 진행</button>
    </div>
  )
}

export default App
