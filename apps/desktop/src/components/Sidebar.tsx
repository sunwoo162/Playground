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
      { label: "Home", page: "home" as LunaPage },
      { label: "Focus", page: "focus" as LunaPage },
      { label: "Tasks", page: "tasks" as LunaPage },
      { label: "Activity", page: "activity" as LunaPage },
    ],
  },
  {
    title: "Playground",
    items: [
      { label: "Tools", page: "tools" as LunaPage },
    ],
  },
  {
    title: "Luna",
    items: [
      { label: "Inventory", page: "inventory" as LunaPage },
      { label: "Shop", page: "shop" as LunaPage },
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
        <span className="sidebar-brand-mark">☾</span>
        <strong>Luna</strong>
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
                {item.label}
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
        Settings
      </button>
    </aside>
  );
}