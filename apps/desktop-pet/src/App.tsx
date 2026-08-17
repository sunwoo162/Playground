import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

const appWindow = getCurrentWindow();

function App() {
  const handleMouseDown = async (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (event.button !== 0) return;

    await appWindow.startDragging();
  };

  return (
    <main className="pet-window">
      <div
        className="pet"
        onMouseDown={(event) => {
          void handleMouseDown(event);
        }}
      >
        ( •‿• )
      </div>
    </main>
  );
}

export default App;