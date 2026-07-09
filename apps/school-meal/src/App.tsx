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

interface TimetableItem {
  period: number;
  subject: string;
  date: string;
}

interface SavedSchool {
  name: string;
  orgCode: string;
  schoolCode: string;
  schoolType: string;
  grade: string;
  className: string;
  alertEnabled: boolean;
  alertTime: string;
  mealType: string;
}

const STORAGE_KEY = 'school-meal-settings';
type Theme = 'dark' | 'light';
type MainTab = 'meal' | 'timetable';
const THEME_KEY = 'playground-theme';
const GRADES = ['1', '2', '3', '4', '5', '6'];
const CLASS_NAMES = Array.from({ length: 20 }, (_, i) => String(i + 1));
const MEAL_TYPES = [
  { value: '조식', label: '🌅 아침' },
  { value: '중식', label: '☀️ 점심' },
  { value: '석식', label: '🌙 저녁' },
];
const MAIN_TABS: { value: MainTab; label: string }[] = [
  { value: 'meal', label: '🍱 급식' },
  { value: 'timetable', label: '📚 시간표' },
];
const MEAL_TYPE_COLORS: Record<string, string> = {
  '조식': '#ffa502',
  '중식': '#2ed573',
  '석식': '#70a1ff',
};
const getTheme = (): Theme => localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';

