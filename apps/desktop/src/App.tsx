import { getCurrentWindow } from "@tauri-apps/api/window";

import { MainWindow } from "./windows/MainWindow";
import { PetWindow } from "./windows/PetWindow";
import "./App.css";

function App() {
  return getCurrentWindow().label === "pet" ? <PetWindow /> : <MainWindow />;
}

export default App;
