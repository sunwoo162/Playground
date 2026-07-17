import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import type { CornellNote, GitRepoSettings, Subject, VelogSettings } from './types';
import { getNotes, saveNote, deleteNote, getSubjects, saveSubjects, getGitRepoSettings, saveGitRepoSettings, getVelogSettings, saveVelogSettings, generateId, getTodayStr } from './storage';
import { StudyTimerBadge } from './StudyTimerBadge';
import { useAuth } from './useAuth';

type View = 'list' | 'edit' | 'view' | 'subjects' | 'repo' | 'detailOnly';
type Theme = 'dark' | 'light';
type MarkdownAction = {
  label: string;
  title: string;
  snippet: string;
  cursorOffset?: number;
  block?: boolean;
  wrap?: [string, string];
};
type VelogPublishResult = {
  url?: string;
  message?: string;
  username?: string;
  slug?: string;
};
const THEME_KEY = 'playground-theme';
const getTheme = (): Theme => localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
const SHARE_HASH_PREFIX = '#share=';
const DETAIL_HASH_PREFIX = '#detail=';

const MARKDOWN_ACTIONS: MarkdownAction[] = [
  { label: 'H2', title: '제목', snippet: '## 제목', cursorOffset: 3, block: true },
  { label: 'B', title: '굵게', snippet: '**굵게**', cursorOffset: 2, wrap: ['**', '**'] },
  { label: 'I', title: '기울임', snippet: '*기울임*', cursorOffset: 1, wrap: ['*', '*'] },
  { label: '•', title: '목록', snippet: '- 항목', cursorOffset: 2, block: true },
  { label: '1.', title: '번호 목록', snippet: '1. 항목', cursorOffset: 3, block: true },
  { label: '[]', title: '체크박스', snippet: '- [ ] 할 일', cursorOffset: 6, block: true },
  { label: '`', title: '인라인 코드', snippet: '`코드`', cursorOffset: 1, wrap: ['`', '`'] },
  { label: '```', title: '코드 블록', snippet: '```\n코드\n```', cursorOffset: 4, block: true },
  { label: '>', title: '인용', snippet: '> 인용문', cursorOffset: 2, block: true },
  { label: '---', title: '구분선', snippet: '---', block: true },
];

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

const formatVelogPublishStatus = (result?: VelogPublishResult): string => {
  if (!result) return 'Velog 발행 완료';
  if (result.message) return result.message;
  if (result.url) return `Velog 발행 완료: ${result.url}`;
  if (result.username && result.slug) return `Velog 발행 완료: @${result.username}/${result.slug}`;
  return 'Velog 발행 완료';
};

const noteToMarkdown = (note: CornellNote, subject: string): string => {
  const lines = [
    `# ${note.title || '(제목 없음)'}`,
    '',
    `- 과목: ${subject}`,
    `- 날짜: ${note.date}`,
    `- 생성: ${note.createdAt}`,
    `- 수정: ${note.updatedAt}`,
    '',
  ];

  if (note.cues.trim()) {
    lines.push('## 키워드 / 질문', '', note.cues, '');
  }

  lines.push('## 세부 내용', '', note.notes || '-', '');

  if (note.summary.trim()) {
    lines.push('## 요약', '', note.summary, '');
  }

  return lines.join('\n');
};

interface SharedNotePayload {
  note: Omit<CornellNote, 'id' | 'createdAt' | 'updatedAt'>;
  subjectName: string;
  subjectColor: string;
}

const encodeSharePayload = (payload: SharedNotePayload): string =>
  btoa(unescape(encodeURIComponent(JSON.stringify(payload))));

const decodeSharePayload = (value: string): SharedNotePayload | null => {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(value))));
  } catch {
    return null;
  }
};

const createShareUrl = (note: CornellNote, subject: Subject | undefined): string => {
  const payload: SharedNotePayload = {
    note: {
      subjectId: note.subjectId,
      date: note.date,
      title: note.title,
      cues: note.cues,
      notes: note.notes,
      summary: note.summary,
    },
    subjectName: subject?.name || '공유 노트',
    subjectColor: subject?.color || COLORS[0],
  };

  return `${window.location.origin}${window.location.pathname}${window.location.search}${SHARE_HASH_PREFIX}${encodeSharePayload(payload)}`;
};

