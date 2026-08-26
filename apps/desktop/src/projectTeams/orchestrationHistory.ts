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

let persistQueue: Promise<unknown> = Promise.resolve();

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
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

export function shouldRestoreFromDurableHistory(
  current: ProjectTeamsState,
  envelope: OrchestrationSnapshotEnvelope,
) {
  return shouldRestoreDurableProjectState(current, envelope.snapshot);
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

export function persistDurableOrchestrationSnapshot(
  state: ProjectTeamsState,
  reason = "project-teams-state-sync",
) {
  if (!isTauriRuntime()) {
    return Promise.resolve<PersistOrchestrationSnapshotResult | null>(null);
  }

  const recordedAt = new Date().toISOString();
  const snapshot = createDurableOrchestrationSnapshot(state);
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
