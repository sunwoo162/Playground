import { useEffect, useState, type FormEvent } from 'react'
import { MyPage } from './pages/MyPage'
import { getAccessTokenExpiry, formatTimeLeft } from './api/auth'
import { registerPushSubscription } from './api/push'

// 스터디 플래너 타이머 상태 읽기
function getStudyTimerElapsed(): number | null {
  try {
    const raw = localStorage.getItem('study-planner-timer');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.running || !data.startTime) return null;
    return Math.floor((Date.now() - new Date(data.startTime).getTime()) / 1000);
  } catch {
    return null;
  }
}

function formatStudyTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface User {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
}

interface Notice {
  id: number;
  title: string;
  content: string;
  authorLogin: string;
  createdAt: string;
}

interface AppItem {
  id: string;
  title: string;
  description: string;
  emoji: string;
  url: string;
  color: string;
  disabled?: boolean;
}

interface LocalGitHubStatus {
  projectRoot: string;
  git: { installed: boolean; version: string };
  gh: { installed: boolean; version: string; installCommand: string };
  repository: {
    isRepo: boolean;
    branch: string;
    remoteOrigin: string;
    hasOrigin: boolean;
    lastCommit: string;
    branchSummary: string;
    changedFiles: string[];
    changedCount: number;
    clean: boolean;
  };
}

const APPS: AppItem[] = [
  {
    id: 'study-planner',
    title: '스터디 플래너',
    description: '과목별 타이머 + 공부 시간 추적 + 달력 히트맵',
    emoji: '📅',
    url: '/apps/study-planner/',
    color: '#55efc4',
  },
  {
    id: 'dev-notes',
    title: '개발자 노트',
    description: '프로젝트별 기능명세서, API 명세서, 사용자 분석을 한 곳에',
    emoji: '📒',
    url: '/apps/dev-notes/',
    color: '#2ed573',
  },
  {
    id: 'dev-action-hub',
    title: '개발 액션 허브',
    description: '개발자 노트, GitHub Actions, Discord 알림을 한 화면에서 관리',
    emoji: '🧩',
    url: '/apps/dev-action-hub/',
    color: '#69d2bd',
  },
  {
    id: 'life-tracker',
    title: 'Life Tracker',
    description: '실패, 버린 시간, 작은 성취를 기록하는 자기 이해 플랫폼',
    emoji: '📊',
    url: '/apps/life-tracker/',
    color: '#70a1ff',
    disabled: true,
  },
  {
    id: 'cornell-notes',
    title: '코넬 노트',
    description: '키워드, 세부 내용, 요약으로 배운 내용을 구조적으로 정리',
    emoji: '📝',
    url: '/apps/cornell-notes/',
    color: '#a29bfe',
  },
  {
    id: 'coding-log',
    title: '코테 일지',
    description: '프로그래머스 · 백준 풀이 기록, 접근법과 코드를 정리',
    emoji: '💻',
    url: '/apps/coding-log/',
    color: '#2ed573',
  },
  {
    id: 'school-meal',
    title: '학교 알리미',
    description: '학교 급식과 학급 시간표를 한 곳에서 확인',
    emoji: '🏫',
    url: '/apps/school-meal/',
    color: '#ffa502',
  },
  {
    id: 'mock-invest',
    title: '모의 투자',
    description: '가상 자산으로 주식 매수·매도와 포트폴리오 관리를 연습',
    emoji: '📈',
    url: '/apps/mock-invest/',
    color: '#6fd17b',
  },
  {
    id: 'action-notifier',
    title: 'Action 알리미',
    description: 'GitHub Actions 완료 알림을 웹이 꺼져 있어도 받아보기',
    emoji: '⚙️',
    url: '/apps/action-notifier/',
    color: '#74b9ff',
  },
  {
    id: 'code-run-visualizer',
    title: '코드 실행 시각화',
    description: '코드가 컴파일되고 줄 단위로 실행되는 장면을 영상처럼 확인',
    emoji: '▶️',
    url: '/apps/code-run-visualizer/',
    color: '#23d18b',
  },
  { id: 'cs1',  title: '습관 트래커',     description: '매일 반복할 습관을 설정하고 달성률을 추적',           emoji: '🔁', url: '#', color: '#ffa502', disabled: true },
  { id: 'cs2',  title: '독서 기록',        description: '읽은 책, 읽는 중, 읽고 싶은 책을 관리',             emoji: '📚', url: '#', color: '#ff6b81', disabled: true },
  { id: 'cs3',  title: '가계부',           description: '수입과 지출을 기록하고 월별 통계 확인',              emoji: '💰', url: '#', color: '#ffd32a', disabled: true },
  { id: 'cs4',  title: '운동 로그',        description: '운동 종류, 시간, 횟수를 기록하고 성장 추적',          emoji: '🏋️', url: '#', color: '#ff4757', disabled: true },
  { id: 'cs5',  title: '일기장',           description: '날마다 하루를 기록하는 개인 일기',                   emoji: '✍️', url: '#', color: '#eccc68', disabled: true },
  { id: 'cs6',  title: '목표 관리',        description: '단기·장기 목표를 설정하고 달성 여부를 체크',          emoji: '🎯', url: '#', color: '#a29bfe', disabled: true },
  { id: 'cs7',  title: '링크 저장소',      description: '나중에 볼 링크, 읽을거리를 깔끔하게 저장',            emoji: '🔗', url: '#', color: '#00cec9', disabled: true },
  { id: 'cs8',  title: '레시피 노트',      description: '자주 해먹는 요리 레시피를 기록',                     emoji: '🍳', url: '#', color: '#e17055', disabled: true },
  { id: 'cs9',  title: '회고 일지',        description: '주간·월간 회고를 작성하고 성장 패턴 파악',            emoji: '🔍', url: '#', color: '#74b9ff', disabled: true },
  { id: 'cs11', title: '감정 일기',        description: '오늘의 감정을 기록하고 감정 변화 흐름을 시각화',      emoji: '🌈', url: '#', color: '#fd79a8', disabled: true },
  { id: 'cs12', title: '여행 기록',        description: '다녀온 여행지와 기억을 사진과 함께 기록',             emoji: '✈️', url: '#', color: '#6c5ce7', disabled: true },
];

