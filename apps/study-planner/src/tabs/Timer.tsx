import type { Subject, StudySession } from '../types';
import { formatTimer, formatDuration, getTodayStr } from '../utils';
import { getStreak, getWeekStudyDays } from '../storage';

interface Props {
  subjects: Subject[];
  todayTotalSeconds: number;
  dailyGoalMinutes: number;
  running: boolean;
  elapsed: number;
  selectedSubjectId: string;
  memo: string;
  sessions: StudySession[];
  onSelectSubject: (id: string) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onMemoChange: (memo: string) => void;
}

export function Timer({
  subjects, todayTotalSeconds, dailyGoalMinutes,
  running, elapsed, selectedSubjectId, memo, sessions,
  onSelectSubject, onStart, onStop, onReset, onMemoChange,
}: Props) {
  const todaySessions = sessions.filter(s => s.date === getTodayStr());
  const streak = getStreak(sessions);
  const weekDays = getWeekStudyDays(sessions);
  const dailyGoalSeconds = dailyGoalMinutes * 60;
  const progressPct = Math.min((todayTotalSeconds / dailyGoalSeconds) * 100, 100);
  const achieved = progressPct >= 100;
  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);

  return (
    <div className="timer-page">
      {/* 상단 배지 */}
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

      {/* 오늘 진행률 */}
      <div className="daily-progress-card">
        <div className="daily-progress-header">
          <span>오늘의 목표</span>
          <span className="daily-progress-time">
            <strong>{formatDuration(todayTotalSeconds)}</strong> / {formatDuration(dailyGoalSeconds)}
          </span>
        </div>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${progressPct}%`, backgroundColor: achieved ? '#2ed573' : '#70a1ff' }}
          />
        </div>
      </div>

      {/* 타이머 카드 */}
      <div className="timer-card" style={{ borderColor: running ? (selectedSubject?.color ?? '#70a1ff') : 'var(--border)' }}>
        {/* 과목 선택 */}
        <div className="timer-subject-selector">
          {subjects.length === 0 ? (
            <p className="timer-no-subject">먼저 과목 탭에서 과목을 추가해주세요</p>
          ) : (
            <div className="subject-chips">
              {subjects.map(s => (
                <button
                  key={s.id}
                  className={`subject-chip ${selectedSubjectId === s.id ? 'active' : ''}`}
                  style={selectedSubjectId === s.id
                    ? { backgroundColor: s.color, borderColor: s.color, color: '#fff' }
                    : { borderColor: s.color, color: s.color }}
                  onClick={() => !running && onSelectSubject(s.id)}
                  disabled={running}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 시간 표시 */}
        <div className="timer-display" style={{ color: running ? (selectedSubject?.color ?? '#e8e8e8') : '#e8e8e8' }}>
          {formatTimer(elapsed)}
        </div>

        {/* 컨트롤 버튼 */}
        <div className="timer-controls">
          {!running ? (
            <button
              className="btn-timer-start"
              onClick={onStart}
              disabled={!selectedSubjectId || subjects.length === 0}
              style={{ backgroundColor: selectedSubject?.color ?? '#70a1ff' }}
            >
              ▶ 시작
            </button>
          ) : (
            <button className="btn-timer-stop" onClick={onStop}>⏹ 종료</button>
          )}
          {!running && elapsed > 0 && (
            <button className="btn-timer-reset" onClick={onReset}>초기화</button>
          )}
        </div>

        {running && (
          <input
            className="timer-memo"
            type="text"
            value={memo}
            onChange={e => onMemoChange(e.target.value)}
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
              const secs = todaySessions
                .filter(ss => ss.subjectId === s.id)
                .reduce((sum, ss) => sum + (ss.durationSeconds ?? ss.durationMinutes * 60), 0);
              const goalSecs = s.dailyGoalMinutes * 60;
              const pct = goalSecs > 0 ? Math.min((secs / goalSecs) * 100, 100) : 0;
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
                      {formatDuration(secs)}{goalSecs > 0 ? ` / ${formatDuration(goalSecs)}` : ''}
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
