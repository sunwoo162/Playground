export type LunaPage =
  | "home"
  | "focus"
  | "tasks"
  | "activity"
  | "tools"
  | "inventory"
  | "shop"
  | "settings";

type SidebarProps = {
  currentPage: LunaPage;
  onChangePage: (page: LunaPage) => void;
};

const groups = [
  {
    title: "Daily",
    items: [
      { label: "Home", icon: "⌂", page: "home" as LunaPage },
      { label: "Focus", icon: "◷", page: "focus" as LunaPage },
      { label: "Tasks", icon: "✓", page: "tasks" as LunaPage },
      { label: "Activity", icon: "◫", page: "activity" as LunaPage },
    ],
  },
  {
    title: "Playground",
    items: [
      { label: "Tools", icon: "⌘", page: "tools" as LunaPage },
    ],
  },
  {
    title: "Luna",
    items: [
      { label: "Inventory", icon: "◇", page: "inventory" as LunaPage },
      { label: "Shop", icon: "✦", page: "shop" as LunaPage },
    ],
  },
];

export function Sidebar({
  currentPage,
  onChangePage,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">☾</div>

        <div>
          <strong>Luna</strong>
          <span className="sidebar-brand-status">Awake</span>
        </div>
      </div>

      <div className="sidebar-groups">
        {groups.map((group) => (
          <div className="sidebar-group" key={group.title}>
            <span className="sidebar-group-title">
              {group.title}
            </span>

            {group.items.map((item) => (
              <button
                key={item.page}
                className={`sidebar-item ${
                  currentPage === item.page ? "active" : ""
                }`}
                onClick={() => onChangePage(item.page)}
              >
                <span className="sidebar-item-icon">
                  {item.icon}
                </span>

                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <button
        className={`sidebar-item sidebar-settings ${
          currentPage === "settings" ? "active" : ""
        }`}
        onClick={() => onChangePage("settings")}
      >
        <span className="sidebar-item-icon">⚙</span>
        <span>Settings</span>
      </button>
    </aside>
  );
}