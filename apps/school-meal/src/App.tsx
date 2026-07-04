import { useState, useEffect } from 'react';

interface School {
  name: string;
  orgCode: string;
  schoolCode: string;
  address: string;
  type: string;
}

interface Meal {
  mealType: string;
  menu: string;
  calories: string;
  date: string;
}

interface SavedSchool {
  name: string;
  orgCode: string;
  schoolCode: string;
  alertEnabled: boolean;
  alertTime: string; // "HH:MM" 형식 - 급식 몇 분 전 알림
  mealType: string;  // 중식/석식 등
}

const STORAGE_KEY = 'school-meal-settings';

function getToday(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function getTodayDisplay(): string {
  return new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

export default function App() {
  const [saved, setSaved] = useState<SavedSchool | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<School[]>([]);
  const [searching, setSearching] = useState(false);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'main' | 'search' | 'settings'>('main');
  const [notifPermission, setNotifPermission] = useState(Notification.permission);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as SavedSchool;
      setSaved(s);
      fetchMeals(s.orgCode, s.schoolCode);
    }
  }, []);

  const fetchMeals = async (orgCode: string, schoolCode: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/neis/meal?orgCode=${orgCode}&schoolCode=${schoolCode}&date=${getToday()}`);
      const data = await res.json();
      setMeals(data);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/neis/school?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(await res.json());
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSchool = (school: School) => {
    const settings: SavedSchool = {
      name: school.name,
      orgCode: school.orgCode,
      schoolCode: school.schoolCode,
      alertEnabled: false,
      alertTime: '12:20', // 기본 급식 10분 전
      mealType: '중식',
    };
    setSaved(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    fetchMeals(school.orgCode, school.schoolCode);
    setView('main');
    setSearchResults([]);
    setSearchQuery('');
  };

  const requestNotification = async () => {
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm === 'granted' && saved) {
      const updated = { ...saved, alertEnabled: true };
      setSaved(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      scheduleAlert(updated);
    }
  };

  const toggleAlert = () => {
    if (!saved) return;
    if (!saved.alertEnabled && notifPermission !== 'granted') {
      requestNotification();
      return;
    }
    const updated = { ...saved, alertEnabled: !saved.alertEnabled };
    setSaved(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    if (updated.alertEnabled) scheduleAlert(updated);
  };

  const scheduleAlert = (settings: SavedSchool) => {
    if (!settings.alertEnabled) return;
    const [h, m] = settings.alertTime.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(h, m, 0, 0);
    const diff = target.getTime() - now.getTime();
    if (diff > 0) {
      setTimeout(() => {
        const meal = meals.find(meal => meal.mealType.includes(settings.mealType));
        const body = meal ? meal.menu.split('\n').slice(0, 3).join(', ') : '급식 정보를 확인하세요';
        new Notification(`🍱 ${settings.mealType} 10분 전!`, { body, icon: '/favicon.svg', tag: 'meal-alert' });
      }, diff);
    }
  };

  const mealTypeColors: Record<string, string> = {
    '조식': '#ffa502', '중식': '#2ed573', '석식': '#70a1ff',
  };

  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="back-link">← 놀이터</a>
        <div className="header-info">
          <h1 className="app-title">🍱 급식 알리미</h1>
          <p className="app-subtitle">{saved ? saved.name : '학교를 선택하세요'}</p>
        </div>
        <div className="header-actions">
          {saved && (
            <button className="btn-ghost" onClick={() => setView(view === 'settings' ? 'main' : 'settings')}>
              ⚙️
            </button>
          )}
          <button className="btn-primary" onClick={() => setView(view === 'search' ? 'main' : 'search')}>
            {view === 'search' ? '취소' : '🔍 학교 변경'}
          </button>
        </div>
      </header>

      {view === 'search' && (
        <div className="search-panel">
          <form className="search-form" onSubmit={handleSearch}>
            <input
              className="search-input"
              placeholder="학교명 (예: 광주소프트웨어마이스터고) 또는 지역명 (예: 광주광역시)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn-primary" disabled={searching}>
              {searching ? '검색 중...' : '검색'}
            </button>
          </form>
          <div className="search-results">
            {searchResults.map(s => (
              <div key={s.schoolCode} className="school-item" onClick={() => handleSelectSchool(s)}>
                <div className="school-name">{s.name}</div>
                <div className="school-meta">{s.type} · {s.address}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'settings' && saved && (
        <div className="settings-panel">
          <h2 className="settings-title">알림 설정</h2>
          <div className="settings-row">
            <span>알림 사용</span>
            <button className={`toggle-btn ${saved.alertEnabled ? 'on' : 'off'}`} onClick={toggleAlert}>
              {saved.alertEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="settings-row">
            <span>알림 시간</span>
            <input
              type="time"
              className="time-input"
              value={saved.alertTime}
              onChange={e => {
                const updated = { ...saved, alertTime: e.target.value };
                setSaved(updated);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
              }}
            />
          </div>
          <div className="settings-row">
            <span>알림 급식</span>
            <select
              className="select-field"
              value={saved.mealType}
              onChange={e => {
                const updated = { ...saved, mealType: e.target.value };
                setSaved(updated);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
              }}
            >
              <option>조식</option>
              <option>중식</option>
              <option>석식</option>
            </select>
          </div>
          {notifPermission === 'denied' && (
            <p className="settings-warn">⚠️ 브라우저에서 알림이 차단됐어요. 브라우저 설정에서 허용해주세요.</p>
          )}
          <button className="btn-ghost mt" onClick={() => setView('main')}>← 돌아가기</button>
        </div>
      )}

      {view === 'main' && (
        <main className="app-main">
          {!saved ? (
            <div className="empty-state">
              <p className="empty-icon">🏫</p>
              <p>학교를 먼저 선택해주세요.</p>
              <button className="btn-primary mt" onClick={() => setView('search')}>🔍 학교 검색</button>
            </div>
          ) : loading ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : meals.length === 0 ? (
            <div className="empty-state">
              <p className="empty-icon">🤷</p>
              <p>오늘은 급식 정보가 없어요.</p>
              <p className="empty-sub">{getTodayDisplay()}</p>
            </div>
          ) : (
            <div className="meal-list">
              <p className="today-label">📅 {getTodayDisplay()}</p>
              {meals.map((meal, i) => (
                <div key={i} className="meal-card" style={{ borderTop: `3px solid ${mealTypeColors[meal.mealType] || '#888'}` }}>
                  <div className="meal-header">
                    <span className="meal-type" style={{ color: mealTypeColors[meal.mealType] || '#888' }}>
                      {meal.mealType}
                    </span>
                    {meal.calories && <span className="meal-cal">{meal.calories}</span>}
                  </div>
                  <ul className="menu-list">
                    {meal.menu.split('\n').filter(Boolean).map((item, j) => (
                      <li key={j} className="menu-item">{item.trim()}</li>
                    ))}
                  </ul>
                </div>
              ))}

              {saved.alertEnabled ? (
                <div className="alert-status on">
                  🔔 {saved.mealType} {saved.alertTime} 알림 설정됨
                </div>
              ) : (
                <button className="alert-cta" onClick={toggleAlert}>
                  🔔 급식 알림 받기
                </button>
              )}
            </div>
          )}
        </main>
      )}
    </div>
  );
}
