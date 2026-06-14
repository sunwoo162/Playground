import type { TabType } from '../types';

interface TabNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs: { key: TabType; label: string; icon: string }[] = [
  { key: 'failures', label: '실패 기록', icon: '🔴' },
  { key: 'wasted-time', label: '버린 시간', icon: '⏰' },
  { key: 'small-wins', label: '작은 성취', icon: '✅' },
];

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <nav className="tab-nav">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => onTabChange(tab.key)}
          aria-selected={activeTab === tab.key}
          role="tab"
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
