import { useState, useEffect } from 'react';
import type { CodingLog, Platform, Status } from './types';
import { getMyLogs, getPublicLogs, createLog, updateLog, deleteLog, generateId, getTodayStr, parseUrlParams } from './storage';
import { useAuth } from './useAuth';

type View = 'list' | 'edit' | 'view';
type Tab = 'my' | 'community';

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
  const authed = useAuth();
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

  useEffect(() => {
    if (!authed) return;
    getMyLogs().then(setLogs).catch(() => {});
    getPublicLogs().then(setPublicLogs).catch(() => {});
    const params = parseUrlParams();
    if (params.title) {
      setSelected(emptyLog());
      setIsNew(true);
      setView('edit');
    }
  }, [authed]);

  if (!authed) return null;

  const displayLogs = tab === 'my' ? logs : publicLogs;
  const filtered = displayLogs
    .filter(l => filterPlatform === 'all' || l.platform === filterPlatform)
    .filter(l => filterStatus === 'all' || l.status === filterStatus)
    .filter(l => !search || l.problemTitle.includes(search) || (l.tags || []).some(t => t.includes(search)));

  const handleNew = () => { setSelected(emptyLog()); setIsNew(true); setView('edit'); };

  const handleSave = async () => {
    if (!selected || !selected.problemTitle.trim()) return;
    setSaving(true);
    try {
      let saved: CodingLog;
      if (isNew) {
        saved = await createLog(selected);
      } else {
        saved = await updateLog(selected);
      }
      const myLogs = await getMyLogs();
      const pubLogs = await getPublicLogs();
      setLogs(myLogs);
      setPublicLogs(pubLogs);
      setSelected(saved);
      setIsNew(false);
      setView('view');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteLog(id);
    const myLogs = await getMyLogs();
    const pubLogs = await getPublicLogs();
    setLogs(myLogs);
    setPublicLogs(pubLogs);
    setSelected(null);
    setView('list');
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

  const statusOf = (s: Status) => STATUSES.find(x => x.value === s)!;
  const platformLabel = (p: Platform) => p === 'programmers' ? '프로그래머스' : '백준';
  const levels = selected?.platform === 'baekjoon' ? BOJ_LEVELS : PROG_LEVELS;

  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="back-link">← 놀이터</a>
        <div className="header-info">
          <h1 className="app-title">💻 코테 일지</h1>
          <p className="app-subtitle">프로그래머스 · 백준 풀이를 기록하세요</p>
        </div>
        {view === 'list' && <button className="btn-primary" onClick={handleNew}>+ 새 일지</button>}
        {view !== 'list' && <button className="btn-ghost" onClick={() => setView('list')}>← 목록</button>}
      </header>

      {view === 'list' && (
        <main className="app-main">
          {/* 탭 */}
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
                <div key={log.id} className="log-card" onClick={() => { setSelected(log); setIsNew(false); setView('view'); }}>
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
                    <div className="tag-row">
                      {(log.tags || []).slice(0, 4).map(t => <span key={t} className="tag">{t}</span>)}
                    </div>
                  )}
                  <div className="log-visibility">{log.isPublic ? '🌐 공개' : '🔒 비공개'}</div>
                </div>
              ))}
            </div>
          )}
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
                <label>시간 복잡도</label>
                <input placeholder="O(n log n)" value={selected.timeComplexity || ''} onChange={e => setSelected({ ...selected, timeComplexity: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '0 0 140px' }}>
                <label>날짜</label>
                <input type="date" value={selected.date} onChange={e => setSelected({ ...selected, date: e.target.value })} />
              </div>
              {/* 공개/비공개 토글 */}
              <div className="form-group" style={{ flex: '0 0 120px' }}>
                <label>공개 설정</label>
                <button
                  type="button"
                  className={`visibility-toggle ${selected.isPublic ? 'public' : 'private'}`}
                  onClick={() => setSelected({ ...selected, isPublic: !selected.isPublic })}
                >
                  {selected.isPublic ? '🌐 공개' : '🔒 비공개'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>태그</label>
              <div className="tag-editor">
                <div className="tag-row">
                  {selected.tags.map(t => (
                    <span key={t} className="tag removable">{t} <button onClick={() => removeTag(t)}>✕</button></span>
                  ))}
                </div>
                <div className="tag-input-row">
                  <input className="tag-input" placeholder="태그 입력 후 Enter" value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (addTag(tagInput), e.preventDefault())}
                  />
                  <div className="common-tags">
                    {COMMON_TAGS.filter(t => !selected.tags.includes(t)).map(t => (
                      <button key={t} className="tag-suggest" onClick={() => addTag(t)}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>풀이 접근법</label>
              <textarea rows={5} placeholder="어떻게 접근했는지, 어떤 알고리즘을 사용했는지 설명해보세요" value={selected.approach} onChange={e => setSelected({ ...selected, approach: e.target.value })} />
            </div>

            <div className="form-group">
              <label>코드</label>
              <textarea className="code-area" rows={12} placeholder="풀이 코드를 붙여넣으세요" value={selected.code} onChange={e => setSelected({ ...selected, code: e.target.value })} spellCheck={false} />
            </div>

            <div className="editor-actions">
              <button className="btn-primary" onClick={handleSave} disabled={saving || !selected.problemTitle.trim()}>
                {saving ? '저장 중...' : '저장'}
              </button>
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
          </div>
        </main>
      )}
    </div>
  );
}
