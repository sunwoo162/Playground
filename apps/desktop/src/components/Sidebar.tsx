export type LunaPage =
  | "home"
  | "focus"
  | "tasks"
  | "activity"
  | "tools"
  | "character"
  | "character-customize"
  | "project-teams"
  | "market-discovery"
  | "e2e-smoke"
  | "inventory"
  | "shop"
  | "settings";

type SidebarProps = {
  currentPage: LunaPage;
  onChangePage: (page: LunaPage) => void;
};

const primaryItems = [
  { label: "캐릭터", icon: "◇", page: "character" as LunaPage },
  { label: "에이전트", icon: "✦", page: "project-teams" as LunaPage },
];

export function Sidebar({
  currentPage,
  onChangePage,
}: SidebarProps) {
  const activePage =
    currentPage === "character-customize" ? "character" : currentPage;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">☾</div>

        <div>
          <strong>Luna</strong>
          <span className="sidebar-brand-status">Character + Agents</span>
        </div>
      </div>

      <div className="sidebar-groups">
        <div className="sidebar-group">
          <span className="sidebar-group-title">Luna</span>

          {primaryItems.map((item) => (
            <button
              key={item.page}
              className={`sidebar-item ${
                activePage === item.page ? "active" : ""
              }`}
              onClick={() => onChangePage(item.page)}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
