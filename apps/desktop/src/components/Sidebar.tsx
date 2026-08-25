export type LunaPage =
  | "home"
  | "focus"
  | "tasks"
  | "activity"
  | "tools"
  | "characters"
  | "character-create"
  | "character-setup"
  | "inventory"
  | "shop"
  | "settings";

type SidebarProps = {
  currentPage: LunaPage;
  onChangePage: (page: LunaPage) => void;
};

type NavIconName = "home" | "command" | "character" | "add" | "settings";

type NavItem = {
  label: string;
  icon: NavIconName;
  page: LunaPage;
};

const navigation: NavItem[] = [
  { label: "홈", icon: "home", page: "home" },
  { label: "명령", icon: "command", page: "tools" },
  { label: "캐릭터", icon: "character", page: "characters" },
  { label: "캐릭터 추가하기", icon: "add", page: "character-create" },
];

function NavIcon({ name }: { name: NavIconName }) {
  if (name === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 19.5z" />
      </svg>
    );
  }

  if (name === "command") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10M8 4v6M16 14v6" />
      </svg>
    );
  }

  if (name === "character") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 20c.7-4.2 3.1-6.3 7-6.3s6.3 2.1 7 6.3" />
      </svg>
    );
  }

  if (name === "add") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v16M4 12h16" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.5 1A8 8 0 0 0 14.3 5L14 2h-4l-.3 3a8 8 0 0 0-2.1 1.8l-2.5-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.5-1A8 8 0 0 0 9.7 19l.3 3h4l.3-3a8 8 0 0 0 2.1-1.8l2.5 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" />
    </svg>
  );
}

function isNavigationItemActive(currentPage: LunaPage, itemPage: LunaPage) {
  if (currentPage === itemPage) {
    return true;
  }

  return itemPage === "character-create" && currentPage === "character-setup";
}

export function Sidebar({ currentPage, onChangePage }: SidebarProps) {
  return (
    <aside className="sidebar luna-navigation">
      <div className="sidebar-brand luna-navigation-brand">
        <div className="luna-navigation-avatar" aria-hidden="true">
          <span className="luna-navigation-avatar-hair" />
          <span className="luna-navigation-avatar-face">⌣</span>
        </div>

        <div className="luna-navigation-brand-copy">
          <strong>Luna</strong>
          <span>데스크톱 펫</span>
        </div>
      </div>

      <nav className="luna-navigation-menu" aria-label="Luna 메뉴">
        {navigation.map((item) => (
          <button
            key={item.page}
            className={`sidebar-item luna-navigation-item ${
              isNavigationItemActive(currentPage, item.page) ? "active" : ""
            }`}
            onClick={() => onChangePage(item.page)}
            type="button"
          >
            <span className="sidebar-item-icon luna-navigation-icon">
              <NavIcon name={item.icon} />
            </span>
            <span className="luna-navigation-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <button
        className={`sidebar-item sidebar-settings luna-navigation-item ${
          currentPage === "settings" ? "active" : ""
        }`}
        onClick={() => onChangePage("settings")}
        type="button"
      >
        <span className="sidebar-item-icon luna-navigation-icon">
          <NavIcon name="settings" />
        </span>
        <span className="luna-navigation-label">설정</span>
      </button>
    </aside>
  );
}
