import { useState } from 'react';
import type { Subject } from '../../../entities/subject';
import type { StudySession } from '../../../entities/session';
import { formatDuration, getMonthDates, getSessionSeconds } from '../../../shared/lib';

interface Props {
  subjects: Subject[];
  sessions: StudySession[];
  dailyGoalMinutes: number;
}

export function CalendarView({ subjects, sessions, dailyGoalMinutes }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const cells = getMonthDates(year, month);
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const dailyGoalSeconds = dailyGoalMinutes * 60;

  const getDayTotal = (date: string) =>
    sessions.filter(s => s.date === date).reduce((sum, s) => sum + getSessionSeconds(s), 0);

  const getColor = (secs: number): string => {
    if (secs === 0) return 'transparent';
    const ratio = Math.min(secs / dailyGoalSeconds, 1);
    if (ratio >= 1) return '#2ed573';
    if (ratio >= 0.7) return '#70a1ff';
    if (ratio >= 0.4) return '#a29bfe';
    return '#3a3a5c';
  };

  const prevMonth = () => month === 0 ? (setYear(y => y - 1), setMonth(11)) : setMonth(m => m - 1);
  const nextMonth = () => month === 11 ? (setYear(y => y + 1), setMonth(0)) : setMonth(m => m + 1);

  const selectedSessions = selectedDate ? sessions.filter(s => s.date === selectedDate) : [];

  return (
    <div className="calendar-page">
      <div className="section-card">
        <div className="calendar-nav">
          <button className="btn-nav" onClick={prevMonth}>‹</button>
          <h3 className="calendar-title">{year}년 {month + 1}월</h3>
          <button className="btn-nav" onClick={nextMonth}>›</button>
        </div>

        <div className="calendar-day-labels">
          {dayLabels.map((d, i) => (
            <span key={d} className={`cal-day-label ${i === 0 ? 'sun' : ''}`}>{d}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {cells.map((date, i) => {
            if (!date) return <div key={`empty-${i}`} className="cal-cell empty" />;
            const secs = getDayTotal(date);
            const isToday = date === today.toISOString().split('T')[0];
            const isSelected = date === selectedDate;
            const dayNum = parseInt(date.split('-')[2]);
            const dayOfWeek = new Date(date).getDay();
            return (
              <div
                key={date}
                className={`cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedDate(isSelected ? null : date)}
              >
                <span className={`cal-day-num ${dayOfWeek === 0 ? 'sun' : ''}`}>{dayNum}</span>
                {secs > 0 && <div className="cal-dot" style={{ backgroundColor: getColor(secs) }} />}
                {secs > 0 && (
                  <span className="cal-mins">
                    {secs >= 3600 ? `${Math.floor(secs / 3600)}h` : `${Math.floor(secs / 60)}m`}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="cal-legend">
          <span style={{ color: '#3a3a5c' }}>■</span> 입문
          <span style={{ color: '#a29bfe' }}>■</span> 40%↑
          <span style={{ color: '#70a1ff' }}>■</span> 70%↑
          <span style={{ color: '#2ed573' }}>■</span> 달성
        </div>
      </div>

      {selectedDate && (
        <div className="section-card">
          <h3 className="section-title">{selectedDate} 기록</h3>
          {selectedSessions.length === 0 ? (
            <p className="empty-text">공부 기록이 없어요.</p>
          ) : (
            <>
              <div className="selected-day-total">
                총 <strong>{formatDuration(getDayTotal(selectedDate))}</strong>
              </div>
              <div className="session-list">
                {selectedSessions.map(session => {
                  const subject = subjects.find(s => s.id === session.subjectId);
                  const start = new Date(session.startTime);
                  const end = new Date(session.endTime);
                  return (
                    <div key={session.id} className="session-item">
                      <div className="session-left">
                        <span className="subject-dot" style={{ backgroundColor: subject?.color ?? '#888' }} />
                        <div>
                          <div className="session-subject">{subject?.name ?? '삭제된 과목'}</div>
                          <div className="session-time-info">
                            {start.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} ~
                            {end.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          {session.memo && <div className="session-memo">{session.memo}</div>}
                        </div>
                      </div>
                      <span className="session-duration">{formatDuration(getSessionSeconds(session))}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
