import type { LunaPage } from "../components/Sidebar";

type ToolsPageProps = {
  onChangePage: (page: LunaPage) => void;
};

export function ToolsPage({ onChangePage }: ToolsPageProps) {
  return (
    <div className="tools-page">
      <header className="tools-header">
        <span className="home-eyebrow">TOOLS</span>
        <h1>Tools</h1>
        <p>Choose a tool to get started.</p>
      </header>

      <div className="tools-grid">
        <button
          className="tool-card"
          onClick={() => onChangePage("focus")}
        >
          <span className="tool-card-icon">◷</span>
          <div>
            <strong>Focus</strong>
            <span>Stay focused with a timer.</span>
          </div>
        </button>

        <button
          className="tool-card"
          onClick={() => onChangePage("tasks")}
        >
          <span className="tool-card-icon">✓</span>
          <div>
            <strong>Tasks</strong>
            <span>Manage what you need to do.</span>
          </div>
        </button>

        <button
          className="tool-card"
          onClick={() => onChangePage("market-discovery")}
        >
          <span className="tool-card-icon">MD</span>
          <div>
            <strong>Market Discovery</strong>
            <span>시장 근거를 조사하고 실제 프로젝트 후보를 발굴합니다.</span>
          </div>
        </button>

        <button
          className="tool-card"
          onClick={() => onChangePage("project-teams")}
        >
          <span className="tool-card-icon">PT</span>
          <div>
            <strong>Project Teams</strong>
            <span>프로젝트 팀과 Agent 실행 상태를 관리합니다.</span>
          </div>
        </button>
      </div>
    </div>
  );
}
