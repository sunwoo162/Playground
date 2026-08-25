import { getCurrentWindow } from "@tauri-apps/api/window";

import { PetWindow } from "./windows/PetWindow";
import { MainWindow } from "./windows/MainWindow";

import "./App.css";
import "./Character.css";
import "./CharacterSetup.css";

function App() {
  const label = getCurrentWindow().label;

  if (label === "pet") {
    return <PetWindow />;
  }

  return <MainWindow />;
}

export default App;
