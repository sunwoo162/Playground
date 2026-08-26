import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";

import App from "./App";
import { bootstrapDurableOrchestrationHistory } from "./projectTeams/orchestrationHistory";
import { reconcileInterruptedAgentTasksAtStartup } from "./projectTeams/sessionReconciliation";

async function startLuna() {
  try {
    await bootstrapDurableOrchestrationHistory();
  } catch (error) {
    console.warn("Luna durable orchestration bootstrap failed", error);
  }

  try {
    if (getCurrentWindow().label !== "pet") {
      const summary = await reconcileInterruptedAgentTasksAtStartup();
      if (summary.attempted > 0) {
        console.info("Luna interrupted Agent reconciliation", summary);
      }
    }
  } catch (error) {
    console.warn("Luna interrupted Agent reconciliation failed", error);
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void startLuna();
