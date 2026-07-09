import { useState, useEffect, useRef } from 'react';

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

interface MealAlert {
  id: string;
  mealType: string;
  alertTime: string;
  enabled: boolean;
}

interface SavedSchool {
  name: string;
  orgCode: string;
  schoolCode: string;
  schoolType: string;
  grade: string;
  className: string;
  alerts: MealAlert[];
  allergyCodes: string[];
  dislikeCodes: string[];
  allergyKeywords: string[];
  dislikeKeywords: string[];
  alertEnabled?: boolean;
  alertTime?: string;
  mealType?: string;
}

const STORAGE_KEY = 'school-meal-settings';
type Theme = 'dark' | 'light';
type MainTab = 'meal' | 'timetable';
const THEME_KEY = 'playground-theme';
const ELEMENTARY_GRADES = ['1', '2', '3', '4', '5', '6'];
const SECONDARY_GRADES = ['1', '2', '3'];
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
const DEFAULT_ALERT_TIMES: Record<string, string> = {
  '조식': '07:50',
  '중식': '12:20',
  '석식': '18:00',
};
const ALLERGEN_CATEGORIES = [
  { id: '1', label: '난류', codes: ['1'] },
  { id: '2', label: '우유', codes: ['2'] },
  { id: '3', label: '메밀', codes: ['3'] },
  { id: '4', label: '땅콩', codes: ['4'] },
  { id: '5', label: '대두류', codes: ['5'] },
  { id: '6', label: '밀', codes: ['6'] },
  { id: '7', label: '고등어', codes: ['7'] },
  { id: '8', label: '게', codes: ['8'] },
  { id: '9', label: '새우', codes: ['9'] },
  { id: '10', label: '돼지고기', codes: ['10'] },
  { id: '11', label: '복숭아', codes: ['11'] },
  { id: '12', label: '토마토', codes: ['12'] },
  { id: '13', label: '아황산류', codes: ['13'] },
  { id: '14', label: '호두', codes: ['14'] },
  { id: '15', label: '닭고기', codes: ['15'] },
  { id: '16', label: '쇠고기', codes: ['16'] },
  { id: '17', label: '오징어', codes: ['17'] },
  { id: '18', label: '조개류', codes: ['18'] },
  { id: '19', label: '잣', codes: ['19'] },
  { id: 'seafood', label: '어패류', codes: ['7', '8', '9', '17', '18'] },
];
const getTheme = (): Theme => localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function dateToInput(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function dateToApi(date: Date): string {
  return dateToInput(date).replace(/-/g, '');
}

function dateToDisplay(date: Date): string {
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function inputToDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getDefaultMealTarget(now = new Date()): { date: Date; mealType: string } {
  const hour = now.getHours();
  if (hour >= 19) return { date: addDays(now, 1), mealType: '조식' };
  if (hour >= 13) return { date: now, mealType: '석식' };
  if (hour >= 8) return { date: now, mealType: '중식' };
  return { date: now, mealType: '조식' };
}

function getGradeOptions(schoolType: string): string[] {
  return schoolType.includes('초등') ? ELEMENTARY_GRADES : SECONDARY_GRADES;
}

function splitKeywords(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function keywordsToText(value: string[]): string {
  return value.join(', ');
}

function getMenuMatch(item: string, keywords: string[]): string[] {
  const normalizedItem = item.toLowerCase();
  return keywords.filter(keyword => normalizedItem.includes(keyword.toLowerCase()));
}

function extractAllergenCodes(item: string): string[] {
  const codes = new Set<string>();
  for (const match of item.matchAll(/\(([^)]*)\)/g)) {
    match[1]
      .split(/[^0-9]+/)
      .filter(Boolean)
      .forEach(code => codes.add(String(Number(code))));
  }
  return Array.from(codes);
}

function getAllergenCategoryMatches(itemCodes: string[], selectedCategoryIds: string[]): string[] {
  return ALLERGEN_CATEGORIES
    .filter(category => selectedCategoryIds.includes(category.id))
    .filter(category => category.codes.some(code => itemCodes.includes(code)))
    .map(category => category.label);
}

function mergeMatches(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flat()));
}

function createMealAlert(mealType = '중식'): MealAlert {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    mealType,
    alertTime: DEFAULT_ALERT_TIMES[mealType] || '12:20',
    enabled: true,
  };
}

