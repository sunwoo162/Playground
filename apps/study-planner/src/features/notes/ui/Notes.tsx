import { useState, useEffect } from 'react';
import type { CornellNote } from '../../../entities/note';
import { getNotesAsync, saveNoteAsync, deleteNoteAsync } from '../../../entities/note';
import type { Subject } from '../../../entities/subject';
import { getTodayStr } from '../../../shared/lib';

interface Props {
  subjects: Subject[];
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const EMPTY_NOTE = (subjectId: string): CornellNote => ({
  id: generateId(),
  subjectId,
  date: getTodayStr(),
  title: '',
  cues: '',
  notes: '',
  summary: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export function Notes({ subjects }: Props) {
  const [notes, setNotes] = useState<CornellNote[]>([]);
  const [selected, setSelected] = useState<CornellNote | null>(null);
  const [editing, setEditing] = useState(false);
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getNotesAsync().then(setNotes);
  }, []);

  const handleNew = () => {
    const subjectId = filterSubject !== 'all' ? filterSubject : subjects[0]?.id ?? '';
    const note = EMPTY_NOTE(subjectId);
    setSelected(note);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    const saved = await saveNoteAsync(selected);
    setNotes(prev => {
      const idx = prev.findIndex(n => n.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setEditing(false);
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await deleteNoteAsync(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const subjectName = (id: string) => subjects.find(s => s.id === id)?.name ?? '?';
  const subjectColor = (id: string) => subjects.find(s => s.id === id)?.color ?? '#888';

  const filtered = filterSubject === 'all'
    ? notes
    : notes.filter(n => n.subjectId === filterSubject);

  return (
    <div className="notes-layout">
      {/* 사이드바 */}
      <aside className="notes-sidebar">
        <div className="notes-sidebar-header">
          <select
            className="notes-filter-select"
            value={filterSubject}
            onChange={e => setFilterSubject(e.target.value)}
          >
            <option value="all">전체 과목</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button className="notes-new-btn" onClick={handleNew}>+ 새 노트</button>
        </div>

        <div className="notes-list">
          {filtered.length === 0 && (
            <p className="notes-empty">노트가 없어요.<br />새 노트를 만들어보세요.</p>
          )}
          {filtered.map(note => (
            <div
              key={note.id}
              className={`notes-item ${selected?.id === note.id ? 'active' : ''}`}
              onClick={() => { setSelected(note); setEditing(false); }}
            >
              <div className="notes-item-header">
                <span
                  className="notes-subject-dot"
                  style={{ background: subjectColor(note.subjectId) }}
                />
                <span className="notes-item-subject">{subjectName(note.subjectId)}</span>
                <span className="notes-item-date">{note.date}</span>
              </div>
              <p className="notes-item-title">{note.title || '(제목 없음)'}</p>
              <p className="notes-item-preview">{note.summary || note.notes || '내용 없음'}</p>
            </div>
          ))}
        </div>
      </aside>

      {/* 메인 영역 */}
      <main className="notes-main">
        {!selected ? (
          <div className="notes-placeholder">
            <p className="notes-placeholder-icon">📝</p>
            <p>노트를 선택하거나 새로 만들어보세요.</p>
            <p className="notes-placeholder-sub">코넬 노트 방식으로 핵심 키워드, 세부 내용, 요약을 구조적으로 정리할 수 있어요.</p>
            <button className="notes-new-btn-center" onClick={handleNew}>+ 새 노트 만들기</button>
          </div>
        ) : editing ? (
          /* 편집 모드 */
          <div className="cornell-editor">
            <div className="cornell-editor-toolbar">
              <input
                className="cornell-title-input"
                placeholder="노트 제목"
                value={selected.title}
                onChange={e => setSelected({ ...selected, title: e.target.value })}
              />
              <div className="cornell-toolbar-actions">
                <select
                  className="cornell-subject-select"
                  value={selected.subjectId}
                  onChange={e => setSelected({ ...selected, subjectId: e.target.value })}
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <input
                  type="date"
                  className="cornell-date-input"
                  value={selected.date}
                  onChange={e => setSelected({ ...selected, date: e.target.value })}
                />
                <button className="notes-save-btn" onClick={handleSave} disabled={saving}>
                  {saving ? '저장 중...' : '저장'}
                </button>
                <button className="notes-cancel-btn" onClick={() => setEditing(false)}>취소</button>
              </div>
            </div>

            {/* 코넬 노트 레이아웃 */}
            <div className="cornell-body">
              <div className="cornell-top">
                <div className="cornell-cues">
                  <div className="cornell-section-label">🔑 키워드 / 질문</div>
                  <textarea
                    className="cornell-textarea"
                    placeholder={'핵심 키워드나\n질문을 적어보세요'}
                    value={selected.cues}
                    onChange={e => setSelected({ ...selected, cues: e.target.value })}
                  />
                </div>
                <div className="cornell-notes">
                  <div className="cornell-section-label">📖 세부 내용</div>
                  <textarea
                    className="cornell-textarea"
                    placeholder={'강의 내용, 개념 설명,\n예시 등을 자세히 적어보세요'}
                    value={selected.notes}
                    onChange={e => setSelected({ ...selected, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="cornell-summary">
                <div className="cornell-section-label">✍️ 요약</div>
                <textarea
                  className="cornell-textarea cornell-summary-textarea"
                  placeholder="오늘 배운 내용을 한두 문장으로 요약해보세요"
                  value={selected.summary}
                  onChange={e => setSelected({ ...selected, summary: e.target.value })}
                />
              </div>
            </div>
          </div>
        ) : (
          /* 읽기 모드 */
          <div className="cornell-viewer">
            <div className="cornell-viewer-header">
              <div>
                <h2 className="cornell-viewer-title">{selected.title || '(제목 없음)'}</h2>
                <div className="cornell-viewer-meta">
                  <span
                    className="cornell-viewer-subject"
                    style={{ background: subjectColor(selected.subjectId) + '33', color: subjectColor(selected.subjectId), border: `1px solid ${subjectColor(selected.subjectId)}` }}
                  >
                    {subjectName(selected.subjectId)}
                  </span>
                  <span className="cornell-viewer-date">{selected.date}</span>
                </div>
              </div>
              <div className="cornell-viewer-actions">
                <button className="notes-edit-btn" onClick={() => setEditing(true)}>✏️ 수정</button>
                <button className="notes-delete-btn" onClick={() => handleDelete(selected.id)}>🗑️ 삭제</button>
              </div>
            </div>

            <div className="cornell-body">
              <div className="cornell-top">
                <div className="cornell-cues">
                  <div className="cornell-section-label">🔑 키워드 / 질문</div>
                  <p className="cornell-content">{selected.cues || '—'}</p>
                </div>
                <div className="cornell-notes">
                  <div className="cornell-section-label">📖 세부 내용</div>
                  <p className="cornell-content">{selected.notes || '—'}</p>
                </div>
              </div>
              <div className="cornell-summary">
                <div className="cornell-section-label">✍️ 요약</div>
                <p className="cornell-content">{selected.summary || '—'}</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
