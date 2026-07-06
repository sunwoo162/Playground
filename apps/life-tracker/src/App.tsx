import { useEffect, useState } from 'react';
import type { TabType } from './types';
import { TabNav } from './components/TabNav';
import { FailureLog } from './components/FailureLog';
import { WastedTime } from './components/WastedTime';
import { SmallWins } from './components/SmallWins';
import { StudyTimerBadge } from './components/StudyTimerBadge';
import { useAuth } from './hooks/useAuth';
import './App.css';

type Theme = 'dark' | 'light';
const THEME_KEY = 'playground-theme';
const getTheme = (): Theme => localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';

function App() {
  const authed = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('failures');
  const [theme, setTheme] = useState<Theme>(getTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  if (!authed) return null;

  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="back-to-home">← 놀이터</a>
        <div className="app-header-content">
          <h1>Life Tracker</h1>
          <p className="app-subtitle">성공이 아닌, 진짜 나를 기록하는 곳</p>
        </div>
        <StudyTimerBadge />
        <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="테마 전환">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>

      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="app-main">
        {activeTab === 'failures' && <FailureLog />}
        {activeTab === 'wasted-time' && <WastedTime />}
        {activeTab === 'small-wins' && <SmallWins />}
      </main>
    </div>
  );
}

export default App;
