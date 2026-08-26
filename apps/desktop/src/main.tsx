import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { bootstrapDurableOrchestrationHistory } from "./projectTeams/orchestrationHistory";

async function startLuna() {
  try {
    await bootstrapDurableOrchestrationHistory();
  } catch (error) {
    console.warn("Luna durable orchestration bootstrap failed", error);
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void startLuna();
