interface User {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
}

interface MyPageProps {
  user: User;
  onLogout: () => void;
  onBack: () => void;
}

const APPS = [
  { id: 'life-tracker', title: 'Life Tracker', emoji: '📊', url: '/apps/life-tracker/' },
];

export function MyPage({ user, onLogout, onBack }: MyPageProps) {
  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <button className="btn-back" onClick={onBack}>
            ← 놀이터
          </button>
        </div>
        <div className="header-right">
          <div className="user-info">
            <img src={user.avatar_url} alt={user.name} className="avatar" />
            <span className="username">{user.name || user.login}</span>
            <button className="btn-logout" onClick={onLogout}>로그아웃</button>
          </div>
        </div>
      </header>

      <main className="mypage-main">
        {/* 프로필 섹션 */}
        <section className="profile-section">
          <img src={user.avatar_url} alt={user.name} className="profile-avatar" />
          <div className="profile-info">
            <h1 className="profile-name">{user.name || user.login}</h1>
            <a
              href={`https://github.com/${user.login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="profile-github-link"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="github-icon-sm">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              @{user.login}
            </a>
          </div>
        </section>

        {/* 사용 가능한 앱 */}
        <section className="mypage-section">
          <h2 className="section-heading">🎮 내 앱</h2>
          <div className="mypage-apps">
            {APPS.map((app) => (
              <a key={app.id} href={app.url} className="mypage-app-card">
                <span className="mypage-app-emoji">{app.emoji}</span>
                <span className="mypage-app-title">{app.title}</span>
                <span className="mypage-app-arrow">→</span>
              </a>
            ))}
          </div>
        </section>

        {/* 계정 정보 */}
        <section className="mypage-section">
          <h2 className="section-heading">⚙️ 계정</h2>
          <div className="account-card">
            <div className="account-row">
              <span className="account-label">GitHub ID</span>
              <span className="account-value">@{user.login}</span>
            </div>
            <div className="account-row">
              <span className="account-label">표시 이름</span>
              <span className="account-value">{user.name || '-'}</span>
            </div>
            <div className="account-row">
              <span className="account-label">로그인 방식</span>
              <span className="account-value">GitHub OAuth</span>
            </div>
          </div>
          <button className="btn-logout-full" onClick={onLogout}>
            로그아웃
          </button>
        </section>
      </main>
    </div>
  );
}
