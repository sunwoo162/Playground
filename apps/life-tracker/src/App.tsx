import { useState } from 'react';
import type { TabType } from './types';
import { TabNav } from './components/TabNav';
import { FailureLog } from './components/FailureLog';
import { WastedTime } from './components/WastedTime';
import { SmallWins } from './components/SmallWins';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('failures');

  return (
    <div className="app">
      <header className="app-header">
        <h1>Life Tracker</h1>
        <p className="app-subtitle">성공이 아닌, 진짜 나를 기록하는 곳</p>
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
