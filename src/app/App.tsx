import { useEffect, useState, type FormEvent } from 'react'
import { MyPage } from '../pages/my-page/MyPage'
import { getAccessTokenExpiry, formatTimeLeft } from '../shared/api/auth'
import { registerPushSubscription } from '../features/push-subscription/api/push'
import { APPS } from '../entities/app-item/model/apps'
import type { AppItem } from '../entities/app-item/model/types'
import type { User } from '../entities/user/model/types'
import type { Notice } from '../entities/notice/model/types'
import type { LocalGitHubStatus } from '../entities/github-status/model/types'
import { getFavorites, saveFavorites } from '../features/app-favorite/model/storage'
import { getStudyTimerElapsed, formatStudyTime } from '../features/study-timer-badge/model/timer'

const APP_CATEGORIES: Array<{ id: AppItem['category']; label: string; description: string }> = [
  { id: 'study', label: '학습', description: '공부 계획, 기록, 집중 공간' },
  { id: 'web-extension', label: '웹 확장', description: '브라우저 확장과 자동화 도구' },
  { id: 'dev', label: '개발', description: '개발 기록, 배포, 알림 관리' },
  { id: 'life', label: '생활', description: '일상 기록과 학교 정보' },
  { id: 'finance-security', label: '금융·보안', description: '투자 연습과 보안 체험' },
  { id: 'coming-soon', label: '준비 중', description: '나중에 열릴 기능' },
];

const CATEGORY_LABELS = new Map(APP_CATEGORIES.map((category) => [category.id, category.label]));
const TODAY_PLAN_KEY = 'playground-today-plan';

type TodayPlanItem = {
  id: string;
  appId: string;
  time: string;
  title: string;
  reminder: boolean;
  notified?: boolean;
};