function normalizeSavedSchool(raw: SavedSchool): SavedSchool {
  const schoolType = raw.schoolType || '';
  const gradeOptions = getGradeOptions(schoolType);
  const grade = gradeOptions.includes(raw.grade) ? raw.grade : gradeOptions[0];
  const legacyAlerts = raw.alertTime && raw.mealType
    ? [{ id: 'legacy-meal-alert', mealType: raw.mealType, alertTime: raw.alertTime, enabled: !!raw.alertEnabled }]
    : [];

  return {
    ...raw,
    schoolType,
    grade,
    className: raw.className || '1',
    alerts: Array.isArray(raw.alerts) ? raw.alerts : legacyAlerts,
    allergyCodes: Array.isArray(raw.allergyCodes) ? raw.allergyCodes : [],
    dislikeCodes: Array.isArray(raw.dislikeCodes) ? raw.dislikeCodes : [],
    allergyKeywords: Array.isArray(raw.allergyKeywords) ? raw.allergyKeywords : [],
    dislikeKeywords: Array.isArray(raw.dislikeKeywords) ? raw.dislikeKeywords : [],
  };
}

export default function App() {
  const defaultMealTarget = getDefaultMealTarget();
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
  const [selectedDate, setSelectedDate] = useState<Date>(defaultMealTarget.date);
  const [selectedMealType, setSelectedMealType] = useState<string>(defaultMealTarget.mealType);
  const [theme, setTheme] = useState<Theme>(getTheme);
  const [extensionStatus, setExtensionStatus] = useState('');
  const alertTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const gradeOptions = saved ? getGradeOptions(saved.schoolType) : SECONDARY_GRADES;
  const extensionUrl = `${window.location.origin}/apps/school-meal/`;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = normalizeSavedSchool(JSON.parse(raw) as SavedSchool);
      setSaved(s);
      fetchMeals(s.orgCode, s.schoolCode, defaultMealTarget.date);
      fetchTimetable(s, defaultMealTarget.date);
      scheduleAlerts(s);
    }
    return () => clearAlertTimers();
  }, []);

  const saveSettings = (settings: SavedSchool) => {
    setSaved(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    scheduleAlerts(settings);
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

  const loadDate = (newDate: Date) => {
    setSelectedDate(newDate);
    if (saved) {
      fetchMeals(saved.orgCode, saved.schoolCode, newDate);
      fetchTimetable(saved, newDate);
    }
  };

  const handleDateChange = (delta: number) => {
    loadDate(addDays(selectedDate, delta));
  };

  const handleCalendarChange = (value: string) => {
    if (!value) return;
    loadDate(inputToDate(value));
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
      alerts: [],
      allergyCodes: [],
      dislikeCodes: [],
      allergyKeywords: [],
      dislikeKeywords: [],
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

  const handleKeywordSettingChange = (field: 'allergyKeywords' | 'dislikeKeywords', value: string) => {
    if (!saved) return;
    saveSettings({ ...saved, [field]: splitKeywords(value) });
  };

  const toggleAllergenSetting = (field: 'allergyCodes' | 'dislikeCodes', categoryId: string) => {
    if (!saved) return;
    const current = saved[field];
    const updatedCodes = current.includes(categoryId)
      ? current.filter(id => id !== categoryId)
      : [...current, categoryId];
    saveSettings({ ...saved, [field]: updatedCodes });
  };

  const requestNotification = async (): Promise<boolean> => {
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    return perm === 'granted';
  };

  const clearAlertTimers = () => {
    alertTimersRef.current.forEach(timer => clearTimeout(timer));
    alertTimersRef.current = [];
  };

  const scheduleAlerts = (settings: SavedSchool) => {
    clearAlertTimers();
    settings.alerts
      .filter(alert => alert.enabled)
      .forEach(alert => {
        const [h, m] = alert.alertTime.split(':').map(Number);
        const now = new Date();
        const target = new Date();
        target.setHours(h, m, 0, 0);
        const diff = target.getTime() - now.getTime();
        if (diff <= 0) return;

        const timer = setTimeout(() => {
          const meal = meals.find(meal => meal.mealType.includes(alert.mealType));
          const body = meal ? meal.menu.split('\n').slice(0, 3).join(', ') : '급식 정보를 확인하세요';
          new Notification(`🍱 ${alert.mealType} 알림`, { body, icon: '/favicon.svg', tag: `meal-alert-${alert.id}` });
        }, diff);
        alertTimersRef.current.push(timer);
      });
  };

  const addAlert = async () => {
    if (!saved) return;
    if (notifPermission !== 'granted' && !(await requestNotification())) return;
    const updated = { ...saved, alerts: [...saved.alerts, createMealAlert(selectedMealType)] };
    saveSettings(updated);
  };

  const updateAlert = (id: string, patch: Partial<MealAlert>) => {
    if (!saved) return;
    const updated = {
      ...saved,
      alerts: saved.alerts.map(alert => alert.id === id ? { ...alert, ...patch } : alert),
    };
    saveSettings(updated);
  };

  const toggleAlert = async (id: string) => {
    if (!saved) return;
    const alert = saved.alerts.find(alert => alert.id === id);
    if (!alert) return;
    if (!alert.enabled && notifPermission !== 'granted' && !(await requestNotification())) {
      return;
    }
    updateAlert(id, { enabled: !alert.enabled });
  };

  const removeAlert = (id: string) => {
    if (!saved) return;
    const updated = { ...saved, alerts: saved.alerts.filter(alert => alert.id !== id) };
    saveSettings(updated);
  };

  const openExtensionSetup = () => {
    setView('settings');
    setExtensionStatus('아래 서비스 주소를 복사해서 확장프로그램 옵션에 저장하세요.');
  };

  const copyExtensionUrl = async () => {
    try {
      await navigator.clipboard.writeText(extensionUrl);
      setExtensionStatus('서비스 주소를 복사했어요. 확장프로그램 옵션에 붙여넣으면 됩니다.');
    } catch {
      setExtensionStatus('복사에 실패했어요. 아래 주소를 직접 복사해주세요.');
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
            <>
              <button className="btn-ghost" onClick={openExtensionSetup}>확장</button>
              <button className="btn-ghost" onClick={() => setView(view === 'settings' ? 'main' : 'settings')}>
                ⚙️
              </button>
            </>
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
              {gradeOptions.map(grade => <option key={grade} value={grade}>{grade}학년</option>)}
            </select>
          </div>
          <div className="settings-row">
            <span>반</span>
            <select className="select-field" value={saved.className} onChange={e => handleClassSettingChange('className', e.target.value)}>
              {CLASS_NAMES.map(className => <option key={className} value={className}>{className}반</option>)}
            </select>
          </div>
          <div className="settings-section">
            <div className="settings-section-header">
              <span>확장프로그램 연결</span>
              <button className="btn-ghost" onClick={copyExtensionUrl}>주소 복사</button>
            </div>
            <div className="extension-setup">
              <p>Chrome 확장프로그램에서 이 주소를 저장하면 아이콘 클릭으로 급식표와 시간표를 바로 열 수 있어요.</p>
              <code>{extensionUrl}</code>
              <ol>
                <li><span>Chrome에서 확장프로그램 옵션을 엽니다.</span></li>
                <li><span>복사한 서비스 주소를 붙여넣고 저장합니다.</span></li>
                <li><span>확장 아이콘을 누르면 학교 알리미가 팝업으로 열립니다.</span></li>
              </ol>
              {extensionStatus && <p className="extension-status">{extensionStatus}</p>}
            </div>
          </div>
          <div className="settings-section">
            <div className="settings-section-header">
              <span>급식 알림</span>
              <button className="btn-ghost" onClick={addAlert}>+ 추가</button>
            </div>
            {saved.alerts.length === 0 ? (
              <p className="settings-empty">등록된 알림이 없어요.</p>
            ) : (
              <div className="alert-list">
                {saved.alerts.map(alert => (
                  <div key={alert.id} className="alert-row">
                    <select className="select-field" value={alert.mealType} onChange={e => updateAlert(alert.id, { mealType: e.target.value })}>
                      {MEAL_TYPES.map(type => <option key={type.value} value={type.value}>{type.value}</option>)}
                    </select>
                    <input
                      type="time"
                      className="time-input"
                      value={alert.alertTime}
                      onChange={e => updateAlert(alert.id, { alertTime: e.target.value })}
                    />
                    <button className={`toggle-btn ${alert.enabled ? 'on' : 'off'}`} onClick={() => toggleAlert(alert.id)}>
                      {alert.enabled ? 'ON' : 'OFF'}
                    </button>
                    <button className="btn-ghost danger" onClick={() => removeAlert(alert.id)}>삭제</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="settings-section">
            <div className="settings-section-header">
              <span>식재료 표시</span>
            </div>
            <div className="category-field">
              <span>알레르기 카테고리</span>
              <div className="category-grid">
                {ALLERGEN_CATEGORIES.map(category => (
                  <button
                    key={`allergy-${category.id}`}
                    className={`category-chip allergy ${saved.allergyCodes.includes(category.id) ? 'active' : ''}`}
                    onClick={() => toggleAllergenSetting('allergyCodes', category.id)}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
              <small>급식명 옆 숫자 코드와 맞으면 빨간색으로 표시됩니다.</small>
            </div>
            <div className="category-field">
              <span>싫어하는 카테고리</span>
              <div className="category-grid">
                {ALLERGEN_CATEGORIES.map(category => (
                  <button
                    key={`dislike-${category.id}`}
                    className={`category-chip dislike ${saved.dislikeCodes.includes(category.id) ? 'active' : ''}`}
                    onClick={() => toggleAllergenSetting('dislikeCodes', category.id)}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
              <small>급식명 옆 숫자 코드와 맞으면 주황색으로 표시됩니다.</small>
            </div>
            <label className="keyword-field">
              <span>직접 입력 - 알레르기</span>
              <textarea
                className="keyword-input"
                value={keywordsToText(saved.allergyKeywords)}
                onChange={e => handleKeywordSettingChange('allergyKeywords', e.target.value)}
                placeholder="예: 우유, 계란, 땅콩"
              />
              <small>포함된 메뉴는 빨간색으로 표시됩니다.</small>
            </label>
            <label className="keyword-field">
              <span>직접 입력 - 싫어함</span>
              <textarea
                className="keyword-input"
                value={keywordsToText(saved.dislikeKeywords)}
                onChange={e => handleKeywordSettingChange('dislikeKeywords', e.target.value)}
                placeholder="예: 오이, 버섯, 양파"
              />
              <small>포함된 메뉴는 주황색으로 표시됩니다.</small>
            </label>
          </div>
          {notifPermission === 'denied' && (
            <p className="settings-warn">브라우저에서 알림이 차단됐어요. 브라우저 설정에서 허용해주세요.</p>
          )}
          <button className="btn-ghost mt" onClick={() => setView('main')}>← 돌아가기</button>
        </div>
      )}

      {view === 'main' && (
        <main className="app-main">
          <div className="content-shell">
            <div className="date-nav">
              <button className="date-nav-btn" onClick={() => handleDateChange(-1)}>‹</button>
              <span className="date-label">{dateToDisplay(selectedDate)}</span>
              <label className="calendar-picker">
                <span>📅 날짜 선택</span>
                <strong>{dateToInput(selectedDate)}</strong>
                <input
                  type="date"
                  value={dateToInput(selectedDate)}
                  onChange={e => handleCalendarChange(e.target.value)}
                />
              </label>
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
                    {gradeOptions.map(grade => <option key={grade} value={grade}>{grade}학년</option>)}
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
                            {meal.menu.split('\n').filter(Boolean).map((item, j) => {
                              const trimmed = item.trim();
                              const itemCodes = extractAllergenCodes(trimmed);
                              const allergyMatches = mergeMatches(
                                getAllergenCategoryMatches(itemCodes, saved.allergyCodes),
                                getMenuMatch(trimmed, saved.allergyKeywords),
                              );
                              const dislikeMatches = mergeMatches(
                                getAllergenCategoryMatches(itemCodes, saved.dislikeCodes),
                                getMenuMatch(trimmed, saved.dislikeKeywords),
                              );
                              const matchClass = allergyMatches.length > 0 ? 'allergy' : dislikeMatches.length > 0 ? 'dislike' : '';
                              const matches = allergyMatches.length > 0 ? allergyMatches : dislikeMatches;

                              return (
                                <li key={j} className={`menu-item ${matchClass}`}>
                                  <span>{trimmed}</span>
                                  {matches.length > 0 && (
                                    <small>{allergyMatches.length > 0 ? '알레르기' : '싫어함'}: {matches.join(', ')}</small>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ));
                    })()}

                    <div className={`alert-status ${saved.alerts.some(alert => alert.enabled) ? 'on' : ''}`}>
                      <span>
                        {saved.alerts.some(alert => alert.enabled)
                          ? `🔔 ${saved.alerts.filter(alert => alert.enabled).map(alert => `${alert.mealType} ${alert.alertTime}`).join(' · ')} 알림 설정됨`
                          : '🔔 등록된 급식 알림이 없어요.'}
                      </span>
                      <button className="alert-add-btn" onClick={addAlert}>+ 알림 추가</button>
                    </div>
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
          </div>
        </main>
      )}
    </div>
  );
}
