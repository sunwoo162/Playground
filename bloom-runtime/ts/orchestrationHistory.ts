import { invoke } from "@tauri-apps/api/core";

import {
  getProjectExecutionControlsSnapshot,
  hasStoredProjectExecutionControls,
  restoreProjectExecutionControlsSnapshot,
} from "./executionControl";
import {
  isDurableOrchestrationSnapshot,
  shouldRestoreDurableProjectState,
} from "./orchestrationHistoryPolicy";
import type { ProjectTeamsState } from "./types";

const PROJECT_TEAMS_STORAGE_KEY = "luna.project-teams.v1";
const EXECUTION_CONTROL_STORAGE_KEY = "luna.project-execution-control.v1";
const WATCHED_STORAGE_KEYS = new Set([
  PROJECT_TEAMS_STORAGE_KEY,
  EXECUTION_CONTROL_STORAGE_KEY,
]);

export type DurableOrchestrationSnapshot = {
  schemaVersion: 1;
  projectTeamsState: ProjectTeamsState;
  executionControls: ReturnType<typeof getProjectExecutionControlsSnapshot>;
};

export type OrchestrationSnapshotEnvelope = {
  schemaVersion: 1;
  recordedAt: string;
  reason: string;
  snapshot: DurableOrchestrationSnapshot;
};

export type PersistOrchestrationSnapshotResult = {
  snapshotPath: string;
  historyPath: string;
  historyBytes: number;
};

export type DurableOrchestrationBootstrapResult = {
  mode: "browser" | "tauri";
  restoredProjectState: boolean;
  restoredExecutionControls: boolean;
  recordedAt: string | null;
};

let persistQueue: Promise<unknown> = Promise.resolve();
let storageSyncInstalled = false;
let pendingStorageSync = false;

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function readProjectTeamsStateFromLocalStorage(): ProjectTeamsState | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return null;
  const stored = window.localStorage.getItem(PROJECT_TEAMS_STORAGE_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as ProjectTeamsState;
    if (parsed.schemaVersion !== 1) return null;
    if (!Array.isArray(parsed.teams) || !Array.isArray(parsed.projects)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createDurableOrchestrationSnapshot(
  state: ProjectTeamsState,
): DurableOrchestrationSnapshot {
  return {
    schemaVersion: 1,
    projectTeamsState: state,
    executionControls: getProjectExecutionControlsSnapshot(),
  };
}

function createDurableSnapshotFromLocalCache() {
  const state = readProjectTeamsStateFromLocalStorage();
  return state ? createDurableOrchestrationSnapshot(state) : null;
}

export function restoreDurableSnapshotToLocalCache(snapshot: unknown) {
  if (!isDurableOrchestrationSnapshot(snapshot)) return false;
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return false;

  window.localStorage.setItem(
    PROJECT_TEAMS_STORAGE_KEY,
    JSON.stringify(snapshot.projectTeamsState),
  );
  restoreProjectExecutionControlsSnapshot(snapshot.executionControls);
  return true;
}

export function restoreDurableExecutionControlsIfMissing(snapshot: unknown) {
  if (!isDurableOrchestrationSnapshot(snapshot)) return false;
  if (hasStoredProjectExecutionControls()) return false;
  restoreProjectExecutionControlsSnapshot(snapshot.executionControls);
  return true;
}

export async function loadDurableOrchestrationSnapshot() {
  if (!isTauriRuntime()) return null;
  const envelope = await invoke<OrchestrationSnapshotEnvelope | null>(
    "load_orchestration_snapshot",
  );
  if (!envelope || envelope.schemaVersion !== 1) return null;
  if (!isDurableOrchestrationSnapshot(envelope.snapshot)) return null;
  return envelope;
}

function enqueuePersist(
  snapshot: DurableOrchestrationSnapshot,
  reason: string,
) {
  const recordedAt = new Date().toISOString();
  const job = persistQueue
    .catch(() => undefined)
    .then(() =>
      invoke<PersistOrchestrationSnapshotResult>("persist_orchestration_snapshot", {
        snapshot,
        recordedAt,
        reason,
      }),
    );
  persistQueue = job.then(() => undefined, () => undefined);
  return job;
}

export function persistDurableOrchestrationSnapshot(
  state: ProjectTeamsState,
  reason = "project-teams-state-sync",
) {
  if (!isTauriRuntime()) {
    return Promise.resolve<PersistOrchestrationSnapshotResult | null>(null);
  }
  return enqueuePersist(createDurableOrchestrationSnapshot(state), reason);
}

export function persistDurableOrchestrationCache(
  reason = "local-cache-sync",
) {
  if (!isTauriRuntime()) {
    return Promise.resolve<PersistOrchestrationSnapshotResult | null>(null);
  }
  const snapshot = createDurableSnapshotFromLocalCache();
  if (!snapshot) {
    return Promise.resolve<PersistOrchestrationSnapshotResult | null>(null);
  }
  return enqueuePersist(snapshot, reason);
}

function scheduleStorageSync() {
  if (pendingStorageSync) return;
  pendingStorageSync = true;
  queueMicrotask(() => {
    pendingStorageSync = false;
    void persistDurableOrchestrationCache("local-storage-change").catch((error) => {
      console.warn("Luna durable orchestration sync failed", error);
    });
  });
}

function installDurableStorageSync() {
  if (!isTauriRuntime() || storageSyncInstalled || typeof Storage === "undefined") return;
  storageSyncInstalled = true;

  const nativeSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function setItem(key: string, value: string) {
    nativeSetItem.call(this, key, value);
    if (this === window.localStorage && WATCHED_STORAGE_KEYS.has(key)) {
      scheduleStorageSync();
    }
  };
}

export async function bootstrapDurableOrchestrationHistory(): Promise<DurableOrchestrationBootstrapResult> {
  if (!isTauriRuntime()) {
    return {
      mode: "browser",
      restoredProjectState: false,
      restoredExecutionControls: false,
      recordedAt: null,
    };
  }

  let restoredProjectState = false;
  let restoredExecutionControls = false;
  let recordedAt: string | null = null;
  const durable = await loadDurableOrchestrationSnapshot();
  const localState = readProjectTeamsStateFromLocalStorage();

  if (durable) {
    recordedAt = durable.recordedAt;
    if (shouldRestoreDurableProjectState(localState, durable.snapshot)) {
      restoredProjectState = restoreDurableSnapshotToLocalCache(durable.snapshot);
      restoredExecutionControls = restoredProjectState;
    } else {
      restoredExecutionControls = restoreDurableExecutionControlsIfMissing(durable.snapshot);
    }
  }

  installDurableStorageSync();
  await persistDurableOrchestrationCache(
    restoredProjectState ? "app-start-disk-recovery" : "app-start-sync",
  );

  return {
    mode: "tauri",
    restoredProjectState,
    restoredExecutionControls,
    recordedAt,
  };
}
