import { useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import "./App.css";

const appWindow = getCurrentWindow();

function App() {
  const dragTimer = useRef<number | null>(null);

  const startDrag = () => {
    dragTimer.current = window.setTimeout(() => {
      void appWindow.startDragging();
    }, 180);
  };

  const cancelDrag = () => {
    if (dragTimer.current !== null) {
      window.clearTimeout(dragTimer.current);
      dragTimer.current = null;
    }
  };

  const openPlayground = async () => {
    cancelDrag();

    try {
      const existing = await WebviewWindow.getByLabel("main");

      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }

      const mainWindow = new WebviewWindow("main", {
        title: "Playground",
        url: "http://localhost:5174",
        width: 1200,
        height: 760,
        minWidth: 900,
        minHeight: 600,
        center: true,
        resizable: true,
        decorations: true,
      });

      mainWindow.once("tauri://created", () => {
        console.log("Playground opened");
      });

      mainWindow.once("tauri://error", (event) => {
        console.error("Failed to open Playground", event);
      });
    } catch (error) {
      console.error("Failed to open Playground", error);
    }
  };

  return (
    <main className="pet-window">
      <div
        className="pet"
        onMouseDown={(event) => {
          if (event.button === 0) {
            startDrag();
          }
        }}
        onMouseUp={cancelDrag}
        onDoubleClick={() => {
          void openPlayground();
        }}
      >
        ( •‿• )
      </div>
    </main>
  );
}

export default App;