import { useEffect, useState } from 'react'
import { MyPage } from './pages/MyPage'
import { getAccessTokenExpiry, formatTimeLeft } from './api/auth'
import { registerPushSubscription } from './api/push'

interface User {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
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
    id: 'life-tracker',
    title: 'Life Tracker',
    description: '실패, 버린 시간, 작은 성취를 기록하는 자기 이해 플랫폼',
    emoji: '📊',
    url: '/apps/life-tracker/',
    color: '#70a1ff',
  },
  {
    id: 'cornell-notes',
    title: '코넬 노트',
    description: '키워드, 세부 내용, 요약으로 배운 내용을 구조적으로 정리',
    emoji: '📝',
    url: '/apps/cornell-notes/',
    color: '#a29bfe',
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
  const [page, setPage] = useState<'home' | 'mypage' | 'friends'>('home');
  const [favorites, setFavorites] = useState<string[]>(getFavorites);
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [tokenExpiry, setTokenExpiry] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setUser(data.user);
        setLoading(false);
        if (data.user) {
          setTokenExpiry(getAccessTokenExpiry());
          registerPushSubscription(); // 로그인 시 Push 구독 등록
        }
      })
      .catch(() => setLoading(false));
  }, []);

  // 1초마다 남은 시간 갱신 + 만료 5분 전 자동 갱신
  useEffect(() => {
    if (!tokenExpiry) return;
    const update = () => {
      const diff = tokenExpiry.getTime() - Date.now();
      setTimeLeft(formatTimeLeft(tokenExpiry));
      // 만료 5분 전 자동 갱신
      if (diff > 0 && diff < 5 * 60 * 1000) {
        fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
          .then((res) => {
            if (res.ok) setTokenExpiry(getAccessTokenExpiry());
          });
      }
      // 만료됐으면 갱신 시도
      if (diff <= 0) {
        fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
          .then((res) => {
            if (res.ok) setTokenExpiry(getAccessTokenExpiry());
            else { setUser(null); }
          });
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [tokenExpiry]);

  const handleLogin = () => { window.location.href = '/auth/github'; };

  const handleLogout = async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    setPage('home');
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

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1 className="logo">🎮 놀이터</h1>
          <p className="tagline">나만의 작은 웹앱 모음</p>
        </div>
        <div className="header-right">
          {user ? (
            <div className="user-info">
              {timeLeft && (
                <span className={`token-expiry ${timeLeft === '만료됨' ? 'expired' : ''}`}>
                  🔑 {timeLeft}
                </span>
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
                if (!user || app.disabled) e.preventDefault();
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
    </div>
  );
}

export default App;
