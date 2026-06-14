import { useState, useCallback, useEffect, useRef } from 'react';
import type { TabType } from './types';
import { getSubjects, getSessions, getTotalSecondsByDate, getDailyGoal, addSession } from './storage';
import { getTodayStr, formatTimer } from './utils';
import type { StudySession } from './types';
import { Timer } from './tabs/Timer';
import { Stats } from './tabs/Stats';
import { CalendarView } from './tabs/CalendarView';
import { Subjects } from './tabs/Subjects';
import './App.css';

const TABS: { key: TabType; label: string; icon: string }[] = [
  { key: 'timer', label: '타이머', icon: '⏱️' },
  { key: 'stats', label: '통계', icon: '📊' },
  { key: 'calendar', label: '달력', icon: '📅' },
  { key: 'subjects', label: '과목', icon: '📚' },
];

// 알림 권한 요청
async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function sendNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.svg' });
  }
}

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('timer');
  const [subjects, setSubjects] = useState(getSubjects);
  const [sessions, setSessions] = useState(getSessions);

  // ── 타이머 상태 (App 레벨로 끌어올림 → 탭 전환해도 유지) ──
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(subjects[0]?.id ?? '');
  const [memo, setMemo] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastNotifyHour = useRef<number>(0);
  const elapsedRef = useRef<number>(0); // elapsed 최신값 ref로 추적

  // 알림 권한 요청 (최초 1회)
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // 타이머 인터벌
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed(e => {
          const next = e + 1;
          elapsedRef.current = next; // ref도 동기 업데이트
          // 1시간(3600초) 단위마다 알림
          const hours = Math.floor(next / 3600);
          if (hours > 0 && hours > lastNotifyHour.current) {
            lastNotifyHour.current = hours;
            const subject = subjects.find(s => s.id === selectedSubjectId);
            sendNotification(
              `⏱️ ${hours}시간 달성!`,
              `${subject?.name ?? '공부'} ${hours}시간을 채웠어요. 잠깐 쉬어가도 좋아요! 🎉`
            );
          }
          return next;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, selectedSubjectId, subjects]);

  // 과목 목록이 바뀌면 선택 과목 초기화
  useEffect(() => {
    if (subjects.length > 0 && !selectedSubjectId) {
      setSelectedSubjectId(subjects[0].id);
    }
  }, [subjects]);

  const handleRefresh = useCallback(() => {
    setSessions(getSessions());
  }, []);

  const handleStart = () => {
    if (!selectedSubjectId) return;
    setStartTime(new Date());
    lastNotifyHour.current = 0;
    setRunning(true);
  };

  const handleStop = () => {
    // interval 즉시 정지
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);

    const currentElapsed = elapsedRef.current;
    if (currentElapsed < 1) {
      setElapsed(0);
      elapsedRef.current = 0;
      return;
    }

    const session: StudySession = {
      id: crypto.randomUUID(),
      subjectId: selectedSubjectId,
      date: getTodayStr(),
      startTime: startTime!.toISOString(),
      endTime: new Date().toISOString(),
      durationSeconds: currentElapsed,
      durationMinutes: Math.floor(currentElapsed / 60),
      memo: memo.trim() || undefined,
    };
    addSession(session);
    setElapsed(0);
    elapsedRef.current = 0;
    setMemo('');
    handleRefresh();
  };

  const handleReset = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);
    setElapsed(0);
    elapsedRef.current = 0;
  };

  const todayTotalSeconds = getTotalSecondsByDate(getTodayStr(), sessions);
  const dailyGoal = getDailyGoal();
  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);

  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="back-link">← 놀이터</a>
        <div className="header-title-row">
          <div>
            <h1 className="app-title">📅 스터디 플래너</h1>
            <p className="app-subtitle">공부 시간을 기록하고 성장을 추적하세요</p>
          </div>
          {/* 타이머 실행 중일 때 상단에 미니 타이머 표시 */}
          {running && (
            <div className="mini-timer" style={{ borderColor: selectedSubject?.color ?? '#70a1ff' }}>
              <span className="mini-timer-dot" style={{ backgroundColor: selectedSubject?.color ?? '#70a1ff' }} />
              <span className="mini-timer-subject">{selectedSubject?.name}</span>
              <span className="mini-timer-time" style={{ color: selectedSubject?.color ?? '#70a1ff' }}>
                {formatTimer(elapsed)}
              </span>
            </div>
          )}
        </div>
      </header>

      <nav className="tab-nav">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            {tab.key === 'timer' && running && (
              <span className="tab-running-dot" />
            )}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {activeTab === 'timer' && (
          <Timer
            subjects={subjects}
            todayTotalSeconds={todayTotalSeconds}
            dailyGoalMinutes={dailyGoal.totalMinutes}
            running={running}
            elapsed={elapsed}
            selectedSubjectId={selectedSubjectId}
            memo={memo}
            onSelectSubject={setSelectedSubjectId}
            onStart={handleStart}
            onStop={handleStop}
            onReset={handleReset}
            onMemoChange={setMemo}
            sessions={sessions}
          />
        )}
        {activeTab === 'stats' && (
          <Stats
            subjects={subjects}
            sessions={sessions}
            onSessionDeleted={handleRefresh}
          />
        )}
        {activeTab === 'calendar' && (
          <CalendarView
            subjects={subjects}
            sessions={sessions}
            dailyGoalMinutes={dailyGoal.totalMinutes}
          />
        )}
        {activeTab === 'subjects' && (
          <Subjects
            subjects={subjects}
            onSubjectsChange={setSubjects}
          />
        )}
      </main>
    </div>
  );
}

export default App;