const importSharedNoteFromHash = (currentSubjects: Subject[]): { note: CornellNote; subjects: Subject[] } | null => {
  if (!window.location.hash.startsWith(SHARE_HASH_PREFIX)) return null;

  const payload = decodeSharePayload(window.location.hash.slice(SHARE_HASH_PREFIX.length));
  if (!payload?.note) return null;

  const subjectName = payload.subjectName?.trim() || '공유 노트';
  let subjects = currentSubjects;
  let subject = subjects.find(s => s.name === subjectName);
  if (!subject) {
    subject = { id: generateId(), name: subjectName, color: payload.subjectColor || COLORS[0] };
    subjects = [...subjects, subject];
    saveSubjects(subjects);
  }

  const now = new Date().toISOString();
  const note: CornellNote = {
    ...payload.note,
    id: generateId(),
    subjectId: subject.id,
    createdAt: now,
    updatedAt: now,
  };

  saveNote(note);
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  return { note, subjects };
};

export default function App() {
  const authed = useAuth();
  const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);
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
  const [velogSettings, setVelogSettings] = useState<VelogSettings>(() => getVelogSettings());
  const [velogDraft, setVelogDraft] = useState<VelogSettings>(() => getVelogSettings());
  const [commitStatus, setCommitStatus] = useState('');
  const [committing, setCommitting] = useState(false);
  const [publishingVelog, setPublishingVelog] = useState(false);
  const [shareStatus, setShareStatus] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!authed) return;
    const loadedSubjects = getSubjects();
    const imported = importSharedNoteFromHash(loadedSubjects);
    const detailNoteId = window.location.hash.startsWith(DETAIL_HASH_PREFIX)
      ? window.location.hash.slice(DETAIL_HASH_PREFIX.length)
      : '';
    const loadedNotes = getNotes();
    const detailNote = detailNoteId ? loadedNotes.find(note => note.id === detailNoteId) : null;
    setSubjects(imported?.subjects ?? loadedSubjects);
    setNotes(loadedNotes);
    if (imported) {
      setSelected(imported.note);
      setView('view');
      setShareStatus('공유 노트를 가져왔어요.');
    } else if (detailNote) {
      setSelected(detailNote);
      setView('detailOnly');
    }
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

  const handleSaveDetailOnly = () => {
    if (!selected) return;
    const updated = { ...selected, updatedAt: new Date().toISOString() };
    saveNote(updated);
    setNotes(getNotes());
    setSelected(updated);
  };

  const handleBackToFullNote = () => {
    if (!selected) return;
    const current = getNotes().find(note => note.id === selected.id) ?? selected;
    setNotes(getNotes());
    setSelected(current);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setView('view');
  };

  const openDetailOnlyWindow = () => {
    if (!selected) return;
    const updated = { ...selected, updatedAt: new Date().toISOString() };
    saveNote(updated);
    setNotes(getNotes());
    setSelected(updated);
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${DETAIL_HASH_PREFIX}${updated.id}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const applyMarkdownAction = (action: MarkdownAction) => {
    if (!selected) return;

    const textarea = notesTextareaRef.current;
    const value = selected.notes;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selectedText = value.slice(start, end);
    const before = value.slice(0, start);
    const after = value.slice(end);
    const leadingBreak = action.block && before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const insert = selectedText && action.wrap
      ? `${action.wrap[0]}${selectedText}${action.wrap[1]}`
      : selectedText && action.label === '>'
        ? selectedText.split('\n').map(line => `> ${line}`).join('\n')
        : selectedText && action.label === '```'
          ? `\`\`\`\n${selectedText}\n\`\`\``
          : action.snippet;
    const nextNotes = `${before}${leadingBreak}${insert}${after}`;
    const cursor = before.length + leadingBreak.length + (selectedText ? insert.length : action.cursorOffset ?? insert.length);

    setSelected({ ...selected, notes: nextNotes });
    requestAnimationFrame(() => {
      notesTextareaRef.current?.focus();
      notesTextareaRef.current?.setSelectionRange(cursor, cursor);
    });
  };

  const markdownToolbar = (
    <div className="markdown-toolbar" aria-label="마크다운 도구">
      {MARKDOWN_ACTIONS.map(action => (
        <button
          key={action.label}
          type="button"
          className="markdown-tool-btn"
          title={action.title}
          onClick={() => applyMarkdownAction(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );

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
    const updatedVelog = {
      ...velogDraft,
      username: velogDraft.username.trim(),
      accessToken: velogDraft.accessToken.trim(),
      tags: velogDraft.tags.trim() || '코넬노트',
    };
    setRepoSettings(updated);
    setRepoDraft(updated);
    saveGitRepoSettings(updated);
    setVelogSettings(updatedVelog);
    setVelogDraft(updatedVelog);
    saveVelogSettings(updatedVelog);
    setCommitStatus('연동 설정을 저장했어요.');
  };

  const openRepoSettings = () => {
    setRepoDraft(repoSettings);
    setVelogDraft(velogSettings);
    setView('repo');
  };

  const publishNoteToVelog = async (note: CornellNote, force = false): Promise<VelogPublishResult | undefined> => {
    if (!force && !velogSettings.enabled) return undefined;
    if (!velogSettings.accessToken.trim()) {
      throw new Error('Velog access_token을 먼저 설정해주세요.');
    }

    const res = await fetch('/velog/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: velogSettings.accessToken.trim(),
        username: velogSettings.username.trim(),
        title: note.title || note.date,
        body: noteToMarkdown(note, subjectName(note.subjectId)),
        tags: velogSettings.tags,
        isPrivate: velogSettings.isPrivate,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Velog 발행에 실패했어요.');
    return {
      url: data.url as string | undefined,
      message: data.message as string | undefined,
      username: data.username as string | undefined,
      slug: data.slug as string | undefined,
    };
  };

  const handlePublishVelog = async () => {
    if (!selected || publishingVelog) return;
    if (!velogSettings.accessToken.trim()) {
      openRepoSettings();
      setCommitStatus('Velog access_token을 먼저 설정해주세요.');
      return;
    }

    setPublishingVelog(true);
    setCommitStatus('Velog에 발행하는 중...');
    try {
      const result = await publishNoteToVelog(selected, true);
      setCommitStatus(formatVelogPublishStatus(result));
      if (result?.url) window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setCommitStatus(e instanceof Error ? e.message : 'Velog 발행에 실패했어요.');
    } finally {
      setPublishingVelog(false);
    }
  };

  const handleCommitNote = async () => {
    if (!selected || committing) return;
    if (!repoSettings.repo.trim()) {
      openRepoSettings();
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
      let velogResult: VelogPublishResult | undefined;
      if (velogSettings.enabled) {
        setCommitStatus(`커밋 완료: ${filePath}. Velog에 발행하는 중...`);
        velogResult = await publishNoteToVelog(selected);
      }
      setCommitStatus(velogSettings.enabled ? `커밋 완료: ${filePath}. ${formatVelogPublishStatus(velogResult)}` : `커밋 완료: ${filePath}`);
      if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer');
      if (velogResult?.url) window.open(velogResult.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setCommitStatus(e instanceof Error ? e.message : '커밋에 실패했어요.');
    } finally {
      setCommitting(false);
    }
  };

  const handleShareNote = async () => {
    if (!selected) return;
    const subject = subjects.find(s => s.id === selected.subjectId);
    const url = createShareUrl(selected, subject);
    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
      clipboard?: Clipboard;
    };
    const copyShareUrl = async () => {
      if (!nav.clipboard) throw new Error('Clipboard API is unavailable.');
      await nav.clipboard.writeText(url);
    };

    try {
      if (nav.share) {
        await nav.share({
          title: selected.title || '코넬 노트',
          text: '코넬 노트를 공유했어요.',
          url,
        });
        setShareStatus('공유 창을 열었어요.');
      } else {
        await copyShareUrl();
        setShareStatus('공유 링크를 복사했어요.');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      try {
        await copyShareUrl();
        setShareStatus('공유 링크를 복사했어요.');
      } catch {
        setShareStatus('공유 링크를 만들지 못했어요.');
      }
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
          <button className={`nav-btn ${view !== 'subjects' && view !== 'repo' && view !== 'detailOnly' ? 'active' : ''}`} onClick={() => setView('list')}>📋 노트</button>
          <button className={`nav-btn ${view === 'subjects' ? 'active' : ''}`} onClick={() => setView('subjects')}>📚 과목</button>
          <button className={`nav-btn ${view === 'repo' ? 'active' : ''}`} onClick={openRepoSettings}>GitHub / Velog</button>
        </nav>
        <StudyTimerBadge />
        <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="테마 전환">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>

      {view === 'detailOnly' && selected ? (
        <main className="detail-only-page">
          <div className="detail-only-toolbar">
            <div className="detail-only-title-block">
              <span className="note-subject" style={{ color: subjectColor(selected.subjectId) }}>{subjectName(selected.subjectId)}</span>
              <h2 className="detail-only-title">{selected.title || '(제목 없음)'}</h2>
            </div>
            <div className="viewer-actions">
              <button type="button" className="btn-primary" onClick={handleSaveDetailOnly}>저장</button>
              <button type="button" className="btn-ghost" onClick={handleBackToFullNote}>전체 노트</button>
              <button type="button" className="btn-ghost" onClick={() => window.close()}>닫기</button>
            </div>
          </div>
          {markdownToolbar}
          <textarea
            ref={notesTextareaRef}
            className="detail-only-textarea"
            placeholder={'강의 내용, 개념 설명,\n예시 등을 자세히 적어보세요'}
            value={selected.notes}
            onChange={e => setSelected({ ...selected, notes: e.target.value })}
          />
        </main>
      ) : view === 'repo' ? (
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
            <div className="repo-divider" />
            <h3 className="repo-subtitle">Velog 자동 발행</h3>
            <label className="repo-check-field">
              <input
                type="checkbox"
                checked={velogDraft.enabled}
                onChange={e => setVelogDraft({ ...velogDraft, enabled: e.target.checked })}
              />
              <span>GitHub 커밋 후 Velog에도 자동 발행</span>
            </label>
            <label className="repo-field">
              <span>Velog 사용자명</span>
              <input
                className="subject-input"
                placeholder="velog 아이디"
                value={velogDraft.username}
                onChange={e => setVelogDraft({ ...velogDraft, username: e.target.value })}
              />
            </label>
            <label className="repo-field">
              <span>Velog access_token</span>
              <input
                type="password"
                className="subject-input"
                placeholder="Velog 로그인 쿠키의 access_token"
                value={velogDraft.accessToken}
                onChange={e => setVelogDraft({ ...velogDraft, accessToken: e.target.value })}
              />
            </label>
            <label className="repo-field">
              <span>태그</span>
              <input
                className="subject-input"
                placeholder="코넬노트, 공부"
                value={velogDraft.tags}
                onChange={e => setVelogDraft({ ...velogDraft, tags: e.target.value })}
              />
            </label>
            <label className="repo-check-field">
              <input
                type="checkbox"
                checked={velogDraft.isPrivate}
                onChange={e => setVelogDraft({ ...velogDraft, isPrivate: e.target.checked })}
              />
              <span>비공개 글로 발행</span>
            </label>
            <p className="repo-help">
              Velog 로그인 후 브라우저 쿠키의 access_token을 넣으면 커밋 성공 뒤 같은 마크다운으로 글을 발행합니다.
            </p>
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
              <input type="date" className="select-field" value={selected.date} disabled aria-label="노트 날짜" />
              <div className="toolbar-actions">
                <button className="btn-ghost" onClick={openRepoSettings}>GitHub / Velog 설정</button>
                <button className="btn-ghost" onClick={openDetailOnlyWindow}>세부 내용 웹 보기</button>
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
                {markdownToolbar}
                <textarea
                  ref={notesTextareaRef}
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
              <button className="btn-ghost" onClick={openDetailOnlyWindow}>세부 내용 웹 보기</button>
              <button className="btn-ghost" onClick={handleShareNote}>공유 링크</button>
              <button className="btn-ghost" onClick={handleCommitNote} disabled={committing}>{committing ? '커밋 중...' : 'GitHub 커밋'}</button>
              <button className="btn-ghost" onClick={handlePublishVelog} disabled={publishingVelog}>{publishingVelog ? '발행 중...' : 'Velog 발행'}</button>
              <button className="btn-ghost" onClick={() => setView('edit')}>✏️ 수정</button>
              <button className="btn-danger" onClick={() => handleDelete(selected.id)}>🗑️ 삭제</button>
            </div>
          </div>
          {shareStatus && <p className="repo-status compact">{shareStatus}</p>}
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
            <button className="btn-ghost" onClick={openRepoSettings}>GitHub / Velog 설정</button>
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
