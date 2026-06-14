import { useState, useCallback } from 'react';
import type { TabType } from './types';
import { getSubjects, getSessions, getTotalMinutesByDate, getDailyGoal } from './storage';
import { getTodayStr } from './utils';
import { Timer } from './tabs/Timer';
import { Stats } from './tabs/Stats';
import { CalendarView } from './tabs/CalendarView';
import { Subjects } from './tabs/Subjects';
import './App.css';

const TABS: { key: TabType; label: string; icon: string }[] = [
  { key: 'timer', label: '타이머', icon: '⏱️' },
  { key: 'stats', label: '통계', icon: '📊' },
  { key: 'calendar', label: '달력', icon: '📅' },
  { key: 'subjects', label: '과목', icon: '📚' },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('timer');
  const [subjects, setSubjects] = useState(getSubjects);
  const [sessions, setSessions] = useState(getSessions);
  const [_refresh, setRefresh] = useState(0);

  const handleRefresh = useCallback(() => {
    setSessions(getSessions());
    setRefresh(r => r + 1);
  }, []);

  const todayTotal = getTotalMinutesByDate(getTodayStr(), sessions);
  const dailyGoal = getDailyGoal();

  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="back-link">← 놀이터</a>
        <div>
          <h1 className="app-title">📅 스터디 플래너</h1>
          <p className="app-subtitle">공부 시간을 기록하고 성장을 추적하세요</p>
        </div>
      </header>

      <nav className="tab-nav">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className="app-main">
        {activeTab === 'timer' && (
          <Timer
            subjects={subjects}
            onSessionAdded={handleRefresh}
            todayTotal={todayTotal}
            dailyGoalMinutes={dailyGoal.totalMinutes}
          />
        )}
        {activeTab === 'stats' && (
          <Stats
            subjects={subjects}
            sessions={sessions}
            onSessionDeleted={handleRefresh}
          />
        )}
        {activeTab === 'calendar' && (
          <CalendarView
            subjects={subjects}
            sessions={sessions}
            dailyGoalMinutes={dailyGoal.totalMinutes}
          />
        )}
        {activeTab === 'subjects' && (
          <Subjects
            subjects={subjects}
            onSubjectsChange={setSubjects}
          />
        )}
      </main>
    </div>
  );
}

export default App;
