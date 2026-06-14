import { useState } from 'react';
import type { WastedTimeEntry } from '../types';
import { getWastedTime, addWastedTime, deleteWastedTime } from '../storage';
import { ConfirmModal } from './ConfirmModal';
import { DateFilter, filterEntries } from './DateFilter';
import type { FilterType } from './DateFilter';

const CATEGORIES: WastedTimeEntry['category'][] = ['유튜브', '쇼츠', '게임', '배달앱', 'SNS', '기타'];

const categoryEmoji: Record<WastedTimeEntry['category'], string> = {
  유튜브: '📺',
  쇼츠: '📱',
  게임: '🎮',
  배달앱: '🍕',
  SNS: '💬',
  기타: '⏳',
};

type AmPm = '오전' | '오후';

function to24Hour(hour: number, minute: number, ampm: AmPm): string {
  let h = hour;
  if (ampm === '오전') {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function to12Hour(time24: string): { hour: number; minute: number; ampm: AmPm } {
  const [h, m] = time24.split(':').map(Number);
  if (h === 0) return { hour: 12, minute: m, ampm: '오전' };
  if (h < 12) return { hour: h, minute: m, ampm: '오전' };
  if (h === 12) return { hour: 12, minute: m, ampm: '오후' };
  return { hour: h - 12, minute: m, ampm: '오후' };
}

function calcMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function formatTime(mins: number): string {
  if (mins < 60) return `${mins}분`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

function formatDisplay(time24: string): string {
  const { hour, minute, ampm } = to12Hour(time24);
  return `${ampm} ${hour}:${String(minute).padStart(2, '0')}`;
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export function WastedTime() {
  const [entries, setEntries] = useState<WastedTimeEntry[]>(getWastedTime);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<WastedTimeEntry['category']>('유튜브');
  const [startHour, setStartHour] = useState(9);
  const [startMinute, setStartMinute] = useState(0);
  const [startAmPm, setStartAmPm] = useState<AmPm>('오전');
  const [endHour, setEndHour] = useState(10);
  const [endMinute, setEndMinute] = useState(0);
  const [endAmPm, setEndAmPm] = useState<AmPm>('오전');
  const [note, setNote] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [customFilterDate, setCustomFilterDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const startTime = to24Hour(startHour, startMinute, startAmPm);
    const endTime = to24Hour(endHour, endMinute, endAmPm);

    const entry = addWastedTime({
      date: selectedDate,
      category,
      startTime,
      endTime,
      note: note.trim() || undefined,
    });
    setEntries([entry, ...entries]);
    setNote('');
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    deleteWastedTime(id);
    setEntries(entries.filter((e) => e.id !== id));
    setDeleteTarget(null);
  };

  const filteredEntries = filterEntries(entries, filter, customFilterDate);

  // 통계 계산
  const todayStr = new Date().toISOString().split('T')[0];
  const todayEntries = entries.filter((e) => e.date === todayStr);
  const todayTotal = todayEntries.reduce((sum, e) => sum + calcMinutes(e.startTime, e.endTime), 0);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStr = weekAgo.toISOString().split('T')[0];
  const weekEntries = entries.filter((e) => e.date >= weekStr);
  const weekTotal = weekEntries.reduce((sum, e) => sum + calcMinutes(e.startTime, e.endTime), 0);

  // 카테고리별 통계
  const categoryStats = CATEGORIES.map((cat) => {
    const catEntries = weekEntries.filter((e) => e.category === cat);
    const total = catEntries.reduce((sum, e) => sum + calcMinutes(e.startTime, e.endTime), 0);
    return { category: cat, total };
  }).filter((s) => s.total > 0).sort((a, b) => b.total - a.total);

  const maxCatTotal = categoryStats.length > 0 ? categoryStats[0].total : 1;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>⏰ 버린 시간 추적기</h2>
        <p className="panel-desc">자기혐오가 아닌 패턴 이해. 생활 흐름을 분석하자.</p>
      </div>

      {/* 통계 요약 */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-label">오늘</span>
          <span className="stat-value">{formatTime(todayTotal)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">이번 주</span>
          <span className="stat-value">{formatTime(weekTotal)}</span>
        </div>
      </div>

      {/* 카테고리별 바 차트 */}
      {categoryStats.length > 0 && (
        <div className="chart-section">
          <h3 className="chart-title">📊 이번 주 패턴</h3>
          <div className="bar-chart">
            {categoryStats.map((stat) => (
              <div key={stat.category} className="bar-row">
                <span className="bar-label">
                  {categoryEmoji[stat.category]} {stat.category}
                </span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(stat.total / maxCatTotal) * 100}%` }}
                  />
                </div>
                <span className="bar-value">{formatTime(stat.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 입력 영역 */}
      {!showForm ? (
        <button className="btn-add" onClick={() => setShowForm(true)}>
          + 시간 기록하기
        </button>
      ) : (
        <form className="entry-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="wasted-date">날짜</label>
            <input
              id="wasted-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <label htmlFor="wasted-category">뭐에 시간 썼나?</label>
            <select
              id="wasted-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as WastedTimeEntry['category'])}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryEmoji[c]} {c}
                </option>
              ))}
            </select>
          </div>

          {/* 시작 시간 */}
          <div className="form-row">
            <label>시작 시간</label>
            <div className="time-picker-row">
              <div className="ampm-toggle">
                <button
                  type="button"
                  className={`ampm-btn ${startAmPm === '오전' ? 'active' : ''}`}
                  onClick={() => setStartAmPm('오전')}
                >오전</button>
                <button
                  type="button"
                  className={`ampm-btn ${startAmPm === '오후' ? 'active' : ''}`}
                  onClick={() => setStartAmPm('오후')}
                >오후</button>
              </div>
              <select
                className="time-select"
                value={startHour}
                onChange={(e) => setStartHour(Number(e.target.value))}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>{h}시</option>
                ))}
              </select>
              <select
                className="time-select"
                value={startMinute}
                onChange={(e) => setStartMinute(Number(e.target.value))}
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
                ))}
              </select>
            </div>
          </div>

          {/* 끝 시간 */}
          <div className="form-row">
            <label>끝 시간</label>
            <div className="time-picker-row">
              <div className="ampm-toggle">
                <button
                  type="button"
                  className={`ampm-btn ${endAmPm === '오전' ? 'active' : ''}`}
                  onClick={() => setEndAmPm('오전')}
                >오전</button>
                <button
                  type="button"
                  className={`ampm-btn ${endAmPm === '오후' ? 'active' : ''}`}
                  onClick={() => setEndAmPm('오후')}
                >오후</button>
              </div>
              <select
                className="time-select"
                value={endHour}
                onChange={(e) => setEndHour(Number(e.target.value))}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>{h}시</option>
                ))}
              </select>
              <select
                className="time-select"
                value={endMinute}
                onChange={(e) => setEndMinute(Number(e.target.value))}
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <label htmlFor="wasted-note">메모 (선택)</label>
            <input
              id="wasted-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 새벽에 릴스 무한스크롤..."
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-submit">기록하기</button>
            <button type="button" className="btn-cancel" onClick={() => setShowForm(false)}>취소</button>
          </div>
        </form>
      )}

      {/* 기록 목록 영역 */}
      <div className="records-section">
        <h3 className="section-title">📋 내 기록</h3>
        <DateFilter
          filter={filter}
          customDate={customFilterDate}
          onFilterChange={setFilter}
          onCustomDateChange={setCustomFilterDate}
        />
        <div className="entries-list">
          {filteredEntries.length === 0 && (
            <div className="empty-state">
              <p>해당 기간에 기록된 시간이 없어요.</p>
              <p className="empty-sub">패턴을 이해하려면 먼저 기록부터.</p>
            </div>
          )}
          {filteredEntries.map((entry) => (
            <div key={entry.id} className="entry-card wasted-card">
              <div className="entry-top">
                <span className="entry-category">{categoryEmoji[entry.category]} {entry.category}</span>
                <span className="entry-date">{entry.date}</span>
              </div>
              <div className="wasted-time-display">
                <span className="time-range">{formatDisplay(entry.startTime)} ~ {formatDisplay(entry.endTime)}</span>
                <span className="time-duration">({formatTime(calcMinutes(entry.startTime, entry.endTime))})</span>
              </div>
              {entry.note && <p className="entry-desc">{entry.note}</p>}
              <button className="btn-delete" onClick={() => setDeleteTarget(entry.id)} aria-label="삭제">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmModal
          message="이 시간 기록을 정말 삭제할까요?"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
