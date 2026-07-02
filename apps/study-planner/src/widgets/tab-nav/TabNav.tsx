import type { TabType } from '../../shared/model/types';

interface Tab {
  key: TabType;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { key: 'timer', label: '타이머', icon: '⏱️' },
  { key: 'stats', label: '통계', icon: '📊' },
  { key: 'calendar', label: '달력', icon: '📅' },
  { key: 'subjects', label: '과목', icon: '📚' },
];

interface Props {
  activeTab: TabType;
  running: boolean;
  onTabChange: (tab: TabType) => void;
}

export function TabNav({ activeTab, running, onTabChange }: Props) {
  return (
    <nav className="tab-nav">
      {TABS.map(tab => (
        <button
          key={tab.key}
          className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
          {tab.key === 'timer' && running && <span className="tab-running-dot" />}
        </button>
      ))}
    </nav>
  );
}
