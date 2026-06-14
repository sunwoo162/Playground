import { useState } from 'react';
import type { FailureEntry } from '../types';
import { getFailures, addFailure, deleteFailure } from '../storage';
import { ConfirmModal } from './ConfirmModal';
import { DateFilter, filterEntries } from './DateFilter';
import type { FilterType } from './DateFilter';

const CATEGORIES: FailureEntry['category'][] = ['면접', '프로젝트', '운동', '습관', '기타'];

const categoryEmoji: Record<FailureEntry['category'], string> = {
  면접: '💼',
  프로젝트: '💻',
  운동: '🏋️',
  습관: '🔄',
  기타: '📝',
};

export function FailureLog() {
  const [entries, setEntries] = useState<FailureEntry[]>(getFailures);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<FailureEntry['category']>('기타');
  const [description, setDescription] = useState('');
  const [lesson, setLesson] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [customFilterDate, setCustomFilterDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const entry = addFailure({
      date: selectedDate,
      category,
      title: title.trim(),
      description: description.trim(),
      lesson: lesson.trim(),
    });
    setEntries([entry, ...entries]);
    setTitle('');
    setDescription('');
    setLesson('');
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    deleteFailure(id);
    setEntries(entries.filter((e) => e.id !== id));
    setDeleteTarget(null);
  };

  const filteredEntries = filterEntries(entries, filter, customFilterDate);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>🔴 실패 기록</h2>
        <p className="panel-desc">실패는 데이터다. 기록하고, 패턴을 찾고, 성장하자.</p>
      </div>

      {/* 입력 영역 */}
      {!showForm ? (
        <button className="btn-add" onClick={() => setShowForm(true)}>
          + 실패 기록하기
        </button>
      ) : (
        <form className="entry-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="failure-date">날짜</label>
            <input
              id="failure-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <label htmlFor="failure-category">카테고리</label>
            <select
              id="failure-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as FailureEntry['category'])}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryEmoji[c]} {c}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="failure-title">무엇이 실패했나?</label>
            <input
              id="failure-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 네이버 면접 탈락"
              required
            />
          </div>
          <div className="form-row">
            <label htmlFor="failure-desc">상황 설명</label>
            <textarea
              id="failure-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="어떤 상황이었는지 간단히"
              rows={3}
            />
          </div>
          <div className="form-row">
            <label htmlFor="failure-lesson">배운 점</label>
            <textarea
              id="failure-lesson"
              value={lesson}
              onChange={(e) => setLesson(e.target.value)}
              placeholder="이 실패에서 뭘 배웠나?"
              rows={2}
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
              <p>해당 기간에 기록된 실패가 없어요.</p>
              <p className="empty-sub">첫 번째 실패를 기록해보세요. 실패는 성장의 증거입니다.</p>
            </div>
          )}
          {filteredEntries.map((entry) => (
            <div key={entry.id} className="entry-card failure-card">
              <div className="entry-top">
                <span className="entry-category">{categoryEmoji[entry.category]} {entry.category}</span>
                <span className="entry-date">{entry.date}</span>
              </div>
              <h3 className="entry-title">{entry.title}</h3>
              {entry.description && <p className="entry-desc">{entry.description}</p>}
              {entry.lesson && (
                <div className="entry-lesson">
                  <span className="lesson-label">💡 배운 점:</span> {entry.lesson}
                </div>
              )}
              <button className="btn-delete" onClick={() => setDeleteTarget(entry.id)} aria-label="삭제">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmModal
          message="이 실패 기록을 정말 삭제할까요?"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
