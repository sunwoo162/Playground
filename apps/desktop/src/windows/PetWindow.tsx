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
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    center: true,
    resizable: true,
    decorations: true,
  });
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
          void openLuna();
        }}
      >
        ( •‿• )
      </div>
    </main>
  );
}