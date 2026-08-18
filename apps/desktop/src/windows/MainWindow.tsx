import { useState } from "react";

import { Sidebar, type LunaPage } from "../components/Sidebar";
import { HomePage } from "../pages/HomePage";
import { FocusPage } from "../pages/FocusPage";
import { TasksPage } from "../pages/TasksPage";
import { ActivityPage } from "../pages/ActivityPage";
import { ToolsPage } from "../pages/ToolsPage";
import { InventoryPage } from "../pages/InventoryPage";
import { ShopPage } from "../pages/ShopPage";
import { SettingsPage } from "../pages/SettingsPage";

export function MainWindow() {
  const [currentPage, setCurrentPage] = useState<LunaPage>("home");

  const renderPage = () => {
    switch (currentPage) {
      case "focus":
        return <FocusPage />;
      case "tasks":
        return <TasksPage />;
      case "activity":
        return <ActivityPage />;
      case "tools":
        return <ToolsPage />;
      case "inventory":
        return <InventoryPage />;
      case "shop":
        return <ShopPage />;
      case "settings":
        return <SettingsPage />;
      case "home":
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="luna-shell">
      <Sidebar
        currentPage={currentPage}
        onChangePage={setCurrentPage}
      />

      <section className="luna-main">
        {renderPage()}
      </section>
    </div>
  );
}