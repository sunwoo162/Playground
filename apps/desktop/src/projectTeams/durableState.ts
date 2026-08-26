import { invoke } from "@tauri-apps/api/core";

const STORAGE_KEY = "luna.project-teams.v1";
const SYNC_INTERVAL_MS = 750;

async function loadDurableStateFile() {
  return invoke<string | null>("load_project_teams_state_file");
}

async function saveDurableStateFile(stateJson: string) {
  await invoke("save_project_teams_state_file", { stateJson });
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export async function restoreProjectTeamsStateFromDurableFile() {
  if (!canUseStorage()) return false;
  if (window.localStorage.getItem(STORAGE_KEY)) return false;

  const durableState = await loadDurableStateFile();
  if (!durableState) return false;

  try {
    const parsed = JSON.parse(durableState) as { schemaVersion?: number };
    if (parsed.schemaVersion !== 1) return false;
  } catch {
    return false;
  }

  window.localStorage.setItem(STORAGE_KEY, durableState);
  return true;
}

export function startProjectTeamsDurableMirror(
  onError?: (error: unknown) => void,
) {
  if (!canUseStorage()) {
    return () => undefined;
  }

  let disposed = false;
  let lastSnapshot: string | null = null;
  let writing = false;
  let pendingSnapshot: string | null = null;

  const flush = async (snapshot: string) => {
    if (writing) {
      pendingSnapshot = snapshot;
      return;
    }

    writing = true;
    try {
      await saveDurableStateFile(snapshot);
      lastSnapshot = snapshot;
    } catch (error) {
      onError?.(error);
    } finally {
      writing = false;
      const pending = pendingSnapshot;
      pendingSnapshot = null;
      if (!disposed && pending && pending !== lastSnapshot) {
        void flush(pending);
      }
    }
  };

  const sync = () => {
    const snapshot = window.localStorage.getItem(STORAGE_KEY);
    if (!snapshot || snapshot === lastSnapshot) return;
    void flush(snapshot);
  };

  sync();
  const timer = window.setInterval(sync, SYNC_INTERVAL_MS);

  return () => {
    disposed = true;
    window.clearInterval(timer);
  };
}
