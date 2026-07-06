import { useState, useEffect } from 'react';
import type { Project } from './types';
import { getProjectsAsync } from './storage';
import { ProjectList } from './pages/ProjectList';
import { ProjectDetail } from './pages/ProjectDetail';
import { StudyTimerBadge } from './components/StudyTimerBadge';
import { useAuth } from './hooks/useAuth';
import './App.css';

type Theme = 'dark' | 'light';
const THEME_KEY = 'playground-theme';
const getTheme = (): Theme => localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return <button className="theme-toggle" onClick={onToggle} aria-label="테마 전환">{theme === 'dark' ? '☀️' : '🌙'}</button>;
}

function App() {
  const authed = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>(getTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!authed) return;
    getProjectsAsync().then((data) => {
      setProjects(data);
      setLoading(false);
    });
  }, [authed]);

  const handleUpdate = (updated: Project) => {
    setProjects((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    setSelected(updated);
  };

  if (authed === null || loading) {
    return (
      <div className="app-shell">
        <header className="app-shell-header">
          <a href="/" className="back-to-home">← 놀이터</a>
          <div className="app-shell-title-block">
            <h1 className="app-shell-title">📒 개발자 노트</h1>
            <p className="app-shell-subtitle">프로젝트별 기능명세서, API 명세서, 사용자 분석</p>
          </div>
          <StudyTimerBadge />
          <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
        </header>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#888' }}>
          불러오는 중...
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="app-shell">
        <header className="app-shell-header">
          <a href="/" className="back-to-home">← 놀이터</a>
          <div className="app-shell-title-block">
            <h1 className="app-shell-title">📒 개발자 노트</h1>
          </div>
          <StudyTimerBadge />
          <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
        </header>
        <div className="app-shell-body">
          <ProjectDetail
            project={selected}
            onBack={() => setSelected(null)}
            onUpdate={handleUpdate}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-shell-header">
        <a href="/" className="back-to-home">← 놀이터</a>
        <div className="app-shell-title-block">
          <h1 className="app-shell-title">📒 개발자 노트</h1>
          <p className="app-shell-subtitle">프로젝트별 기능명세서, API 명세서, 사용자 분석</p>
        </div>
        <StudyTimerBadge />
        <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
      </header>
      <div className="app-shell-body">
        <ProjectList
          projects={projects}
          onProjectsChange={setProjects}
          onSelect={setSelected}
        />
      </div>
    </div>
  );
}

export default App;
