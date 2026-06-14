import { useState } from 'react';
import type { SmallWinEntry } from '../types';
import { getSmallWins, addSmallWin, deleteSmallWin } from '../storage';
import { ConfirmModal } from './ConfirmModal';
import { EmojiPicker } from './EmojiPicker';
import { DateFilter, filterEntries } from './DateFilter';
import type { FilterType } from './DateFilter';

const QUICK_WINS = [
  { emoji: '🌅', title: '일찍 일어남' },
  { emoji: '💧', title: '물 많이 마심' },
  { emoji: '🚶', title: '산책함' },
  { emoji: '📖', title: '공부 20분' },
  { emoji: '🧘', title: '스트레칭' },
  { emoji: '🍎', title: '건강하게 먹음' },
  { emoji: '🛏️', title: '이불 정리' },
  { emoji: '📵', title: '폰 안 봄 1시간' },
  { emoji: '✍️', title: '일기 씀' },
  { emoji: '🧹', title: '청소함' },
];

export function SmallWins() {
  const [entries, setEntries] = useState<SmallWinEntry[]>(getSmallWins);
  const [showCustom, setShowCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customEmoji, setCustomEmoji] = useState('⭐');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [customFilterDate, setCustomFilterDate] = useState('');

  const handleQuickAdd = (emoji: string, title: string) => {
    const entry = addSmallWin({
      date: selectedDate,
      title,
      emoji,
    });
    setEntries([entry, ...entries]);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim()) return;

    const entry = addSmallWin({
      date: selectedDate,
      title: customTitle.trim(),
      emoji: customEmoji,
    });
    setEntries([entry, ...entries]);
    setCustomTitle('');
    setShowCustom(false);
  };

  const handleDelete = (id: string) => {
    deleteSmallWin(id);
    setEntries(entries.filter((e) => e.id !== id));
    setDeleteTarget(null);
  };

  const filteredEntries = filterEntries(entries, filter, customFilterDate);

  // 오늘 성취 개수
  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = entries.filter((e) => e.date === todayStr).length;

  // 연속 기록 계산
  const getStreak = (): number => {
    const dates = [...new Set(entries.map((e) => e.date))].sort().reverse();
    if (dates.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < dates.length; i++) {
      const expected = new Date(today);
      expected.setDate(expected.getDate() - i);
      const expectedStr = expected.toISOString().split('T')[0];
      if (dates.includes(expectedStr)) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  };

  const streak = getStreak();

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>✅ 작은 성취 수집기</h2>
        <p className="panel-desc">거창한 목표 말고, 작은 승리를 모으자. 자기 강화의 힘.</p>
      </div>

      {/* 통계 */}
      <div className="stats-row">
        <div className="stat-card wins-stat">
          <span className="stat-label">오늘</span>
          <span className="stat-value">{todayCount}개</span>
        </div>
        <div className="stat-card wins-stat">
          <span className="stat-label">연속</span>
          <span className="stat-value">{streak}일 🔥</span>
        </div>
        <div className="stat-card wins-stat">
          <span className="stat-label">총</span>
          <span className="stat-value">{entries.length}개</span>
        </div>
      </div>

      {/* 기록 날짜 선택 */}
      <div className="record-date-row">
        <label htmlFor="wins-record-date">기록 날짜:</label>
        <input
          id="wins-record-date"
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="date-input-inline"
        />
      </div>

      {/* 빠른 기록 버튼 */}
      <div className="quick-wins">
        <h3 className="section-title">원탭 기록</h3>
        <div className="quick-grid">
          {QUICK_WINS.map((win) => (
            <button
              key={win.title}
              className="quick-btn"
              onClick={() => handleQuickAdd(win.emoji, win.title)}
              aria-label={win.title}
            >
              <span className="quick-emoji">{win.emoji}</span>
              <span className="quick-label">{win.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 커스텀 추가 */}
      {!showCustom ? (
        <button className="btn-add" onClick={() => setShowCustom(true)}>
          + 직접 입력하기
        </button>
      ) : (
        <form className="entry-form" onSubmit={handleCustomSubmit}>
          <div className="form-row">
            <label>이모지</label>
            <button
              type="button"
              className="emoji-select-btn"
              onClick={() => setShowEmojiPicker(true)}
            >
              <span className="emoji-preview">{customEmoji}</span>
              <span className="emoji-change-label">변경</span>
            </button>
          </div>
          <div className="form-row">
            <label htmlFor="win-title">뭘 해냈나?</label>
            <input
              id="win-title"
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="예: 30분 독서"
              required
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-submit">기록하기</button>
            <button type="button" className="btn-cancel" onClick={() => setShowCustom(false)}>취소</button>
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
              <p>해당 기간에 기록된 성취가 없어요.</p>
              <p className="empty-sub">작은 것부터 시작해보세요. 물 한 잔도 성취입니다.</p>
            </div>
          )}
          {filteredEntries.map((entry) => (
            <div key={entry.id} className="entry-card win-card">
              <div className="win-content">
                <span className="win-emoji">{entry.emoji}</span>
                <div>
                  <span className="win-title">{entry.title}</span>
                  <span className="entry-date">{entry.date}</span>
                </div>
              </div>
              <button className="btn-delete" onClick={() => setDeleteTarget(entry.id)} aria-label="삭제">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {showEmojiPicker && (
        <EmojiPicker
          selected={customEmoji}
          onSelect={setCustomEmoji}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          message="이 성취 기록을 정말 삭제할까요?"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