function dateToApi(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function dateToDisplay(date: Date): string {
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function normalizeSavedSchool(raw: SavedSchool): SavedSchool {
  return {
    ...raw,
    schoolType: raw.schoolType || '',
    grade: raw.grade || '1',
    className: raw.className || '1',
  };
}

export default function App() {
  const [saved, setSaved] = useState<SavedSchool | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<School[]>([]);
  const [searching, setSearching] = useState(false);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [timetable, setTimetable] = useState<TimetableItem[]>([]);
  const [mealLoading, setMealLoading] = useState(false);
  const [timetableLoading, setTimetableLoading] = useState(false);
  const [view, setView] = useState<'main' | 'search' | 'settings'>('main');
  const [activeTab, setActiveTab] = useState<MainTab>('meal');
  const [notifPermission, setNotifPermission] = useState(Notification.permission);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedMealType, setSelectedMealType] = useState<string>('중식');
  const [theme, setTheme] = useState<Theme>(getTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = normalizeSavedSchool(JSON.parse(raw) as SavedSchool);
      setSaved(s);
      fetchMeals(s.orgCode, s.schoolCode, new Date());
      fetchTimetable(s, new Date());
    }
  }, []);

  const saveSettings = (settings: SavedSchool) => {
    setSaved(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  };

  const fetchMeals = async (orgCode: string, schoolCode: string, date: Date) => {
    setMealLoading(true);
    try {
      const res = await fetch(`/neis/meal?orgCode=${orgCode}&schoolCode=${schoolCode}&date=${dateToApi(date)}`);
      const data = await res.json();
      setMeals(Array.isArray(data) ? data : []);
    } finally {
      setMealLoading(false);
    }
  };

  const fetchTimetable = async (settings: SavedSchool, date: Date) => {
    setTimetableLoading(true);
    try {
      const params = new URLSearchParams({
        orgCode: settings.orgCode,
        schoolCode: settings.schoolCode,
        schoolType: settings.schoolType,
        grade: settings.grade,
        className: settings.className,
        date: dateToApi(date),
      });
      const res = await fetch(`/neis/timetable?${params.toString()}`);
      const data = await res.json();
      setTimetable(Array.isArray(data) ? data : []);
    } finally {
      setTimetableLoading(false);
    }
  };

  const handleDateChange = (delta: number) => {
    const newDate = addDays(selectedDate, delta);
    setSelectedDate(newDate);
    if (saved) {
      fetchMeals(saved.orgCode, saved.schoolCode, newDate);
      fetchTimetable(saved, newDate);
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
      schoolType: school.type,
      grade: '1',
      className: '1',
      alertEnabled: false,
      alertTime: '12:20',
      mealType: '중식',
    };
    saveSettings(settings);
    fetchMeals(school.orgCode, school.schoolCode, selectedDate);
    fetchTimetable(settings, selectedDate);
    setView('main');
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleClassSettingChange = (field: 'grade' | 'className', value: string) => {
    if (!saved) return;
    const updated = { ...saved, [field]: value };
    saveSettings(updated);
    fetchTimetable(updated, selectedDate);
  };

  const requestNotification = async () => {
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm === 'granted' && saved) {
      const updated = { ...saved, alertEnabled: true };
      saveSettings(updated);
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
    saveSettings(updated);
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

  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="back-link">← 놀이터</a>
        <div className="header-info">
          <h1 className="app-title">🏫 학교 알리미</h1>
          <p className="app-subtitle">{saved ? `${saved.name} · ${saved.grade}학년 ${saved.className}반` : '학교를 선택하세요'}</p>
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
          <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="테마 전환">
            {theme === 'dark' ? '☀️' : '🌙'}
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
          <h2 className="settings-title">설정</h2>
          <div className="settings-row">
            <span>학년</span>
            <select className="select-field" value={saved.grade} onChange={e => handleClassSettingChange('grade', e.target.value)}>
              {GRADES.map(grade => <option key={grade} value={grade}>{grade}학년</option>)}
            </select>
          </div>
          <div className="settings-row">
            <span>반</span>
            <select className="select-field" value={saved.className} onChange={e => handleClassSettingChange('className', e.target.value)}>
              {CLASS_NAMES.map(className => <option key={className} value={className}>{className}반</option>)}
            </select>
          </div>
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
              onChange={e => saveSettings({ ...saved, alertTime: e.target.value })}
            />
          </div>
          <div className="settings-row">
            <span>알림 급식</span>
            <select className="select-field" value={saved.mealType} onChange={e => saveSettings({ ...saved, mealType: e.target.value })}>
              {MEAL_TYPES.map(type => <option key={type.value} value={type.value}>{type.value}</option>)}
            </select>
          </div>
          {notifPermission === 'denied' && (
            <p className="settings-warn">브라우저에서 알림이 차단됐어요. 브라우저 설정에서 허용해주세요.</p>
          )}
          <button className="btn-ghost mt" onClick={() => setView('main')}>← 돌아가기</button>
        </div>
      )}

      {view === 'main' && (
        <main className="app-main">
          <div className="date-nav">
            <button className="date-nav-btn" onClick={() => handleDateChange(-1)}>‹</button>
            <span className="date-label">{dateToDisplay(selectedDate)}</span>
            <button className="date-nav-btn" onClick={() => handleDateChange(1)}>›</button>
          </div>

          {saved && (
            <>
              <div className="main-tabs">
                {MAIN_TABS.map(tab => (
                  <button
                    key={tab.value}
                    className={`main-tab ${activeTab === tab.value ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.value)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="class-selector">
                <select className="select-field" value={saved.grade} onChange={e => handleClassSettingChange('grade', e.target.value)}>
                  {GRADES.map(grade => <option key={grade} value={grade}>{grade}학년</option>)}
                </select>
                <select className="select-field" value={saved.className} onChange={e => handleClassSettingChange('className', e.target.value)}>
                  {CLASS_NAMES.map(className => <option key={className} value={className}>{className}반</option>)}
                </select>
              </div>
            </>
          )}

          {!saved ? (
            <div className="empty-state">
              <p className="empty-icon">🏫</p>
              <p>학교를 먼저 선택해주세요.</p>
              <button className="btn-primary mt" onClick={() => setView('search')}>🔍 학교 검색</button>
            </div>
          ) : activeTab === 'meal' ? (
            <>
              {meals.length > 0 && (
                <div className="meal-type-tabs">
                  {MEAL_TYPES.map(type => (
                    <button
                      key={type.value}
                      className={`meal-type-tab ${selectedMealType === type.value ? 'active' : ''} ${!meals.find(m => m.mealType.includes(type.value)) ? 'disabled' : ''}`}
                      onClick={() => setSelectedMealType(type.value)}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              )}

              {mealLoading ? (
                <div className="empty-state"><div className="spinner" /></div>
              ) : meals.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-icon">🤷</p>
                  <p>이 날은 급식 정보가 없어요.</p>
                  <p className="empty-sub">{dateToDisplay(selectedDate)}</p>
                </div>
              ) : (
                <div className="meal-list">
                  {(() => {
                    const filtered = meals.filter(m => m.mealType.includes(selectedMealType));
                    if (filtered.length === 0) return (
                      <div className="empty-state">
                        <p className="empty-icon">🍽️</p>
                        <p>{selectedMealType} 정보가 없어요.</p>
                      </div>
                    );
                    return filtered.map((meal, i) => (
                      <div key={i} className="meal-card" style={{ borderTop: `3px solid ${MEAL_TYPE_COLORS[meal.mealType] || '#888'}` }}>
                        <div className="meal-header">
                          <span className="meal-type" style={{ color: MEAL_TYPE_COLORS[meal.mealType] || '#888' }}>
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
                    ));
                  })()}

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
            </>
          ) : timetableLoading ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : timetable.length === 0 ? (
            <div className="empty-state">
              <p className="empty-icon">📚</p>
              <p>{saved.grade}학년 {saved.className}반 시간표 정보가 없어요.</p>
              <p className="empty-sub">{dateToDisplay(selectedDate)}</p>
            </div>
          ) : (
            <div className="timetable-list">
              {timetable.map(item => (
                <div key={`${item.period}-${item.subject}`} className="timetable-item">
                  <span className="period-badge">{item.period}교시</span>
                  <span className="subject-name">{item.subject}</span>
                </div>
              ))}
            </div>
          )}
        </main>
      )}
    </div>
  );
}
