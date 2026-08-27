import { useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const appWindow = getCurrentWindow();

export function PetWindow() {
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

  const openLuna = async () => {
    cancelDrag();
    const existing = await WebviewWindow.getByLabel("main");

    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }

    new WebviewWindow("main", {
      title: "Luna",
      url: "/",
      width: 720,
      height: 520,
      minWidth: 560,
      minHeight: 420,
      center: true,
      resizable: true,
      decorations: true,
    });
  };

  return (
    <main className="pet-window">
      <button
        className="pet"
        type="button"
        aria-label="Luna desktop pet"
        onMouseDown={(event) => {
          if (event.button === 0) startDrag();
        }}
        onMouseUp={cancelDrag}
        onMouseLeave={cancelDrag}
        onDoubleClick={() => {
          void openLuna();
        }}
      >
        ( •‿• )
      </button>
    </main>
  );
}
