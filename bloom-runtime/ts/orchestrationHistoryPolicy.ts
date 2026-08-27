export type DurableOrchestrationSnapshotLike = {
  schemaVersion: 1;
  projectTeamsState: {
    schemaVersion: 1;
    teams: unknown[];
    projects: unknown[];
  };
  executionControls: Record<string, unknown>;
};

export function isDurableOrchestrationSnapshot(
  value: unknown,
): value is DurableOrchestrationSnapshotLike {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Partial<DurableOrchestrationSnapshotLike>;
  if (snapshot.schemaVersion !== 1) return false;
  if (!snapshot.projectTeamsState || typeof snapshot.projectTeamsState !== "object") return false;
  if (snapshot.projectTeamsState.schemaVersion !== 1) return false;
  if (!Array.isArray(snapshot.projectTeamsState.teams)) return false;
  if (!Array.isArray(snapshot.projectTeamsState.projects)) return false;
  if (!snapshot.executionControls || typeof snapshot.executionControls !== "object") return false;
  if (Array.isArray(snapshot.executionControls)) return false;
  return true;
}

export function shouldRestoreDurableProjectState(
  current: { projects: unknown[] } | null,
  durable: DurableOrchestrationSnapshotLike,
) {
  return current === null && durable.projectTeamsState.projects.length > 0;
}
