import { useState, useCallback, useEffect, useRef } from 'react';
import type { TabType } from '../shared/model/types';
import type { StudySession } from '../entities/session';
import { getSubjects } from '../entities/subject';
import { getDailyGoal } from '../entities/subject';
import { getSessions, addSession, getTotalSecondsByDate } from '../entities/session';
import { getTodayStr, requestNotificationPermission, sendNotification } from '../shared/lib';
import { Timer } from '../features/timer';
import { Stats } from '../features/stats';
import { CalendarView } from '../features/calendar';
import { Subjects } from '../features/subjects';
import { TabNav } from '../widgets/tab-nav';
import { MiniTimer } from '../widgets/mini-timer';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('timer');
  const [subjects, setSubjects] = useState(getSubjects);
  const [sessions, setSessions] = useState(getSessions);

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(subjects[0]?.id ?? '');
  const [memo, setMemo] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastNotifyHour = useRef<number>(0);
  const elapsedRef = useRef<number>(0);

  useEffect(() => { requestNotificationPermission(); }, []);

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
              `${subject?.name ?? '공부'} ${hours}시간을 채웠어요. 잠깐 쉬어가도 좋아요! 🎉`
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

  useEffect(() => {
    if (subjects.length > 0 && !selectedSubjectId) setSelectedSubjectId(subjects[0].id);
  }, [subjects]);

  const handleRefresh = useCallback(() => setSessions(getSessions()), []);

  const handleStart = () => {
    if (!selectedSubjectId) return;
    setStartTime(new Date());
    lastNotifyHour.current = 0;
    setRunning(true);
  };

  const handleStop = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRunning(false);
    const currentElapsed = elapsedRef.current;
    if (currentElapsed < 1) { setElapsed(0); elapsedRef.current = 0; return; }

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
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
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
          <MiniTimer running={running} elapsed={elapsed} subject={selectedSubject} />
        </div>
      </header>

      <TabNav activeTab={activeTab} running={running} onTabChange={setActiveTab} />

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
          <CalendarView subjects={subjects} sessions={sessions} dailyGoalMinutes={dailyGoal.totalMinutes} />
        )}
        {activeTab === 'subjects' && (
          <Subjects subjects={subjects} onSubjectsChange={setSubjects} />
        )}
      </main>
    </div>
  );
}

export default App;
