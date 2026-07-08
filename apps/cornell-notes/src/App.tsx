import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { CornellNote, GitRepoSettings, Subject } from './types';
import { getNotes, saveNote, deleteNote, getSubjects, saveSubjects, getGitRepoSettings, saveGitRepoSettings, generateId, getTodayStr } from './storage';
import { StudyTimerBadge } from './StudyTimerBadge';
import { useAuth } from './useAuth';

type View = 'list' | 'edit' | 'view' | 'subjects' | 'repo';
type Theme = 'dark' | 'light';
const THEME_KEY = 'playground-theme';
const getTheme = (): Theme => localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';

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

const COLORS = ['#70a1ff','#2ed573','#ffa502','#ff4757','#ff6b81','#a29bfe','#00cec9','#fd79a8','#fdcb6e','#55efc4'];

const sanitizePathPart = (value: string): string =>
  (value || 'untitled')
    .trim()
    .replace(/[\\/:*?"<>|#{}%~&]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'untitled';

const normalizeBasePath = (value: string): string =>
  value.trim().replace(/^\/+|\/+$/g, '');

const noteToMarkdown = (note: CornellNote, subject: string): string => [
  `# ${note.title || '(제목 없음)'}`,
  '',
  `- 과목: ${subject}`,
  `- 날짜: ${note.date}`,
  `- 생성: ${note.createdAt}`,
  `- 수정: ${note.updatedAt}`,
  '',
  '## 키워드 / 질문',
  '',
  note.cues || '-',
  '',
  '## 세부 내용',
  '',
  note.notes || '-',
  '',
  '## 요약',
  '',
  note.summary || '-',
  '',
].join('\n');

export default function App() {
  const authed = useAuth();
  const [notes, setNotes] = useState<CornellNote[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<CornellNote | null>(null);
  const [filterSubject, setFilterSubject] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectColor, setNewSubjectColor] = useState(COLORS[0]);
  const [theme, setTheme] = useState<Theme>(getTheme);
  const [repoSettings, setRepoSettings] = useState<GitRepoSettings>(() => getGitRepoSettings());
  const [repoDraft, setRepoDraft] = useState<GitRepoSettings>(() => getGitRepoSettings());
  const [commitStatus, setCommitStatus] = useState('');
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!authed) return;
    setNotes(getNotes());
    setSubjects(getSubjects());
  }, [authed]);

  if (!authed) return null;

  const subjectName = (id: string) => subjects.find(s => s.id === id)?.name ?? '?';
  const subjectColor = (id: string) => subjects.find(s => s.id === id)?.color ?? '#888';

  const filtered = notes
    .filter(n => filterSubject === 'all' || n.subjectId === filterSubject)
    .filter(n => !searchQuery || n.title.includes(searchQuery) || n.notes.includes(searchQuery) || n.cues.includes(searchQuery));

  const handleNew = () => {
    const subjectId = filterSubject !== 'all' ? filterSubject : subjects[0]?.id ?? '1';
    setSelected(EMPTY_NOTE(subjectId));
    setView('edit');
  };

  const handleSave = () => {
    if (!selected) return;
    const updated = { ...selected, updatedAt: new Date().toISOString() };
    saveNote(updated);
    setNotes(getNotes());
    setSelected(updated);
    setView('view');
  };

  const handleDelete = (id: string) => {
    deleteNote(id);
    setNotes(getNotes());
    setSelected(null);
    setView('list');
  };

  const handleAddSubject = () => {
    if (!newSubjectName.trim()) return;
    const updated = [...subjects, { id: generateId(), name: newSubjectName.trim(), color: newSubjectColor }];
    setSubjects(updated);
    saveSubjects(updated);
    setNewSubjectName('');
  };

  const handleDeleteSubject = (id: string) => {
    const updated = subjects.filter(s => s.id !== id);
    setSubjects(updated);
    saveSubjects(updated);
  };

  const handleSaveRepoSettings = () => {
    const updated = {
      repo: repoDraft.repo.trim(),
      basePath: normalizeBasePath(repoDraft.basePath) || 'cornell-notes',
    };
    setRepoSettings(updated);
    setRepoDraft(updated);
    saveGitRepoSettings(updated);
    setCommitStatus('레포 설정을 저장했어요.');
  };

  const handleCommitNote = async () => {
    if (!selected || committing) return;
    if (!repoSettings.repo.trim()) {
      setRepoDraft(repoSettings);
      setView('repo');
      setCommitStatus('먼저 GitHub 레포를 owner/repo 형식으로 설정해주세요.');
      return;
    }

    setCommitting(true);
    setCommitStatus('GitHub에 커밋하는 중...');
    const fileName = `${selected.date}-${sanitizePathPart(selected.title)}.md`;
    const basePath = normalizeBasePath(repoSettings.basePath);
    const filePath = basePath ? `${basePath}/${fileName}` : fileName;

    try {
      const res = await fetch('/github/commit-file', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: repoSettings.repo.trim(),
          filePath,
          content: noteToMarkdown(selected, subjectName(selected.subjectId)),
          message: `Add Cornell note: ${selected.title || selected.date}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '커밋에 실패했어요.');
      setCommitStatus(`커밋 완료: ${filePath}`);
      if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setCommitStatus(e instanceof Error ? e.message : '커밋에 실패했어요.');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="back-link">← 놀이터</a>
        <div className="header-content">
          <h1 className="app-title">📝 코넬 노트</h1>
          <p className="app-subtitle">구조적으로 배운 내용을 정리하세요</p>
        </div>
        <nav className="header-nav">
          <button className={`nav-btn ${view !== 'subjects' && view !== 'repo' ? 'active' : ''}`} onClick={() => setView('list')}>📋 노트</button>
          <button className={`nav-btn ${view === 'subjects' ? 'active' : ''}`} onClick={() => setView('subjects')}>📚 과목</button>
          <button className={`nav-btn ${view === 'repo' ? 'active' : ''}`} onClick={() => { setRepoDraft(repoSettings); setView('repo'); }}>GitHub</button>
        </nav>
        <StudyTimerBadge />
        <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="테마 전환">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>

      {view === 'repo' ? (
        <main className="app-main">
          <div className="repo-panel">
            <h2 className="section-title">GitHub 연동</h2>
            <label className="repo-field">
              <span>레포</span>
              <input
                className="subject-input"
                placeholder="owner/repository"
                value={repoDraft.repo}
                onChange={e => setRepoDraft({ ...repoDraft, repo: e.target.value })}
              />
            </label>
            <label className="repo-field">
              <span>저장 폴더</span>
              <input
                className="subject-input"
                placeholder="cornell-notes"
                value={repoDraft.basePath}
                onChange={e => setRepoDraft({ ...repoDraft, basePath: e.target.value })}
              />
            </label>
            <div className="repo-actions">
              <button className="btn-primary" onClick={handleSaveRepoSettings}>설정 저장</button>
              <button className="btn-ghost" onClick={() => setView(selected ? 'view' : 'list')}>돌아가기</button>
            </div>
            {commitStatus && <p className="repo-status">{commitStatus}</p>}
          </div>
        </main>
      ) : view === 'subjects' ? (
        <main className="app-main">
          <div className="subjects-panel">
            <h2 className="section-title">과목 관리</h2>
            <div className="subject-add-form">
              <input
                className="subject-input"
                placeholder="과목 이름"
                value={newSubjectName}
                onChange={e => setNewSubjectName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSubject()}
              />
              <div className="color-picker">
                {COLORS.map(c => (
                  <button
                    key={c}
                    className={`color-dot ${newSubjectColor === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewSubjectColor(c)}
                  />
                ))}
              </div>
              <button className="btn-primary" onClick={handleAddSubject}>추가</button>
            </div>
            <div className="subject-list">
              {subjects.map(s => (
                <div key={s.id} className="subject-item">
                  <span className="subject-dot" style={{ background: s.color }} />
                  <span className="subject-name">{s.name}</span>
                  <button className="btn-delete" onClick={() => handleDeleteSubject(s.id)}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </main>
      ) : view === 'edit' && selected ? (
        <main className="app-main">
          <div className="editor-toolbar">
            <input
              className="title-input"
              placeholder="노트 제목"
              value={selected.title}
              onChange={e => setSelected({ ...selected, title: e.target.value })}
            />
            <div className="toolbar-row">
              <select className="select-field" value={selected.subjectId} onChange={e => setSelected({ ...selected, subjectId: e.target.value })}>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input type="date" className="select-field" value={selected.date} onChange={e => setSelected({ ...selected, date: e.target.value })} />
              <div className="toolbar-actions">
                <button className="btn-ghost" onClick={() => { setRepoDraft(repoSettings); setView('repo'); }}>GitHub 설정</button>
                <button className="btn-primary" onClick={handleSave}>저장</button>
                <button className="btn-ghost" onClick={() => setView(notes.find(n => n.id === selected.id) ? 'view' : 'list')}>취소</button>
              </div>
            </div>
          </div>
          <div className="cornell-layout">
            <div className="cornell-top">
              <div className="cornell-cues-panel">
                <div className="cornell-label">🔑 키워드 / 질문</div>
                <textarea
                  className="cornell-textarea"
                  placeholder={'핵심 키워드나\n질문을 적어보세요'}
                  value={selected.cues}
                  onChange={e => setSelected({ ...selected, cues: e.target.value })}
                />
              </div>
              <div className="cornell-notes-panel">
                <div className="cornell-label">📖 세부 내용</div>
                <textarea
                  className="cornell-textarea"
                  placeholder={'강의 내용, 개념 설명,\n예시 등을 자세히 적어보세요'}
                  value={selected.notes}
                  onChange={e => setSelected({ ...selected, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="cornell-summary-panel">
              <div className="cornell-label">✍️ 요약</div>
              <textarea
                className="cornell-textarea summary-textarea"
                placeholder="오늘 배운 내용을 한두 문장으로 요약해보세요"
                value={selected.summary}
                onChange={e => setSelected({ ...selected, summary: e.target.value })}
              />
            </div>
          </div>
        </main>
      ) : view === 'view' && selected ? (
        <main className="app-main">
          <div className="viewer-header">
            <button className="btn-ghost" onClick={() => setView('list')}>← 목록</button>
            <div className="viewer-title-block">
              <h2 className="viewer-title">{selected.title || '(제목 없음)'}</h2>
              <div className="viewer-meta">
                <span className="subject-badge" style={{ background: subjectColor(selected.subjectId) + '22', color: subjectColor(selected.subjectId), border: `1px solid ${subjectColor(selected.subjectId)}` }}>
                  {subjectName(selected.subjectId)}
                </span>
                <span className="meta-date">{selected.date}</span>
              </div>
            </div>
            <div className="viewer-actions">
              <button className="btn-ghost" onClick={handleCommitNote} disabled={committing}>{committing ? '커밋 중...' : 'GitHub 커밋'}</button>
              <button className="btn-ghost" onClick={() => setView('edit')}>✏️ 수정</button>
              <button className="btn-danger" onClick={() => handleDelete(selected.id)}>🗑️ 삭제</button>
            </div>
          </div>
          {commitStatus && <p className="repo-status compact">{commitStatus}</p>}
          <div className="cornell-layout">
            <div className="cornell-top">
              <div className="cornell-cues-panel">
                <div className="cornell-label">🔑 키워드 / 질문</div>
                <p className="cornell-text">{selected.cues || '—'}</p>
              </div>
              <div className="cornell-notes-panel">
                <div className="cornell-label">📖 세부 내용</div>
                {selected.notes ? (
                  <div className="cornell-markdown">
                    <ReactMarkdown>{selected.notes}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="cornell-text">—</p>
                )}
              </div>
            </div>
            <div className="cornell-summary-panel">
              <div className="cornell-label">✍️ 요약</div>
              <p className="cornell-text">{selected.summary || '—'}</p>
            </div>
          </div>
        </main>
      ) : (
        <main className="app-main">
          <div className="list-toolbar">
            <input
              className="search-input"
              placeholder="🔍 노트 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <select className="select-field" value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
              <option value="all">전체 과목</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn-ghost" onClick={() => { setRepoDraft(repoSettings); setView('repo'); }}>GitHub 설정</button>
            <button className="btn-primary" onClick={handleNew}>+ 새 노트</button>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <p className="empty-icon">📝</p>
              <p>노트가 없어요.</p>
              <p className="empty-sub">코넬 노트 방식으로 핵심 키워드, 세부 내용, 요약을 구조적으로 정리해보세요.</p>
              <button className="btn-primary mt-16" onClick={handleNew}>+ 첫 노트 만들기</button>
            </div>
          ) : (
            <div className="notes-grid">
              {filtered.map(note => (
                <div
                  key={note.id}
                  className="note-card"
                  style={{ borderTop: `3px solid ${subjectColor(note.subjectId)}` }}
                  onClick={() => { setSelected(note); setView('view'); }}
                >
                  <div className="note-card-header">
                    <span className="note-subject" style={{ color: subjectColor(note.subjectId) }}>{subjectName(note.subjectId)}</span>
                    <span className="note-date">{note.date}</span>
                  </div>
                  <h3 className="note-title">{note.title || '(제목 없음)'}</h3>
                  {note.summary && <p className="note-summary">{note.summary}</p>}
                  {note.cues && <p className="note-cues">🔑 {note.cues.split('\n')[0]}</p>}
                </div>
              ))}
            </div>
          )}
        </main>
      )}
    </div>
  );
}