const loadTodayPlan = (): TodayPlanItem[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(TODAY_PLAN_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getDefaultPlanTime = () => {
  const date = new Date(Date.now() + 30 * 60 * 1000);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<'home' | 'mypage' | 'friends' | 'github'>('home');
  const [favorites, setFavorites] = useState<string[]>(getFavorites);
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [activeCategory, setActiveCategory] = useState<AppItem['category'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [todayPlan, setTodayPlan] = useState<TodayPlanItem[]>(loadTodayPlan);
  const [planAppId, setPlanAppId] = useState(() => APPS.find((app) => !app.disabled)?.id ?? '');
  const [planTime, setPlanTime] = useState(getDefaultPlanTime);
  const [planTitle, setPlanTitle] = useState('');
  const [planReminder, setPlanReminder] = useState(true);
  const [planStatus, setPlanStatus] = useState('');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  );
  const [tokenExpiry, setTokenExpiry] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [studyElapsed, setStudyElapsed] = useState<number | null>(null);
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
  const [noticeVisible, setNoticeVisible] = useState(true);
  useEffect(() => {
    localStorage.setItem(TODAY_PLAN_KEY, JSON.stringify(todayPlan));
  }, [todayPlan]);

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const timers = todayPlan
      .filter((item) => item.reminder && !item.notified)
      .map((item) => {
        const target = new Date();
        const [hours, minutes] = item.time.split(':').map(Number);
        target.setHours(hours, minutes, 0, 0);
        const delay = target.getTime() - Date.now();
        if (delay <= 0) return null;
        return window.setTimeout(() => {
          const app = APPS.find((candidate) => candidate.id === item.appId);
          new Notification('놀이터 일정 알림', {
            body: `${item.time} · ${app?.title ?? '앱'}${item.title ? ` - ${item.title}` : ''}`,
          });
          setTodayPlan((current) => current.map((plan) => (
            plan.id === item.id ? { ...plan, notified: true } : plan
          )));
        }, delay);
      })
      .filter((timer): timer is number => timer !== null);

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [todayPlan]);

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

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') {
      setPlanStatus('이 브라우저에서는 알림을 지원하지 않습니다.');
      return false;
    }
    if (Notification.permission === 'granted') {
      setNotificationPermission('granted');
      return true;
    }
    if (Notification.permission === 'denied') {
      setNotificationPermission('denied');
      setPlanStatus('브라우저에서 알림이 차단되어 있습니다. 사이트 설정에서 알림을 허용해주세요.');
      return false;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission !== 'granted') {
      setPlanStatus('알림 권한 없이 일정만 저장했습니다.');
      return false;
    }
    return true;
  };

  const addTodayPlan = async (e: FormEvent) => {
    e.preventDefault();
    const app = APPS.find((candidate) => candidate.id === planAppId && !candidate.disabled);
    if (!app) {
      setPlanStatus('사용 가능한 앱을 선택해주세요.');
      return;
    }
    if (!planTime) {
      setPlanStatus('시간을 선택해주세요.');
      return;
    }
    const title = planTitle.trim();
    const shouldRemind = planReminder && await requestNotificationPermission();
    const nextItem: TodayPlanItem = {
      id: `${Date.now()}-${app.id}`,
      appId: app.id,
      time: planTime,
      title,
      reminder: shouldRemind,
    };
    setTodayPlan((current) => [...current, nextItem].sort((a, b) => a.time.localeCompare(b.time)));
    setPlanTitle('');
    setPlanStatus(shouldRemind ? '일정과 알람을 저장했습니다.' : '일정을 저장했습니다.');
  };

  const availableApps = APPS.filter((app) => !app.disabled);
  const disabledApps = APPS.filter((app) => app.disabled);
  const searchTerm = searchQuery.trim().toLowerCase();
  const displayedApps = APPS.filter((app) => {
    if (showFavOnly && !favorites.includes(app.id)) return false;
    if (activeCategory !== 'all' && app.category !== activeCategory) return false;
    if (!searchTerm) return true;
    return [app.title, app.description, app.id, CATEGORY_LABELS.get(app.category)]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(searchTerm));
  });
  const displayedGroups = APP_CATEGORIES
    .map((category) => ({
      ...category,
      apps: displayedApps.filter((app) => app.category === category.id),
    }))
    .filter((category) => category.apps.length > 0);
  const favoriteAvailableCount = favorites.filter((id) => availableApps.some((app) => app.id === id)).length;
  const sortedTodayPlan = [...todayPlan].sort((a, b) => a.time.localeCompare(b.time));
  const categoryTabs = [
    { id: 'all' as const, label: '전체' },
    ...APP_CATEGORIES.map((category) => ({ id: category.id, label: category.label })),
  ];
  const activeCategoryLabel = categoryTabs.find((category) => category.id === activeCategory)?.label ?? '전체';

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
      {noticeVisible && (
        <div className="gallery-notice">
          <span>🔔 2026년 Playground 앱 {APPS.length}개 정리 완료 — 학습·개발·생활 카테고리 업데이트됨</span>
          <button type="button" onClick={() => setNoticeVisible(false)} aria-label="닫기">×</button>
        </div>
      )}

      <header className="gallery-header">
        <div className="gallery-header-inner">
          <a className="gallery-logo" href="/" aria-label="놀이터 홈">
            <span>P</span>
            <strong>놀이터</strong>
          </a>
          <label className="gallery-search">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="앱 검색..."
            />
          </label>
          <div className="gallery-header-actions">
            <button
              type="button"
              className={`gallery-action ${showFavOnly ? 'active' : ''}`}
              onClick={() => setShowFavOnly((current) => !current)}
            >
              즐겨찾기
            </button>
            <button type="button" className="gallery-action" onClick={openFeatureRequest}>
              + 요청하기
            </button>
            {user ? (
              <>
                {studyElapsed !== null && (
                  <a href="/apps/study-planner/" className="gallery-action timer-action">
                    {formatStudyTime(studyElapsed)}
                  </a>
                )}
                <button type="button" className="gallery-action" onClick={() => setPage('friends')}>친구</button>
                <button type="button" className="gallery-user" onClick={() => setPage('mypage')}>
                  <img src={user.avatar_url} alt={user.name} />
                  <span>{user.name || user.login}</span>
                </button>
                <button type="button" className="gallery-action" onClick={handleLogout}>로그아웃</button>
              </>
            ) : (
              <button type="button" className="gallery-submit" onClick={() => handleLogin()}>
                GitHub 로그인
              </button>
            )}
          </div>
        </div>
      </header>

      {user && latestNotice && (
        <button className="gallery-live-notice" onClick={() => openNoticeArchive(latestNotice)}>
          <span>{formatNoticeDate(latestNotice.createdAt)}</span>
          <strong>{latestNotice.title}</strong>
          <em>{latestNotice.content}</em>
        </button>
      )}

      <section className="gallery-hero">
        <div className="gallery-hero-inner">
          <p>큐레이션 웹앱 갤러리</p>
          <h1>필요한 웹앱만 골라서 보여드립니다</h1>
          <span>
            공부·개발·자동화·생활 도구를 카테고리별로 모았습니다.
            검색과 즐겨찾기로 바로 실행할 앱을 빠르게 찾으세요.
          </span>
          <div className="gallery-stats">
            <div><strong>{availableApps.length}</strong><small>사용 가능</small></div>
            <div><strong>{favorites.length}</strong><small>즐겨찾기</small></div>
            <div><strong>{APP_CATEGORIES.length}</strong><small>카테고리</small></div>
          </div>
        </div>
      </section>

      <nav className="gallery-tabs" aria-label="앱 카테고리">
        <div className="gallery-tabs-inner">
          {categoryTabs.map((category) => (
            <button
              key={category.id}
              type="button"
              className={activeCategory === category.id ? 'active' : ''}
              onClick={() => setActiveCategory(category.id)}
            >
              {category.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="gallery-main">
        <div className="gallery-section-title">
          <h2>
            {showFavOnly ? '즐겨찾기' : activeCategoryLabel}
            <span>{displayedApps.length}개</span>
          </h2>
          <button type="button" onClick={() => setShowFavOnly(false)}>최신순 ▾</button>
        </div>

        {displayedApps.length === 0 ? (
          <div className="gallery-empty">검색 결과가 없습니다</div>
        ) : (
          <div className="gallery-grid">
            {displayedApps.map((app, index) => (
              <a
                key={app.id}
                href={user && !app.disabled ? app.url : undefined}
                className={`gallery-card ${app.disabled ? 'disabled' : ''} ${!user ? 'locked' : ''}`}
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
                <div className="gallery-thumb">
                  <span className="gallery-thumb-emoji">{app.emoji}</span>
                  <div className="gallery-badges">
                    {index < 3 && <span className="featured">추천</span>}
                    {!app.disabled && index % 4 === 1 && <span className="new">NEW</span>}
                  </div>
                  <span className="gallery-category">{CATEGORY_LABELS.get(app.category)}</span>
                </div>
                <div className="gallery-card-body">
                  <div className="gallery-card-head">
                    <strong>{app.title}</strong>
                    <button
                      type="button"
                      className={`gallery-favorite ${favorites.includes(app.id) ? 'favorited' : ''}`}
                      onClick={(e) => toggleFavorite(app.id, e)}
                      aria-label={favorites.includes(app.id) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                    >
                      ★
                    </button>
                  </div>
                  <p>{app.description}</p>
                  <div className="gallery-card-meta">
                    <div>
                      <span>{app.disabled ? '정의 필요' : user ? '바로 실행' : '로그인 필요'}</span>
                      <span>{app.id}</span>
                    </div>
                    <small>{app.disabled ? '준비 중' : '열기'}</small>
                  </div>
                  <div className="gallery-url">{app.url.replace('/apps/', '').replace('/', '') || app.id}</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>

      <footer className="gallery-footer">
        <div>
          <span>P</span>
          <strong>놀이터</strong>
        </div>
        <small>© 2026 Playground. All rights reserved.</small>
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
