import type { Subject } from '../../../entities/subject';
import type { StudySession } from '../../../entities/session';
import { deleteSessionAsync, getStreak, getWeekStudyDays } from '../../../entities/session';
import { formatDuration, getWeekDates, getSessionSeconds } from '../../../shared/lib';

interface Props {
  subjects: Subject[];
  sessions: StudySession[];
  onSessionDeleted: () => void;
}

export function Stats({ subjects, sessions, onSessionDeleted }: Props) {
  const weekDates = getWeekDates();
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const getSubject = (id: string) => subjects.find(s => s.id === id);

  const weekData = weekDates.map(date => ({
    date,
    total: sessions.filter(s => s.date === date).reduce((sum, s) => sum + getSessionSeconds(s), 0),
  }));
  const maxWeek = Math.max(...weekData.map(d => d.total), 1);

  const subjectTotals = subjects.map(s => ({
    subject: s,
    total: sessions.filter(ss => ss.subjectId === s.id).reduce((sum, ss) => sum + getSessionSeconds(ss), 0),
  })).sort((a, b) => b.total - a.total);

  const streak = getStreak(sessions);
  const weekDays = getWeekStudyDays(sessions);
  const totalAllSeconds = sessions.reduce((sum, s) => sum + getSessionSeconds(s), 0);
  const avgWeekSeconds = Math.floor(weekData.reduce((s, d) => s + d.total, 0) / 7);
  const recentSessions = [...sessions].slice(0, 20);

  const handleDelete = (id: string) => {
    deleteSessionAsync(id);
    onSessionDeleted();
  };

  return (
    <div className="stats-page">
      <div className="stat-cards-row">
        <div className="stat-card-item">
          <span className="stat-card-label">총 공부 시간</span>
          <span className="stat-card-value">{formatDuration(totalAllSeconds)}</span>
        </div>
        <div className="stat-card-item">
          <span className="stat-card-label">🔥 연속</span>
          <span className="stat-card-value" style={{ color: streak > 0 ? '#ffa502' : undefined }}>{streak}일</span>
        </div>
        <div className="stat-card-item">
          <span className="stat-card-label">일 평균 (7일)</span>
          <span className="stat-card-value">{formatDuration(avgWeekSeconds)}</span>
        </div>
      </div>

      <div className="section-card">
        <h3 className="section-title">📊 주간 현황 (이번주 {weekDays}일 출석)</h3>
        <div className="week-chart">
          {weekData.map((d) => {
            const date = new Date(d.date);
            const pct = (d.total / maxWeek) * 100;
            const isToday = d.date === new Date().toISOString().split('T')[0];
            return (
              <div key={d.date} className="week-bar-col">
                <span className="week-bar-time">{d.total > 0 ? formatDuration(d.total) : ''}</span>
                <div className="week-bar-track">
                  <div className="week-bar-fill" style={{ height: `${pct}%`, backgroundColor: isToday ? '#70a1ff' : '#3a3a5c' }} />
                </div>
                <span className={`week-bar-label ${isToday ? 'today' : ''}`}>{dayLabels[date.getDay()]}</span>
                <span className="week-bar-date">{d.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section-card">
        <h3 className="section-title">📚 과목별 누적 시간</h3>
        <div className="subject-total-list">
          {subjectTotals.length === 0 && <p className="empty-text">기록이 없어요.</p>}
          {subjectTotals.map(({ subject, total }) => (
            <div key={subject.id} className="subject-total-row">
              <div className="subject-total-left">
                <span className="subject-dot" style={{ backgroundColor: subject.color }} />
                <span>{subject.name}</span>
              </div>
              <div className="subject-total-right">
                <div className="bar-track-sm">
                  <div className="bar-fill-sm" style={{ width: `${totalAllSeconds > 0 ? (total / totalAllSeconds) * 100 : 0}%`, backgroundColor: subject.color }} />
                </div>
                <span className="subject-total-time">{formatDuration(total)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-card">
        <h3 className="section-title">🕐 최근 기록</h3>
        <div className="session-list">
          {recentSessions.length === 0 && <p className="empty-text">기록이 없어요.</p>}
          {recentSessions.map(session => {
            const subject = getSubject(session.subjectId);
            const start = new Date(session.startTime);
            const end = new Date(session.endTime);
            return (
              <div key={session.id} className="session-item">
                <div className="session-left">
                  <span className="subject-dot" style={{ backgroundColor: subject?.color ?? '#888' }} />
                  <div>
                    <div className="session-subject">{subject?.name ?? '삭제된 과목'}</div>
                    <div className="session-time-info">
                      {session.date}&nbsp;
                      {start.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ~
                      {end.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    {session.memo && <div className="session-memo">{session.memo}</div>}
                  </div>
                </div>
                <div className="session-right">
                  <span className="session-duration">{formatDuration(getSessionSeconds(session))}</span>
                  <button className="btn-del" onClick={() => handleDelete(session.id)}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