const FAVORITES_KEY = 'playground-favorites';
const THEME_KEY = 'playground-theme';
type Theme = 'dark' | 'light';

function getTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
}

function getFavorites(): string[] {
  const raw = localStorage.getItem(FAVORITES_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveFavorites(ids: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<'home' | 'mypage' | 'friends' | 'github'>('home');
  const [favorites, setFavorites] = useState<string[]>(getFavorites);
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [tokenExpiry, setTokenExpiry] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [studyElapsed, setStudyElapsed] = useState<number | null>(null);
  const [theme, setTheme] = useState<Theme>(getTheme);
  const [showFeatureRequest, setShowFeatureRequest] = useState(false);
  const [featureRequestText, setFeatureRequestText] = useState('');
  const [featureRequestStatus, setFeatureRequestStatus] = useState('');
  const [featureRequestSubmitting, setFeatureRequestSubmitting] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selectedNoticeId, setSelectedNoticeId] = useState<number | null>(null);
  const [showNoticeArchive, setShowNoticeArchive] = useState(false);
  const [showNoticeEditor, setShowNoticeEditor] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeStatus, setNoticeStatus] = useState('');
  const [noticeSubmitting, setNoticeSubmitting] = useState(false);
  const [loginRedirectApp, setLoginRedirectApp] = useState<AppItem | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setUser(data.user);
        setLoading(false);
        if (data.user) {
          setTokenExpiry(getAccessTokenExpiry());
          registerPushSubscription();
        }
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) {
      setNotices([]);
      return;
    }
    fetchNotices();
  }, [user]);

  // 1초마다 남은 시간 갱신 + 만료 5분 전 자동 갱신
  useEffect(() => {
    if (!tokenExpiry) return;
    const update = () => {
      const diff = tokenExpiry.getTime() - Date.now();
      setTimeLeft(formatTimeLeft(tokenExpiry));
      if (diff > 0 && diff < 5 * 60 * 1000) {
        fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
          .then((res) => { if (res.ok) setTokenExpiry(getAccessTokenExpiry()); });
      }
      if (diff <= 0) {
        fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
          .then((res) => { if (res.ok) setTokenExpiry(getAccessTokenExpiry()); else setUser(null); });
      }
      // 스터디 타이머 상태도 갱신
      setStudyElapsed(getStudyTimerElapsed());
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [tokenExpiry]);

  const handleLogin = (returnToOverride?: string) => {
    const params = new URLSearchParams(window.location.search);
    const returnTo = returnToOverride || params.get('returnTo');
    window.location.href = returnTo
      ? `/auth/github?returnTo=${encodeURIComponent(returnTo)}`
      : '/auth/github';
  };

  const handleLogout = async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    setPage('home');
  };

  const openFeatureRequest = () => {
    if (!user) {
      handleLogin();
      return;
    }
    setFeatureRequestStatus('');
    setShowFeatureRequest(true);
  };

  const submitFeatureRequest = async (e: FormEvent) => {
    e.preventDefault();
    const message = featureRequestText.trim();
    if (!message) {
      setFeatureRequestStatus('요청 내용을 입력해주세요.');
      return;
    }

    setFeatureRequestSubmitting(true);
    setFeatureRequestStatus('');
    try {
      const res = await fetch('/api/feature-requests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || '요청 전송에 실패했어요.');
      }
      setFeatureRequestText('');
      setFeatureRequestStatus('요청을 보냈어요. sunwoo162 계정으로 알림이 전송됩니다.');
      setTimeout(() => {
        setShowFeatureRequest(false);
        setFeatureRequestStatus('');
      }, 1200);
    } catch (error) {
      setFeatureRequestStatus(error instanceof Error ? error.message : '요청 전송에 실패했어요.');
    } finally {
      setFeatureRequestSubmitting(false);
    }
  };

  const fetchNotices = async () => {
    try {
      const res = await fetch('/api/notices', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setNotices(Array.isArray(data) ? data : []);
    } catch {
      setNotices([]);
    }
  };

  const isAdmin = user?.login?.toLowerCase() === 'sunwoo162';
  const latestNotice = notices[0] ?? null;
  const selectedNotice = notices.find((notice) => notice.id === selectedNoticeId) ?? latestNotice;

  const formatNoticeDate = (value: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.slice(0, 10);
    return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  };

  const openNoticeArchive = (notice?: Notice) => {
    setSelectedNoticeId(notice?.id ?? latestNotice?.id ?? null);
    setShowNoticeArchive(true);
  };

  const submitNotice = async (e: FormEvent) => {
    e.preventDefault();
    const title = noticeTitle.trim();
    const content = noticeContent.trim();
    if (!title || !content) {
      setNoticeStatus('제목과 내용을 모두 입력해주세요.');
      return;
    }

    setNoticeSubmitting(true);
    setNoticeStatus('');
    try {
      const res = await fetch('/api/notices', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || '공지 등록에 실패했어요.');
      }
      const created = await res.json();
      setNotices((prev) => [created, ...prev.filter((notice) => notice.id !== created.id)]);
      setSelectedNoticeId(created.id);
      setNoticeTitle('');
      setNoticeContent('');
      setNoticeStatus('공지사항을 등록했어요.');
      setShowNoticeEditor(false);
      setShowNoticeArchive(true);
    } catch (error) {
      setNoticeStatus(error instanceof Error ? error.message : '공지 등록에 실패했어요.');
    } finally {
      setNoticeSubmitting(false);
    }
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = favorites.includes(id)
      ? favorites.filter((f) => f !== id)
      : [...favorites, id];
    setFavorites(next);
    saveFavorites(next);
  };

  const requestAppLogin = (app: AppItem) => {
    if (app.disabled) return;
    setLoginRedirectApp(app);
  };

  const displayedApps = showFavOnly
    ? APPS.filter((a) => favorites.includes(a.id))
    : APPS;

  if (loading) {
    return (
      <div className="app loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (page === 'mypage' && user) {
    return (
      <MyPage
        user={user}
        onLogout={handleLogout}
        onBack={() => setPage('home')}
        initialTab="apps"
      />
    );
  }

  if (page === 'friends' && user) {
    return (
      <MyPage
        user={user}
        onLogout={handleLogout}
        onBack={() => setPage('home')}
        initialTab="friends"
      />
    );
  }

  if (page === 'github') {
    return <GitHubManager onBack={() => setPage('home')} />;
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1 className="logo">🎮 놀이터</h1>
          <p className="tagline">나만의 작은 웹앱 모음</p>
        </div>
        <div className="header-right">
          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="테마 전환"
            title={theme === 'dark' ? '화이트 모드로 전환' : '다크 모드로 전환'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="btn-feature-request" onClick={() => setPage('github')}>
            GitHub 관리
          </button>
          <button className="btn-feature-request" onClick={openFeatureRequest}>
            기능추가 요청
          </button>
          {user ? (
            <div className="user-info">
              {timeLeft && (
                <span className={`token-expiry ${timeLeft === '만료됨' ? 'expired' : ''}`}>
                  🔑 {timeLeft}
                </span>
              )}
              {studyElapsed !== null && (
                <a href="/apps/study-planner/" className="study-timer-badge">
                  ⏱️ {formatStudyTime(studyElapsed)}
                </a>
              )}
              <button className="btn-friends" onClick={() => setPage('friends')} aria-label="친구">
                👥
              </button>
              <button className="avatar-btn" onClick={() => setPage('mypage')} aria-label="마이페이지">
                <img src={user.avatar_url} alt={user.name} className="avatar" />
              </button>
              <button className="username-btn" onClick={() => setPage('mypage')}>
                {user.name || user.login}
              </button>
              <button className="btn-logout" onClick={handleLogout}>로그아웃</button>
            </div>
          ) : (
            <button className="btn-github-login" onClick={handleLogin}>
              <svg className="github-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              GitHub로 로그인
            </button>
          )}
        </div>
      </header>

      <main className="main">
        {!user && (
          <div className="login-prompt">
            <p>로그인하면 앱을 사용할 수 있어요 👋</p>
          </div>
        )}

        {user && (
          <section className="notice-section">
            <div className="notice-section-header">
              <div>
                <span className="notice-eyebrow">공지사항</span>
                <h2>놀이터 업데이트와 안내</h2>
              </div>
              <div className="notice-header-actions">
                {isAdmin && (
                  <button className="btn-ghost" onClick={() => {
                    setNoticeStatus('');
                    setShowNoticeEditor(true);
                  }}>
                    공지 작성
                  </button>
                )}
                <button className="btn-ghost" onClick={() => openNoticeArchive()}>
                  이전 공지
                </button>
              </div>
            </div>

            {latestNotice ? (
              <button className="notice-featured" onClick={() => openNoticeArchive(latestNotice)}>
                <span className="notice-date">{formatNoticeDate(latestNotice.createdAt)}</span>
                <span className="notice-title">{latestNotice.title}</span>
                <span className="notice-preview">{latestNotice.content}</span>
              </button>
            ) : (
              <div className="notice-empty">
                {isAdmin ? '아직 공지가 없어요. 첫 공지를 작성해보세요.' : '아직 등록된 공지가 없어요.'}
              </div>
            )}
          </section>
        )}

        {/* 필터 바 */}
        <div className="filter-bar">
          <button
            className={`filter-btn ${!showFavOnly ? 'active' : ''}`}
            onClick={() => setShowFavOnly(false)}
          >
            전체 <span className="filter-count">{APPS.length}</span>
          </button>
          <button
            className={`filter-btn ${showFavOnly ? 'active' : ''}`}
            onClick={() => setShowFavOnly(true)}
          >
            ⭐ 즐겨찾기 <span className="filter-count">{favorites.length}</span>
          </button>
        </div>

        {showFavOnly && displayedApps.length === 0 && (
          <div className="fav-empty">
            <p>즐겨찾기한 앱이 없어요.</p>
            <p>앱 카드의 ⭐ 버튼을 눌러 추가해보세요.</p>
          </div>
        )}

        <section className="apps-grid">
          {displayedApps.map((app) => (
            <a
              key={app.id}
              href={user && !app.disabled ? app.url : undefined}
              className={`app-card ${app.disabled ? 'disabled' : ''} ${!user ? 'locked' : ''}`}
              style={{ '--accent': app.color } as React.CSSProperties}
              onClick={(e) => {
                if (app.disabled) {
                  e.preventDefault();
                  return;
                }
                if (!user) {
                  e.preventDefault();
                  requestAppLogin(app);
                }
              }}
            >
              {/* 즐겨찾기 버튼 */}
              <button
                className={`fav-btn ${favorites.includes(app.id) ? 'favorited' : ''}`}
                onClick={(e) => toggleFavorite(app.id, e)}
                aria-label="즐겨찾기"
                title={favorites.includes(app.id) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
              >
                {favorites.includes(app.id) ? '⭐' : '☆'}
              </button>

              <div className="app-emoji">{app.emoji}</div>
              <h2 className="app-title">{app.title}</h2>
              <p className="app-desc">{app.description}</p>
              {!user && !app.disabled && <span className="lock-badge">🔒 로그인 필요</span>}
              {app.disabled && <span className="lock-badge">🔜 준비 중</span>}
            </a>
          ))}
        </section>
      </main>

      <footer className="footer">
        <p>놀이터 © 2024</p>
      </footer>

      {showFeatureRequest && (
        <div className="modal-backdrop" onClick={() => setShowFeatureRequest(false)}>
          <form className="feature-request-modal" onSubmit={submitFeatureRequest} onClick={(e) => e.stopPropagation()}>
            <div className="feature-request-header">
              <div>
                <h2>기능추가 요청</h2>
                <p>필요한 기능을 적으면 관리자에게 알림이 전송됩니다.</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowFeatureRequest(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <textarea
              className="feature-request-textarea"
              value={featureRequestText}
              onChange={(e) => setFeatureRequestText(e.target.value)}
              placeholder="추가했으면 하는 기능을 적어주세요."
              maxLength={1000}
              autoFocus
            />
            <div className="feature-request-footer">
              <span className="request-count">{featureRequestText.length}/1000</span>
              <div className="feature-request-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowFeatureRequest(false)}>
                  취소
                </button>
                <button type="submit" className="btn-primary" disabled={featureRequestSubmitting}>
                  {featureRequestSubmitting ? '전송 중...' : '보내기'}
                </button>
              </div>
            </div>
            {featureRequestStatus && <p className="request-status">{featureRequestStatus}</p>}
          </form>
        </div>
      )}

      {loginRedirectApp && (
        <div className="modal-backdrop" onClick={() => setLoginRedirectApp(null)}>
          <div className="login-required-modal" onClick={(e) => e.stopPropagation()}>
            <div className="login-required-icon">🔒</div>
            <h2>로그인이 필요해요</h2>
            <p>
              {loginRedirectApp.title} 앱은 로그인 후 사용할 수 있습니다.
              로그인하면 바로 이 앱으로 돌아옵니다.
            </p>
            <div className="login-required-actions">
              <button type="button" className="btn-ghost" onClick={() => setLoginRedirectApp(null)}>
                취소
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleLogin(loginRedirectApp.url)}
              >
                로그인으로 이동
              </button>
            </div>
          </div>
        </div>
      )}

      {showNoticeArchive && (
        <div className="modal-backdrop" onClick={() => setShowNoticeArchive(false)}>
          <div className="notice-modal" onClick={(e) => e.stopPropagation()}>
            <div className="feature-request-header">
              <div>
                <h2>공지사항</h2>
                <p>최신 공지와 이전 공지를 한 번에 확인할 수 있어요.</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowNoticeArchive(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="notice-modal-layout">
              <aside className="notice-history">
                {notices.length > 0 ? notices.map((notice) => (
                  <button
                    key={notice.id}
                    className={`notice-history-item ${selectedNotice?.id === notice.id ? 'active' : ''}`}
                    onClick={() => setSelectedNoticeId(notice.id)}
                  >
                    <span>{formatNoticeDate(notice.createdAt)}</span>
                    <strong>{notice.title}</strong>
                  </button>
                )) : (
                  <p className="notice-history-empty">등록된 공지가 없습니다.</p>
                )}
              </aside>
              <article className="notice-detail">
                {selectedNotice ? (
                  <>
                    <span className="notice-detail-date">{formatNoticeDate(selectedNotice.createdAt)}</span>
                    <h3>{selectedNotice.title}</h3>
                    <p>{selectedNotice.content}</p>
                  </>
                ) : (
                  <p className="notice-history-empty">확인할 공지가 없습니다.</p>
                )}
              </article>
            </div>
          </div>
        </div>
      )}

      {showNoticeEditor && (
        <div className="modal-backdrop" onClick={() => setShowNoticeEditor(false)}>
          <form className="feature-request-modal notice-editor-modal" onSubmit={submitNotice} onClick={(e) => e.stopPropagation()}>
            <div className="feature-request-header">
              <div>
                <h2>공지 작성</h2>
                <p>sunwoo162 관리자 계정으로 전체 사용자에게 보여줄 공지를 작성합니다.</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowNoticeEditor(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <input
              className="notice-title-input"
              value={noticeTitle}
              onChange={(e) => setNoticeTitle(e.target.value)}
              placeholder="공지 제목"
              maxLength={160}
              autoFocus
            />
            <textarea
              className="feature-request-textarea"
              value={noticeContent}
              onChange={(e) => setNoticeContent(e.target.value)}
              placeholder="공지 내용을 입력해주세요."
              maxLength={4000}
            />
            <div className="feature-request-footer">
              <span className="request-count">{noticeContent.length}/4000</span>
              <div className="feature-request-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowNoticeEditor(false)}>
                  취소
                </button>
                <button type="submit" className="btn-primary" disabled={noticeSubmitting}>
                  {noticeSubmitting ? '등록 중...' : '등록'}
                </button>
              </div>
            </div>
            {noticeStatus && <p className="request-status">{noticeStatus}</p>}
          </form>
        </div>
      )}
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`status-pill ${ok ? 'ok' : 'warn'}`}>{label}</span>;
}

function GitHubManager({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<LocalGitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Update playground');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const refresh = async () => {
    setLoading(true);
    setResult('');
    try {
      const res = await fetch('/local-github/status');
      setStatus(await res.json());
    } catch {
      setResult('상태를 불러오지 못했습니다. 서버가 실행 중인지 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const commitPush = async () => {
    setBusy(true);
    setResult('');
    try {
      const res = await fetch('/local-github/commit-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '커밋/푸시에 실패했습니다.');
      setStatus(data.status);
      setResult(data.message || '완료했습니다.');
    } catch (error) {
      setResult(error instanceof Error ? error.message : '커밋/푸시에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const canPush = Boolean(status?.git.installed && status.repository.isRepo && status.repository.hasOrigin && !status.repository.clean);

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1 className="logo">GitHub 관리</h1>
          <p className="tagline">연결, 변경사항, 푸시 상태를 한 화면에서 확인합니다.</p>
        </div>
        <div className="header-right">
          <button className="btn-back" onClick={onBack}>← 돌아가기</button>
          <button className="btn-primary" onClick={refresh} disabled={loading || busy}>새로고침</button>
        </div>
      </header>

      <main className="github-manager">
        {loading && <div className="github-panel">상태 확인 중...</div>}

        {status && (
          <>
            <section className="github-summary">
              <div className="github-panel">
                <span className="panel-label">Git</span>
                <StatusPill ok={status.git.installed} label={status.git.installed ? '설치됨' : '설치 필요'} />
                <p>{status.git.version}</p>
              </div>
              <div className="github-panel">
                <span className="panel-label">GitHub CLI</span>
                <StatusPill ok={status.gh.installed} label={status.gh.installed ? '설치됨' : '설치 필요'} />
                <p>{status.gh.installed ? status.gh.version : status.gh.installCommand}</p>
              </div>
              <div className="github-panel">
                <span className="panel-label">저장소</span>
                <StatusPill ok={status.repository.isRepo && status.repository.hasOrigin} label={status.repository.hasOrigin ? '연결됨' : '연결 필요'} />
                <p>{status.repository.remoteOrigin || 'origin remote가 없습니다.'}</p>
              </div>
            </section>

            <section className="github-panel">
              <div className="github-panel-header">
                <div>
                  <span className="panel-label">현재 상태</span>
                  <h2>{status.repository.branch || '브랜치 없음'}</h2>
                </div>
                <StatusPill ok={status.repository.clean} label={status.repository.clean ? '변경 없음' : `${status.repository.changedCount}개 변경`} />
              </div>
              <div className="github-details">
                <div><strong>동기화</strong><span>{status.repository.branchSummary || '-'}</span></div>
                <div><strong>마지막 커밋</strong><span>{status.repository.lastCommit || '-'}</span></div>
                <div><strong>폴더</strong><span>{status.projectRoot}</span></div>
              </div>
            </section>

            <section className="github-panel">
              <div className="github-panel-header">
                <div>
                  <span className="panel-label">변경 파일</span>
                  <h2>커밋할 항목</h2>
                </div>
              </div>
              {status.repository.changedFiles.length > 0 ? (
                <ul className="changed-file-list">
                  {status.repository.changedFiles.map((file) => <li key={file}>{file}</li>)}
                </ul>
              ) : (
                <p className="empty-text">현재 커밋할 변경사항이 없습니다.</p>
              )}
            </section>

            <section className="github-panel">
              <label className="commit-label" htmlFor="commit-message">커밋 메시지</label>
              <div className="commit-row">
                <input
                  id="commit-message"
                  className="commit-input"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button className="btn-primary" onClick={commitPush} disabled={!canPush || busy}>
                  {busy ? '처리 중...' : '커밋하고 올리기'}
                </button>
              </div>
              {!status.gh.installed && (
                <p className="github-hint">GitHub 로그인과 저장소 생성 자동화까지 쓰려면 PowerShell에서 {status.gh.installCommand} 실행 후 다시 열면 됩니다.</p>
              )}
              {result && <p className="request-status">{result}</p>}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
