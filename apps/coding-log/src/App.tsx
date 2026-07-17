import { useEffect, useState } from 'react';
import type { CodingLog, Platform, Status, Language, Comment, VelogSettings } from './types';
import { getMyLogs, getPublicLogs, createLog, updateLog, deleteLog, generateId, getTodayStr, parseUrlParams, getLike, toggleLike, getComments, addComment, deleteComment, fetchCodeFromCommit, getVelogSettings, saveVelogSettings } from './storage';
import { useAuth } from './useAuth';

type View = 'list' | 'edit' | 'view' | 'settings';
type Tab = 'my' | 'community';
type Theme = 'dark' | 'light';
const THEME_KEY = 'playground-theme';
const getTheme = (): Theme => localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
const BAEKJOONHUB_INSTALL_URL = 'https://chromewebstore.google.com/detail/ccammcjdkpgjmcpijpahlehmapgmphmk';
const CTBOT_REPO_URL = 'https://github.com/sunwoo162/ctbot.git';

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'programmers', label: '프로그래머스' },
  { value: 'baekjoon', label: '백준' },
];
const STATUSES: { value: Status; label: string; color: string }[] = [
  { value: 'solved', label: '✅ 풀었음', color: '#2ed573' },
  { value: 'failed', label: '❌ 못 풀었음', color: '#ff4757' },
  { value: 'retry', label: '🔄 재도전 필요', color: '#ffa502' },
];
const COMMON_TAGS = ['DP', '그리디', 'BFS', 'DFS', '이분탐색', '구현', '정렬', '스택/큐', '해시', '완전탐색', '투포인터', '문자열'];
const PROG_LEVELS = ['Lv.0', 'Lv.1', 'Lv.2', 'Lv.3', 'Lv.4', 'Lv.5'];
const BOJ_LEVELS = ['브론즈', '실버', '골드', '플래티넘', '다이아', '루비'];
const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'python', label: 'Python' }, { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' }, { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' }, { value: 'c', label: 'C' },
  { value: 'kotlin', label: 'Kotlin' }, { value: 'swift', label: 'Swift' },
  { value: 'go', label: 'Go' }, { value: 'rust', label: 'Rust' },
];

const copyMarkdownToClipboard = async (markdown: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(markdown);
    return true;
  } catch {
    return false;
  }
};

