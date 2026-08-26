import { useEffect, useState } from "react";

import { Sidebar, type LunaPage } from "../components/Sidebar";
import { HomePage } from "../pages/HomePage";
import { FocusPage } from "../pages/FocusPage";
import { TasksPage } from "../pages/TasksPage";
import { ActivityPage } from "../pages/ActivityPage";
import { ToolsPage } from "../pages/ToolsPage";
import { CharacterPage } from "../pages/CharacterPage";
import { CharacterCustomizePage } from "../pages/CharacterCustomizePage";
import { MarketDiscoveryPage } from "../pages/MarketDiscoveryPage";
import { E2ESmokePage } from "../pages/E2ESmokePage";
import { ProjectTeamsPage } from "../pages/ProjectTeamsPage";
import { InventoryPage } from "../pages/InventoryPage";
import { ShopPage } from "../pages/ShopPage";
import { SettingsPage } from "../pages/SettingsPage";
import {
  restoreProjectTeamsStateFromDurableFile,
  startProjectTeamsDurableMirror,
} from "../projectTeams/durableState";

export function MainWindow() {
  const [currentPage, setCurrentPage] = useState<LunaPage>("character");

  useEffect(() => {
    let disposed = false;
    let stopMirror = () => undefined;

    const initializeDurableState = async () => {
      try {
        const restored = await restoreProjectTeamsStateFromDurableFile();
        if (disposed) return;
        if (restored) {
          window.location.reload();
          return;
        }

        stopMirror = startProjectTeamsDurableMirror((error) => {
          console.warn("Luna durable project state mirror 실패", error);
        });
      } catch (error) {
        console.warn("Luna durable project state 초기화 실패", error);
      }
    };

    void initializeDurableState();

    return () => {
      disposed = true;
      stopMirror();
    };
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case "character":
        return (
          <CharacterPage
            onAddCharacter={() => setCurrentPage("character-customize")}
          />
        );
      case "character-customize":
        return (
          <CharacterCustomizePage
            onBack={() => setCurrentPage("character")}
          />
        );
      case "focus":
        return <FocusPage />;
      case "tasks":
        return <TasksPage />;
      case "activity":
        return <ActivityPage />;
      case "tools":
        return <ToolsPage onChangePage={setCurrentPage} />;
      case "market-discovery":
        return <MarketDiscoveryPage onChangePage={setCurrentPage} />;
      case "e2e-smoke":
        return <E2ESmokePage onChangePage={setCurrentPage} />;
      case "project-teams":
        return <ProjectTeamsPage />;
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
