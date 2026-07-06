import { useState, useCallback, useEffect, useRef } from 'react';
import type { TabType } from '../shared/model/types';
import type { StudySession } from '../entities/session';
import { getSubjectsAsync, getDailyGoalAsync } from '../entities/subject';
import { getSessionsAsync, addSessionAsync } from '../entities/session';
import { getTodayStr, requestNotificationPermission, sendNotification, generateId } from '../shared/lib';
import { useAuth } from '../shared/lib/useAuth';
import { Timer } from '../features/timer';
import { Stats } from '../features/stats';
import { CalendarView } from '../features/calendar';
import { Subjects } from '../features/subjects';
import { TabNav } from '../widgets/tab-nav';
import { MiniTimer } from '../widgets/mini-timer';
import { StopModal } from '../widgets/stop-modal/StopModal';
import './App.css';

const TIMER_KEY = 'study-planner-timer';
type Theme = 'dark' | 'light';
const THEME_KEY = 'playground-theme';
const getTheme = (): Theme => localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';

function saveTimerState(running: boolean, startTime: Date | null, subjectId: string) {
  if (running && startTime) {
    localStorage.setItem(TIMER_KEY, JSON.stringify({
      running: true,
      startTime: startTime.toISOString(),
      subjectId,
    }));
  } else {
    localStorage.removeItem(TIMER_KEY);
  }
}

function loadTimerState() {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.running || !data.startTime) return null;
    return {
      startTime: new Date(data.startTime),
      subjectId: data.subjectId as string,
    };
  } catch {
    return null;
  }
}

function App() {
  const authed = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('timer');
  const [subjects, setSubjects] = useState<import('../entities/subject').Subject[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(480);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>(getTheme);

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [memo, setMemo] = useState('');
  const [modalStep, setModalStep] = useState<0 | 1 | 2>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastNotifyHour = useRef<number>(0);
  const elapsedRef = useRef<number>(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // 초기 데이터 로드
  useEffect(() => {
    requestNotificationPermission();
    Promise.all([getSubjectsAsync(), getSessionsAsync(), getDailyGoalAsync()])
      .then(([subs, sess, goal]) => {
        setSubjects(subs);
        setSessions(sess);
        setDailyGoalMinutes(goal.totalMinutes);

        // 타이머 복원
        const saved = loadTimerState();
        if (saved) {
          const elapsed = Math.floor((Date.now() - saved.startTime.getTime()) / 1000);
          setStartTime(saved.startTime);
          setElapsed(elapsed);
          elapsedRef.current = elapsed;
          setSelectedSubjectId(saved.subjectId || (subs.length > 0 ? subs[0].id : ''));
          setRunning(true);
        } else if (subs.length > 0) {
          setSelectedSubjectId(subs[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (subjects.length > 0 && !selectedSubjectId) {
      setSelectedSubjectId(subjects[0].id);
    }
  }, [subjects]);

  // 타이머 인터벌
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed(e => {
          const next = e + 1;
          elapsedRef.current = next;
          const hours = Math.floor(next / 3600);
          if (hours > 0 && hours > lastNotifyHour.current) {
            lastNotifyHour.current = hours;
            const subject = subjects.find(s => s.id === selectedSubjectId);
            sendNotification(
              `⏱️ ${hours}시간 달성!`,
              `${subject?.name ?? '공부'} ${hours}시간을 채웠어요! 🎉`
            );
          }
          return next;
        });
      }, 1000);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, selectedSubjectId, subjects]);

  const handleRefresh = useCallback(() => {
    getSessionsAsync().then(setSessions);
  }, []);

  const handleStart = () => {
    if (!selectedSubjectId) return;
    const now = new Date();
    setStartTime(now);
    lastNotifyHour.current = 0;
    setRunning(true);
    saveTimerState(true, now, selectedSubjectId);
  };

  const handleStop = () => {
    // 모달 1단계 표시 (아직 타이머는 멈추지 않음)
    setModalStep(1);
  };

  const handleStopConfirm = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRunning(false);
    saveTimerState(false, null, '');
    const currentElapsed = elapsedRef.current;
    if (currentElapsed < 1) { setElapsed(0); elapsedRef.current = 0; setModalStep(0); return; }

    const now = new Date();
    const session: StudySession = {
      id: generateId(),
      subjectId: selectedSubjectId,
      date: getTodayStr(),
      startTime: startTime!.toISOString(),
      endTime: now.toISOString(),
      durationSeconds: currentElapsed,
      durationMinutes: Math.floor(currentElapsed / 60),
      memo: memo.trim() || undefined,
    };
    addSessionAsync(session).then(saved => {
      setSessions(prev => [saved, ...prev]);
    });
    setElapsed(0);
    elapsedRef.current = 0;
    setMemo('');
    setModalStep(2);
  };

  const handleReset = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRunning(false);
    setElapsed(0);
    elapsedRef.current = 0;
    saveTimerState(false, null, '');
  };

  const todayTotalSeconds = sessions
    .filter(s => s.date === getTodayStr())
    .reduce((sum, s) => sum + (s.durationSeconds ?? s.durationMinutes * 60), 0);

  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);

  if (!authed || loading) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: '#888' }}>불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="back-link">← 놀이터</a>
        <div className="header-title-row">
          <div>
            <h1 className="app-title">📅 스터디 플래너</h1>
            <p className="app-subtitle">공부 시간을 기록하고 성장을 추적하세요</p>
          </div>
          <MiniTimer running={running} elapsed={elapsed} subject={selectedSubject} />
        </div>
        <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="테마 전환">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>

      <TabNav activeTab={activeTab} running={running} onTabChange={setActiveTab} />

      <main className="app-main">
        {activeTab === 'timer' && (
          <Timer
            subjects={subjects}
            todayTotalSeconds={todayTotalSeconds}
            dailyGoalMinutes={dailyGoalMinutes}
            running={running}
            elapsed={elapsed}
            selectedSubjectId={selectedSubjectId}
            memo={memo}
            sessions={sessions}
            onSelectSubject={setSelectedSubjectId}
            onStart={handleStart}
            onStop={handleStop}
            onReset={handleReset}
            onMemoChange={setMemo}
          />
        )}
        {activeTab === 'stats' && (
          <Stats subjects={subjects} sessions={sessions} onSessionDeleted={handleRefresh} />
        )}
        {activeTab === 'calendar' && (
          <CalendarView subjects={subjects} sessions={sessions} dailyGoalMinutes={dailyGoalMinutes} />
        )}
        {activeTab === 'subjects' && (
          <Subjects
            subjects={subjects}
            onSubjectsChange={setSubjects}
            onGoalChange={setDailyGoalMinutes}
          />
        )}
      </main>
      {modalStep > 0 && (
        <StopModal
          step={modalStep as 1 | 2}
          onConfirmStep1={handleStopConfirm}
          onConfirmStep2={() => setModalStep(0)}
          onCancel={() => setModalStep(0)}
        />
      )}
    </div>
  );
}

export default App;
