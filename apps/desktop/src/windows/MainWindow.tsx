import { useState } from "react";

import { Sidebar, type LunaPage } from "../components/Sidebar";
import { HomePage } from "../pages/HomePage";
import { FocusPage } from "../pages/FocusPage";
import { TasksPage } from "../pages/TasksPage";
import { ActivityPage } from "../pages/ActivityPage";
import { ToolsPage } from "../pages/ToolsPage";
import { CharacterPage } from "../pages/CharacterPage";
import {
  CharacterCreatePage,
  type CharacterDraft,
} from "../pages/CharacterCreatePage";
import { CharacterSetupPage } from "../pages/CharacterSetupPage";
import { InventoryPage } from "../pages/InventoryPage";
import { ShopPage } from "../pages/ShopPage";
import { SettingsPage } from "../pages/SettingsPage";

export function MainWindow() {
  const [currentPage, setCurrentPage] = useState<LunaPage>("home");
  const [characterDraft, setCharacterDraft] = useState<CharacterDraft | null>(null);

  const openCharacterCreate = () => setCurrentPage("character-create");
  const openCharacterSetup = () => {
    setCurrentPage(characterDraft ? "character-setup" : "character-create");
  };

  const renderPage = () => {
    switch (currentPage) {
      case "focus":
        return <FocusPage />;
      case "tasks":
        return <TasksPage />;
      case "activity":
        return <ActivityPage />;
      case "tools":
        return <ToolsPage onChangePage={setCurrentPage} />;
      case "characters":
        return (
          <CharacterPage
            draft={characterDraft}
            onAddCharacter={openCharacterCreate}
            onEditCharacter={openCharacterSetup}
          />
        );
      case "character-create":
        return (
          <CharacterCreatePage
            initialDraft={characterDraft}
            onCancel={() => setCurrentPage("characters")}
            onNext={(draft) => {
              setCharacterDraft(draft);
              setCurrentPage("character-setup");
            }}
          />
        );
      case "character-setup":
        if (!characterDraft) {
          return (
            <CharacterPage
              draft={null}
              onAddCharacter={openCharacterCreate}
              onEditCharacter={openCharacterCreate}
            />
          );
        }

        return (
          <CharacterSetupPage
            initialDraft={characterDraft}
            onBack={() => setCurrentPage("character-create")}
            onComplete={(draft) => {
              setCharacterDraft(draft);
              setCurrentPage("characters");
            }}
          />
        );
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