function emptyLog(): CodingLog {
  const params = parseUrlParams();
  return {
    id: generateId(),
    platform: params.platform,
    problemTitle: params.title,
    problemNumber: params.number,
    level: params.level ? (params.platform === 'programmers' ? `Lv.${params.level}` : params.level) : '',
    status: 'solved',
    approach: '',
    code: '',
    timeComplexity: '',
    tags: [],
    date: getTodayStr(),
    isPublic: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export default function App() {
  const { authed } = useAuth();
  const [logs, setLogs] = useState<CodingLog[]>([]);
  const [publicLogs, setPublicLogs] = useState<CodingLog[]>([]);
  const [tab, setTab] = useState<Tab>('my');
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<CodingLog | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<Platform | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all');
  const [search, setSearch] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [likeData, setLikeData] = useState<{ liked: boolean; count: number } | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [repoInput, setRepoInput] = useState(() => parseUrlParams().repo || 'sunwoo162/Coding-Test');
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{ url?: string; error?: string; message?: string } | null>(null);
  const [fetchingCode, setFetchingCode] = useState(false);
  const [theme, setTheme] = useState<Theme>(getTheme);
  const [velogSettings, setVelogSettings] = useState<VelogSettings>(() => getVelogSettings());
  const [velogDraft, setVelogDraft] = useState<VelogSettings>(() => getVelogSettings());
  const [publishingVelog, setPublishingVelog] = useState(false);
  const [velogResult, setVelogResult] = useState<{ url?: string; error?: string } | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!authed) return;
    getMyLogs().then(setLogs).catch(() => {});
    getPublicLogs().then(setPublicLogs).catch(() => {});
    const params = parseUrlParams();
    if (params.title) {
      const initial = emptyLog();
      setIsNew(true);
      setView('edit');

      if (params.commitSha && params.repo) {
        setFetchingCode(true);
        fetchCodeFromCommit(params.repo, params.commitSha, params.title)
          .then(code => {
            setSelected({ ...initial, code: code ?? '' });
          })
          .catch(() => { setSelected(initial); })
          .finally(() => setFetchingCode(false));
      } else {
        setSelected(initial);
      }
    }
  }, [authed]);

  if (!authed) return null;

  const displayLogs = tab === 'my' ? logs : publicLogs;
  const filtered = displayLogs
    .filter(l => filterPlatform === 'all' || l.platform === filterPlatform)
    .filter(l => filterStatus === 'all' || l.status === filterStatus)
    .filter(l => !search || l.problemTitle.includes(search) || (l.tags || []).some(t => t.includes(search)));

  const handleNew = () => { setSelected(emptyLog()); setIsNew(true); setView('edit'); };

  const openViewer = (log: CodingLog) => {
    setSelected(log); setIsNew(false); setView('view');
    getLike(log.id).then(setLikeData).catch(() => {});
    getComments(log.id).then((c) => setComments(c as Comment[])).catch(() => {});
    setCommitResult(null);
    setVelogResult(null);
  };

  const handleSave = async () => {
    if (!selected || !selected.problemTitle.trim()) return;
    setSaving(true);
    try {
      const saved = isNew ? await createLog(selected) : await updateLog(selected);
      setLogs(await getMyLogs());
      setPublicLogs(await getPublicLogs());
      openViewer(saved);
      setIsNew(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteLog(id);
    setLogs(await getMyLogs());
    setPublicLogs(await getPublicLogs());
    setSelected(null); setView('list');
  };

  const addTag = (tag: string) => {
    if (!selected || !tag.trim() || selected.tags.includes(tag)) return;
    setSelected({ ...selected, tags: [...selected.tags, tag] });
    setTagInput('');
  };
  const removeTag = (tag: string) => {
    if (!selected) return;
    setSelected({ ...selected, tags: selected.tags.filter(t => t !== tag) });
  };

  const handleCommit = async () => {
    if (!selected?.code) return;
    setCommitting(true); setCommitResult(null);
    try {
      const copied = await copyMarkdownToClipboard(buildVelogMarkdown(selected));
      const res = await fetch('/github/commit', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repoInput, problemTitle: selected.problemTitle, platform: selected.platform, language: selected.language || 'python', code: selected.code }),
      });
      const data = await res.json();
      if (data.success) {
        setCommitResult({
          url: data.url,
          message: copied ? '마크다운도 복사됨' : '마크다운 복사는 브라우저 권한 때문에 실패',
        });
        if (velogSettings.enabled) await handlePublishVelog();
      } else {
        setCommitResult({ error: data.error });
      }
    } finally { setCommitting(false); }
  };

  const buildVelogMarkdown = (log: CodingLog) => {
    const languageLabel = log.language ? LANGUAGES.find(l => l.value === log.language)?.label || log.language : '';
    const lines = [
      `# ${log.problemTitle}`,
      '',
      `- 플랫폼: ${platformLabel(log.platform)}`,
      log.problemNumber ? `- 문제 번호: ${log.problemNumber}` : '',
      log.level ? `- 난이도: ${log.level}` : '',
      `- 풀이 상태: ${statusOf(log.status).label}`,
      languageLabel ? `- 언어: ${languageLabel}` : '',
      log.timeComplexity ? `- 시간 복잡도: ${log.timeComplexity}` : '',
      `- 날짜: ${log.date}`,
      '',
      log.tags.length ? '## 태그' : '',
      log.tags.length ? log.tags.map(tag => `#${tag}`).join(' ') : '',
      log.tags.length ? '' : '',
      log.approach.trim() ? '## 접근 방법' : '',
      log.approach.trim(),
      log.approach.trim() ? '' : '',
      log.code.trim() ? '## 코드' : '',
      log.code.trim() ? `\`\`\`${log.language || ''}` : '',
      log.code.trim(),
      log.code.trim() ? '```' : '',
    ];
    return lines.filter((line, index, arr) => line !== '' || arr[index - 1] !== '').join('\n').trim();
  };

  const handleSaveVelogSettings = () => {
    const updated = {
      ...velogDraft,
      username: velogDraft.username.trim(),
      accessToken: velogDraft.accessToken.trim(),
      tags: velogDraft.tags.trim() || '코딩테스트,알고리즘',
    };
    setVelogSettings(updated);
    setVelogDraft(updated);
    saveVelogSettings(updated);
    setVelogResult(null);
  };

  const handlePublishVelog = async () => {
    if (!selected || publishingVelog) return;
    if (!velogSettings.accessToken.trim()) {
      setVelogResult({ error: 'Velog access_token을 먼저 설정해주세요.' });
      setVelogDraft(velogSettings);
      setView('settings');
      return;
    }

    setPublishingVelog(true);
    setVelogResult(null);
    try {
      const settingTags = velogSettings.tags.split(',').map(t => t.trim()).filter(Boolean);
      const tags = Array.from(new Set([...selected.tags, ...settingTags]));
      const res = await fetch('/velog/publish', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: velogSettings.accessToken.trim(),
          username: velogSettings.username.trim(),
          title: selected.problemTitle,
          body: buildVelogMarkdown(selected),
          tags,
          isPrivate: velogSettings.isPrivate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Velog 발행에 실패했어요.');
      setVelogResult({ url: data.url });
      if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setVelogResult({ error: e instanceof Error ? e.message : 'Velog 발행에 실패했어요.' });
    } finally {
      setPublishingVelog(false);
    }
  };

  const handleToggleLike = async () => {
    if (!selected) return;
    const data = await toggleLike(selected.id);
    setLikeData(data);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !commentInput.trim()) return;
    const c = await addComment(selected.id, commentInput);
    setComments(prev => [...prev, c as Comment]);
    setCommentInput('');
  };

  const handleDeleteComment = async (id: number) => {
    await deleteComment(id);
    setComments(prev => prev.filter(c => c.id !== id));
  };

  const statusOf = (s: Status) => STATUSES.find(x => x.value === s)!;
  const platformLabel = (p: Platform) => p === 'programmers' ? '프로그래머스' : '백준';
  const levels = selected?.platform === 'baekjoon' ? BOJ_LEVELS : PROG_LEVELS;

  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="back-link" onClick={view !== 'list' ? (e) => { e.preventDefault(); setView('list'); } : undefined}>
          {view !== 'list' ? '← 코테 일지' : '← 놀이터'}
        </a>
        <div className="header-info">
          <h1 className="app-title">💻 코테 일지</h1>
          <p className="app-subtitle">프로그래머스 · 백준 풀이를 기록하세요</p>
        </div>
        {view === 'list' && (
          <div className="header-actions">
            <button className="btn-ghost" onClick={() => setView('settings')}>⚙️ 코딩테스트 설정</button>
            <button className="btn-primary" onClick={handleNew}>+ 새 일지</button>
          </div>
        )}
        {view === 'edit' && <button className="btn-ghost" onClick={() => setView('list')}>취소</button>}
        <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="테마 전환">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>

      {view === 'list' && (
        <main className="app-main">
          <div className="tab-bar">
            <button className={`tab-btn ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')}>📋 내 풀이</button>
            <button className={`tab-btn ${tab === 'community' ? 'active' : ''}`} onClick={() => setTab('community')}>🌐 커뮤니티</button>
          </div>
          <div className="filter-bar">
            <input className="search-input" placeholder="🔍 문제 검색..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="select-sm" value={filterPlatform} onChange={e => setFilterPlatform(e.target.value as Platform | 'all')}>
              <option value="all">전체 플랫폼</option>
              {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select className="select-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value as Status | 'all')}>
              <option value="all">전체 상태</option>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <p className="empty-icon">💻</p>
              <p>{tab === 'my' ? '내 풀이 기록이 없어요.' : '아직 공개된 풀이가 없어요.'}</p>
              {tab === 'my' && <button className="btn-primary mt" onClick={handleNew}>+ 첫 일지 작성</button>}
            </div>
          ) : (
            <div className="log-grid">
              {filtered.map(log => (
                <div key={log.id} className="log-card" onClick={() => openViewer(log)}>
                  <div className="log-card-top">
                    <span className={`platform-badge ${log.platform}`}>{platformLabel(log.platform)}</span>
                    {log.level && <span className="level-badge">{log.level}</span>}
                    <span className="log-date">{log.date}</span>
                  </div>
                  <h3 className="log-title">{log.problemTitle}</h3>
                  <div className="log-status" style={{ color: statusOf(log.status).color }}>{statusOf(log.status).label}</div>
                  {log.userLogin && (
                    <div className="log-author">
                      {log.userAvatarUrl && <img src={log.userAvatarUrl} alt={log.userLogin} className="author-avatar" />}
                      <span>@{log.userLogin}</span>
                    </div>
                  )}
                  {(log.tags || []).length > 0 && (
                    <div className="tag-row">{(log.tags || []).slice(0, 4).map(t => <span key={t} className="tag">{t}</span>)}</div>
                  )}
                  <div className="log-visibility">{log.isPublic ? '🌐 공개' : '🔒 비공개'}</div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {view === 'settings' && (
        <main className="app-main">
          <section className="coding-settings">
            <div className="settings-hero">
              <span className="settings-kicker">자동 기록 연결</span>
              <h2 className="settings-title">코딩테스트 설정하기</h2>
              <p className="settings-desc">
                백준허브로 풀이를 GitHub에 자동 저장하고, ctbot 템플릿으로 Playground 코테 일지 import 링크를 생성하세요.
              </p>
            </div>

            <div className="settings-link-grid">
              <a
                className="settings-link-card"
                href={BAEKJOONHUB_INSTALL_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="settings-link-icon">🧩</span>
                <span className="settings-link-body">
                  <strong>백준허브 설치</strong>
                  <small>Chrome Web Store에서 백준허브 확장 프로그램을 설치합니다.</small>
                </span>
                <span className="settings-link-arrow">↗</span>
              </a>

              <a
                className="settings-link-card"
                href={CTBOT_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="settings-link-icon">🔗</span>
                <span className="settings-link-body">
                  <strong>ctbot 템플릿 보기</strong>
                  <small>백준허브 레포에 붙여 넣을 GitHub Actions 템플릿으로 이동합니다.</small>
                </span>
                <span className="settings-link-arrow">↗</span>
              </a>
            </div>

            <div className="settings-note">
              <strong>적용 순서</strong>
              <p>백준허브 설치 → 풀이 저장 레포 연결 → ctbot 파일을 해당 레포에 복사 → Actions Summary 링크로 코테 일지 작성</p>
            </div>
            <div className="settings-note velog-settings-card">
              <strong>Velog 발행 설정</strong>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={velogDraft.enabled}
                  onChange={e => setVelogDraft({ ...velogDraft, enabled: e.target.checked })}
                />
                <span>GitHub 커밋 후 Velog에도 자동 발행</span>
              </label>
              <label className="settings-field">
                <span>Velog 사용자명</span>
                <input
                  placeholder="velog 아이디"
                  value={velogDraft.username}
                  onChange={e => setVelogDraft({ ...velogDraft, username: e.target.value })}
                />
              </label>
              <label className="settings-field">
                <span>Velog access_token</span>
                <input
                  type="password"
                  placeholder="Velog 로그인 쿠키의 access_token"
                  value={velogDraft.accessToken}
                  onChange={e => setVelogDraft({ ...velogDraft, accessToken: e.target.value })}
                />
              </label>
              <label className="settings-field">
                <span>기본 태그</span>
                <input
                  placeholder="코딩테스트, 알고리즘"
                  value={velogDraft.tags}
                  onChange={e => setVelogDraft({ ...velogDraft, tags: e.target.value })}
                />
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={velogDraft.isPrivate}
                  onChange={e => setVelogDraft({ ...velogDraft, isPrivate: e.target.checked })}
                />
                <span>비공개 글로 발행</span>
              </label>
              <p className="settings-help">Velog 로그인 후 브라우저 쿠키의 access_token을 넣으면 현재 노트 내용을 Velog 글로 발행합니다.</p>
              <button className="btn-primary" type="button" onClick={handleSaveVelogSettings}>Velog 설정 저장</button>
              {velogResult?.error && <p className="commit-error">{velogResult.error}</p>}
            </div>
          </section>
        </main>
      )}

      {view === 'edit' && selected && (
        <main className="app-main">
          <div className="editor">
            <div className="editor-row">
              <div className="form-group" style={{ flex: '0 0 160px' }}>
                <label>플랫폼</label>
                <select value={selected.platform} onChange={e => setSelected({ ...selected, platform: e.target.value as Platform, level: '' })}>
                  {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>문제 제목 *</label>
                <input placeholder="문제 제목 입력" value={selected.problemTitle} onChange={e => setSelected({ ...selected, problemTitle: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '0 0 120px' }}>
                <label>문제 번호</label>
                <input placeholder="번호" value={selected.problemNumber || ''} onChange={e => setSelected({ ...selected, problemNumber: e.target.value })} />
              </div>
            </div>
            <div className="editor-row">
              <div className="form-group" style={{ flex: '0 0 140px' }}>
                <label>난이도</label>
                <select value={selected.level || ''} onChange={e => setSelected({ ...selected, level: e.target.value })}>
                  <option value="">선택</option>
                  {levels.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '0 0 160px' }}>
                <label>풀이 상태</label>
                <select value={selected.status} onChange={e => setSelected({ ...selected, status: e.target.value as Status })}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '0 0 140px' }}>
                <label>언어</label>
                <select value={selected.language || ''} onChange={e => setSelected({ ...selected, language: e.target.value as Language })}>
                  <option value="">선택</option>
                  {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '0 0 140px' }}>
                <label>시간 복잡도</label>
                <input placeholder="O(n log n)" value={selected.timeComplexity || ''} onChange={e => setSelected({ ...selected, timeComplexity: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '0 0 140px' }}>
                <label>날짜</label>
                <input type="date" value={selected.date} onChange={e => setSelected({ ...selected, date: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '0 0 120px' }}>
                <label>공개 설정</label>
                <button type="button" className={`visibility-toggle ${selected.isPublic ? 'public' : 'private'}`} onClick={() => setSelected({ ...selected, isPublic: !selected.isPublic })}>
                  {selected.isPublic ? '🌐 공개' : '🔒 비공개'}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>태그</label>
              <div className="tag-editor">
                <div className="tag-row">
                  {selected.tags.map(t => <span key={t} className="tag removable">{t} <button onClick={() => removeTag(t)}>✕</button></span>)}
                </div>
                <div className="tag-input-row">
                  <input className="tag-input" placeholder="태그 입력 후 Enter" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (addTag(tagInput), e.preventDefault())} />
                  <div className="common-tags">
                    {COMMON_TAGS.filter(t => !selected.tags.includes(t)).map(t => <button key={t} className="tag-suggest" onClick={() => addTag(t)}>{t}</button>)}
                  </div>
                </div>
              </div>
            </div>
            <div className="form-group">
              <label>풀이 접근법</label>
              <textarea rows={5} placeholder="어떻게 접근했는지 설명해보세요" value={selected.approach} onChange={e => setSelected({ ...selected, approach: e.target.value })} />
            </div>
            <div className="form-group">
              <label>코드 {fetchingCode && <span style={{ fontWeight: 'normal', color: '#888', fontSize: '0.85em' }}>⏳ GitHub에서 코드 불러오는 중...</span>}</label>
              <textarea className="code-area" rows={12} placeholder="풀이 코드를 붙여넣으세요" value={selected.code} onChange={e => setSelected({ ...selected, code: e.target.value })} spellCheck={false} disabled={fetchingCode} />
            </div>
            <div className="editor-actions">
              <button className="btn-primary" onClick={handleSave} disabled={saving || !selected.problemTitle.trim()}>{saving ? '저장 중...' : '저장'}</button>
              <button className="btn-ghost" onClick={() => setView('list')}>취소</button>
            </div>
          </div>
        </main>
      )}

      {view === 'view' && selected && (
        <main className="app-main">
          <div className="viewer">
            <div className="viewer-header">
              <div className="viewer-title-block">
                <div className="viewer-badges">
                  <span className={`platform-badge ${selected.platform}`}>{platformLabel(selected.platform)}</span>
                  {selected.level && <span className="level-badge">{selected.level}</span>}
                  {selected.problemNumber && <span className="level-badge">#{selected.problemNumber}</span>}
                  {selected.language && <span className="level-badge">{LANGUAGES.find(l => l.value === selected.language)?.label}</span>}
                  <span className="log-status" style={{ color: statusOf(selected.status).color }}>{statusOf(selected.status).label}</span>
                  <span className={`visibility-badge ${selected.isPublic ? 'public' : 'private'}`}>{selected.isPublic ? '🌐 공개' : '🔒 비공개'}</span>
                </div>
                <h2 className="viewer-title">{selected.problemTitle}</h2>
                <div className="viewer-meta">
                  <span>{selected.date}</span>
                  {selected.timeComplexity && <span>⏱ {selected.timeComplexity}</span>}
                </div>
                {selected.userLogin && (
                  <div className="viewer-author">
                    {selected.userAvatarUrl && <img src={selected.userAvatarUrl} alt={selected.userLogin} className="author-avatar" />}
                    <span>@{selected.userLogin}</span>
                  </div>
                )}
              </div>
              <div className="viewer-actions">
                <button className="btn-ghost" onClick={() => { setIsNew(false); setView('edit'); }}>✏️ 수정</button>
                <button className="btn-danger" onClick={() => handleDelete(selected.id)}>🗑️ 삭제</button>
              </div>
            </div>

            {(selected.tags || []).length > 0 && (
              <div className="tag-row section-gap">{(selected.tags || []).map(t => <span key={t} className="tag">{t}</span>)}</div>
            )}
            {selected.approach && (
              <div className="section-gap">
                <div className="section-label">💡 풀이 접근법</div>
                <div className="content-block">{selected.approach}</div>
              </div>
            )}
            {selected.code && (
              <div className="section-gap">
                <div className="section-label">💻 코드</div>
                <pre className="code-block">{selected.code}</pre>
              </div>
            )}

            {/* GitHub 커밋 - 내 풀이(내 탭)만 */}
            {selected.code && tab === 'my' && (
              <div className="section-gap commit-section">
                <div className="section-label">🚀 GitHub 커밋</div>
                <div className="commit-row">
                  <input className="repo-input" placeholder="username/repo" value={repoInput} onChange={e => setRepoInput(e.target.value)} />
                  <button className="btn-commit" onClick={handleCommit} disabled={committing}>{committing ? '커밋 중...' : '커밋하기'}</button>
                </div>
                {commitResult?.url && (
                  <p className="commit-success">
                    ✅ 커밋 완료! {commitResult.message && <span>{commitResult.message}. </span>}
                    <a href={commitResult.url} target="_blank" rel="noopener">파일 보기 →</a>
                  </p>
                )}
                {commitResult?.error && <p className="commit-error">❌ {commitResult.error}</p>}
              </div>
            )}

            {/* 좋아요/댓글 - 커뮤니티 탭만 */}
            {tab === 'my' && (
              <div className="section-gap commit-section">
                <div className="section-label">Velog 발행</div>
                <div className="commit-row">
                  <button className="btn-commit" type="button" onClick={handlePublishVelog} disabled={publishingVelog}>
                    {publishingVelog ? '발행 중...' : 'Velog에 글 올리기'}
                  </button>
                  <button className="btn-ghost" type="button" onClick={() => { setVelogDraft(velogSettings); setView('settings'); }}>
                    Velog 설정
                  </button>
                </div>
                {velogResult?.url && <p className="commit-success">Velog 발행 완료! <a href={velogResult.url} target="_blank" rel="noopener">글 보기</a></p>}
                {velogResult?.error && <p className="commit-error">{velogResult.error}</p>}
              </div>
            )}

            {tab === 'community' && (
              <>
                <div className="like-row">
                  <button className={`like-btn ${likeData?.liked ? 'liked' : ''}`} onClick={handleToggleLike}>
                    {likeData?.liked ? '❤️' : '🤍'} {likeData?.count ?? 0}
                  </button>
                </div>
                <div className="section-gap">
                  <div className="section-label">💬 댓글 {comments.length > 0 && `(${comments.length})`}</div>
                  <div className="comment-list">
                    {comments.map(c => (
                      <div key={c.id} className="comment-item">
                        <img src={c.userAvatarUrl} alt={c.userLogin} className="comment-avatar" />
                        <div className="comment-body">
                          <div className="comment-header">
                            <span className="comment-author">@{c.userLogin}</span>
                            <span className="comment-date">{new Date(c.createdAt).toLocaleDateString('ko-KR')}</span>
                          </div>
                          <p className="comment-content">{c.content}</p>
                        </div>
                        <button className="comment-delete" onClick={() => handleDeleteComment(c.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                  <form className="comment-form" onSubmit={handleAddComment}>
                    <input className="comment-input" placeholder="댓글을 입력하세요..." value={commentInput} onChange={e => setCommentInput(e.target.value)} />
                    <button type="submit" className="btn-primary btn-sm" disabled={!commentInput.trim()}>등록</button>
                  </form>
                </div>
              </>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
