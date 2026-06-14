import { useEffect, useState } from 'react'
import { MyPage } from './pages/MyPage'

interface User {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
}

const APPS = [
  {
    id: 'life-tracker',
    title: 'Life Tracker',
    description: '실패, 버린 시간, 작은 성취를 기록하는 자기 이해 플랫폼',
    emoji: '📊',
    url: '/apps/life-tracker/',
    color: '#70a1ff',
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
    id: 'coming-soon-1',
    title: '준비 중...',
    description: '새로운 앱이 곧 추가됩니다',
    emoji: '🔮',
    url: '#',
    color: '#a855f7',
    disabled: true,
  },
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<'home' | 'mypage'>('home');

  useEffect(() => {
    fetch('/auth/me')
      .then((res) => res.json())
      .then((data) => {
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleLogin = () => {
    window.location.href = '/auth/github';
  };

  const handleLogout = async () => {
    await fetch('/auth/logout', { method: 'POST' });
    setUser(null);
    setPage('home');
  };

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
              <button
                className="avatar-btn"
                onClick={() => setPage('mypage')}
                aria-label="마이페이지"
                title="마이페이지"
              >
                <img src={user.avatar_url} alt={user.name} className="avatar" />
              </button>
              <button
                className="username-btn"
                onClick={() => setPage('mypage')}
              >
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

        <section className="apps-grid">
          {APPS.map((app) => (
            <a
              key={app.id}
              href={user && !app.disabled ? app.url : undefined}
              className={`app-card ${app.disabled ? 'disabled' : ''} ${!user ? 'locked' : ''}`}
              style={{ '--accent': app.color } as React.CSSProperties}
              onClick={(e) => {
                if (!user || app.disabled) e.preventDefault();
              }}
            >
              <div className="app-emoji">{app.emoji}</div>
              <h2 className="app-title">{app.title}</h2>
              <p className="app-desc">{app.description}</p>
              {!user && <span className="lock-badge">🔒 로그인 필요</span>}
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
