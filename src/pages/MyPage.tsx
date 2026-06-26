import { useEffect, useState } from 'react';

interface User {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
}

interface FriendUser {
  githubId: string;
  login: string;
  name: string;
  avatarUrl: string;
  friendStatus: string | null;
}

interface FriendRequest {
  requestId: number;
  githubId: string;
  login: string;
  name: string;
  avatarUrl: string;
  createdAt: string;
}

interface MyPageProps {
  user: User;
  onLogout: () => void;
  onBack: () => void;
}

type Tab = 'apps' | 'friends';

const APPS = [
  { id: 'life-tracker', title: 'Life Tracker', emoji: '📊', url: '/apps/life-tracker/' },
  { id: 'dev-notes', title: '개발자 노트', emoji: '📒', url: '/apps/dev-notes/' },
  { id: 'study-planner', title: '스터디 플래너', emoji: '📅', url: '/apps/study-planner/' },
];

export function MyPage({ user, onLogout, onBack }: MyPageProps) {
  const [tab, setTab] = useState<Tab>('apps');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  useEffect(() => {
    if (tab === 'friends') loadFriendsData();
  }, [tab]);

  const loadFriendsData = async () => {
    setLoadingFriends(true);
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        fetch('/api/friends', { credentials: 'include' }),
        fetch('/api/friends/requests', { credentials: 'include' }),
      ]);
      if (friendsRes.ok) setFriends(await friendsRes.json());
      if (requestsRes.ok) setRequests(await requestsRes.json());
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/friends/search?q=${encodeURIComponent(searchQuery)}`, { credentials: 'include' });
      if (res.ok) setSearchResults(await res.json());
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (githubId: string) => {
    const res = await fetch(`/api/friends/request/${githubId}`, { method: 'POST', credentials: 'include' });
    if (res.ok) {
      setSearchResults(prev => prev.map(u => u.githubId === githubId ? { ...u, friendStatus: 'PENDING_SENT' } : u));
    }
  };

  const acceptRequest = async (requestId: number) => {
    const res = await fetch(`/api/friends/accept/${requestId}`, { method: 'POST', credentials: 'include' });
    if (res.ok) loadFriendsData();
  };

  const rejectRequest = async (requestId: number) => {
    const res = await fetch(`/api/friends/reject/${requestId}`, { method: 'POST', credentials: 'include' });
    if (res.ok) setRequests(prev => prev.filter(r => r.requestId !== requestId));
  };

  const removeFriend = async (githubId: string) => {
    const res = await fetch(`/api/friends/${githubId}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) setFriends(prev => prev.filter(f => f.githubId !== githubId));
  };

  const statusLabel = (status: string | null) => {
    if (!status) return { label: '친구 추가', cls: 'btn-primary btn-sm', action: true };
    if (status === 'PENDING_SENT') return { label: '요청 중', cls: 'btn-ghost btn-sm', action: false };
    if (status === 'PENDING_RECEIVED') return { label: '요청 받음', cls: 'btn-ghost btn-sm', action: false };
    if (status === 'ACCEPTED') return { label: '친구 ✓', cls: 'btn-ghost btn-sm', action: false };
    return { label: '친구 추가', cls: 'btn-primary btn-sm', action: true };
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <button className="btn-back" onClick={onBack}>← 놀이터</button>
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
            <a href={`https://github.com/${user.login}`} target="_blank" rel="noopener noreferrer" className="profile-github-link">
              <svg viewBox="0 0 24 24" fill="currentColor" className="github-icon-sm">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              @{user.login}
            </a>
          </div>
        </section>

        {/* 탭 */}
        <div className="mypage-tabs">
          <button className={`mypage-tab ${tab === 'apps' ? 'active' : ''}`} onClick={() => setTab('apps')}>🎮 내 앱</button>
          <button className={`mypage-tab ${tab === 'friends' ? 'active' : ''}`} onClick={() => setTab('friends')}>
            👥 친구
            {requests.length > 0 && <span className="friend-badge">{requests.length}</span>}
          </button>
        </div>

        {/* 앱 탭 */}
        {tab === 'apps' && (
          <>
            <section className="mypage-section">
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
              <button className="btn-logout-full" onClick={onLogout}>로그아웃</button>
            </section>
          </>
        )}

        {/* 친구 탭 */}
        {tab === 'friends' && (
          <section className="mypage-section">

            {/* 친구 요청 받은 것 */}
            {requests.length > 0 && (
              <div className="friend-requests-section">
                <h3 className="section-heading">📬 받은 친구 요청 ({requests.length})</h3>
                <div className="friend-list">
                  {requests.map(r => (
                    <div key={r.requestId} className="friend-item">
                      <img src={r.avatarUrl} alt={r.login} className="friend-avatar" />
                      <div className="friend-info">
                        <span className="friend-name">{r.name || r.login}</span>
                        <span className="friend-login">@{r.login}</span>
                      </div>
                      <div className="friend-actions">
                        <button className="btn-primary btn-sm" onClick={() => acceptRequest(r.requestId)}>수락</button>
                        <button className="btn-ghost btn-sm" onClick={() => rejectRequest(r.requestId)}>거절</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 유저 검색 */}
            <div className="friend-search-section">
              <h3 className="section-heading">🔍 친구 찾기</h3>
              <form className="friend-search-form" onSubmit={handleSearch}>
                <input
                  type="text"
                  className="friend-search-input"
                  placeholder="GitHub 아이디로 검색"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <button type="submit" className="btn-primary btn-sm" disabled={searching}>
                  {searching ? '검색 중...' : '검색'}
                </button>
              </form>

              {searchResults.length > 0 && (
                <div className="friend-list">
                  {searchResults.map(u => {
                    const { label, cls, action } = statusLabel(u.friendStatus);
                    return (
                      <div key={u.githubId} className="friend-item">
                        <img src={u.avatarUrl} alt={u.login} className="friend-avatar" />
                        <div className="friend-info">
                          <span className="friend-name">{u.name || u.login}</span>
                          <span className="friend-login">@{u.login}</span>
                        </div>
                        <button
                          className={cls}
                          onClick={() => action && sendRequest(u.githubId)}
                          disabled={!action}
                        >
                          {label}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {searchResults.length === 0 && searchQuery && !searching && (
                <p className="friend-empty">검색 결과가 없어요.</p>
              )}
            </div>

            {/* 친구 목록 */}
            <div className="friend-list-section">
              <h3 className="section-heading">👥 친구 {friends.length}명</h3>
              {loadingFriends ? (
                <p className="friend-empty">불러오는 중...</p>
              ) : friends.length === 0 ? (
                <p className="friend-empty">아직 친구가 없어요. 검색해서 추가해보세요.</p>
              ) : (
                <div className="friend-list">
                  {friends.map(f => (
                    <div key={f.githubId} className="friend-item">
                      <img src={f.avatarUrl} alt={f.login} className="friend-avatar" />
                      <div className="friend-info">
                        <span className="friend-name">{f.name || f.login}</span>
                        <span className="friend-login">@{f.login}</span>
                      </div>
                      <button className="btn-ghost btn-sm danger" onClick={() => removeFriend(f.githubId)}>
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </section>
        )}
      </main>
    </div>
  );
}
