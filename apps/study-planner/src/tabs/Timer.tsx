import { useState, useEffect, useRef } from 'react';
import type { Subject, StudySession } from '../types';
import { addSession, getSessions, getStreak, getWeekStudyDays } from '../storage';
import { formatTimer, formatDuration, getTodayStr } from '../utils';

interface Props {
  subjects: Subject[];
  onSessionAdded: () => void;
  todayTotal: number;
  dailyGoalMinutes: number;
}

export function Timer({ subjects, onSessionAdded, todayTotal, dailyGoalMinutes }: Props) {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(subjects[0]?.id ?? '');
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [memo, setMemo] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const todaySessions = getSessions().filter(s => s.date === getTodayStr());
  const streak = getStreak();
  const weekDays = getWeekStudyDays();
  const progressPct = Math.min((todayTotal / dailyGoalMinutes) * 100, 100);
  const achieved = progressPct >= 100;

  useEffect(() => {
    if (subjects.length > 0 && !selectedSubjectId) {
      setSelectedSubjectId(subjects[0].id);
    }
  }, [subjects]);

  const start = () => {
    if (!selectedSubjectId) return;
    const now = new Date();
    setStartTime(now);
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);
  };

  const stop = () => {
    if (!intervalRef.current) return;
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);

    if (elapsed < 60) {
      setElapsed(0);
      return;
    }

    const endTime = new Date();
    const session: StudySession = {
      id: crypto.randomUUID(),
      subjectId: selectedSubjectId,
      date: getTodayStr(),
      startTime: startTime!.toISOString(),
      endTime: endTime.toISOString(),
      durationMinutes: Math.floor(elapsed / 60),
      memo: memo.trim() || undefined,
    };
    addSession(session);
    setElapsed(0);
    setMemo('');
    onSessionAdded();
  };

  const reset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    setElapsed(0);
  };

  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);

  return (
    <div className="timer-page">
      {/* 상단 배지 행 */}
      <div className="badge-row">
        <div className="info-badge">
          <span className="badge-icon">🔥</span>
          <span className="badge-value">{streak}일</span>
          <span className="badge-label">연속</span>
        </div>
        <div className="info-badge">
          <span className="badge-icon">📅</span>
          <span className="badge-value">{weekDays}일</span>
          <span className="badge-label">이번주</span>
        </div>
        <div className={`info-badge ${achieved ? 'achieved' : ''}`}>
          <span className="badge-icon">{achieved ? '🏆' : '🎯'}</span>
          <span className="badge-value">{Math.floor(progressPct)}%</span>
          <span className="badge-label">{achieved ? '목표달성!' : '오늘목표'}</span>
        </div>
      </div>

      {/* 오늘 전체 진행률 */}
      <div className="daily-progress-card">
        <div className="daily-progress-header">
          <span>오늘의 목표</span>
          <span className="daily-progress-time">
            <strong>{formatDuration(todayTotal)}</strong> / {formatDuration(dailyGoalMinutes)}
          </span>
        </div>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${progressPct}%`, backgroundColor: achieved ? '#2ed573' : '#70a1ff' }}
          />
        </div>
      </div>

      {/* 타이머 */}
      <div className="timer-card" style={{ borderColor: running ? (selectedSubject?.color ?? '#70a1ff') : 'var(--border)' }}>
        <div className="timer-subject-selector">
          {subjects.length === 0 ? (
            <p className="timer-no-subject">먼저 과목을 추가해주세요 →  과목 탭</p>
          ) : (
            <div className="subject-chips">
              {subjects.map(s => (
                <button
                  key={s.id}
                  className={`subject-chip ${selectedSubjectId === s.id ? 'active' : ''}`}
                  style={selectedSubjectId === s.id
                    ? { backgroundColor: s.color, borderColor: s.color, color: '#fff' }
                    : { borderColor: s.color, color: s.color }}
                  onClick={() => !running && setSelectedSubjectId(s.id)}
                  disabled={running}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="timer-display" style={{ color: running ? (selectedSubject?.color ?? '#e8e8e8') : '#e8e8e8' }}>
          {formatTimer(elapsed)}
        </div>

        <div className="timer-controls">
          {!running ? (
            <button
              className="btn-timer-start"
              onClick={start}
              disabled={!selectedSubjectId}
              style={{ backgroundColor: selectedSubject?.color ?? '#70a1ff' }}
            >
              ▶ 시작
            </button>
          ) : (
            <button className="btn-timer-stop" onClick={stop}>
              ⏹ 종료
            </button>
          )}
          {!running && elapsed > 0 && (
            <button className="btn-timer-reset" onClick={reset}>초기화</button>
          )}
        </div>

        {running && (
          <input
            className="timer-memo"
            type="text"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="무엇을 공부하고 있나요? (선택)"
          />
        )}

        {elapsed > 0 && elapsed < 60 && !running && (
          <p className="timer-min-notice">1분 이상 공부해야 기록됩니다</p>
        )}
      </div>

      {/* 오늘 과목별 현황 */}
      {subjects.length > 0 && (
        <div className="today-subjects">
          <h3 className="section-title">오늘의 과목별 현황</h3>
          <div className="subject-stats-list">
            {subjects.map(s => {
              const mins = todaySessions.filter(ss => ss.subjectId === s.id).reduce((sum, ss) => sum + ss.durationMinutes, 0);
              const goal = s.dailyGoalMinutes;
              const pct = goal > 0 ? Math.min((mins / goal) * 100, 100) : 0;
              return (
                <div key={s.id} className="subject-stat-row">
                  <div className="subject-stat-info">
                    <span className="subject-dot" style={{ backgroundColor: s.color }} />
                    <span className="subject-stat-name">{s.name}</span>
                  </div>
                  <div className="subject-stat-right">
                    <div className="mini-progress-track">
                      <div className="mini-progress-fill" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                    </div>
                    <span className="subject-stat-time">
                      {formatDuration(mins)}{goal > 0 ? ` / ${formatDuration(goal)}` : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
