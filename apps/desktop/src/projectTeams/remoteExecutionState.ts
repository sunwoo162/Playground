import type { RemoteRunnerJob } from "./remoteRunner";

const STORAGE_KEY = "luna.remote-executions.v1";

export type RemoteExecutionRecord = {
  projectId: string;
  jobId: string;
  idempotencyKey: string;
  runnerBaseUrl: string;
  status: RemoteRunnerJob["status"];
  submittedAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
  error: string | null;
};

type RemoteExecutionStore = {
  version: 1;
  records: RemoteExecutionRecord[];
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadStore(): RemoteExecutionStore {
  if (!canUseStorage()) return { version: 1, records: [] };
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return { version: 1, records: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<RemoteExecutionStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.records)) {
      return { version: 1, records: [] };
    }
    return {
      version: 1,
      records: parsed.records.filter(
        (record): record is RemoteExecutionRecord =>
          Boolean(record?.projectId && record?.jobId && record?.runnerBaseUrl),
      ),
    };
  } catch {
    return { version: 1, records: [] };
  }
}

function saveStore(store: RemoteExecutionStore) {
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }
}

export function getRemoteExecution(projectId: string) {
  return loadStore().records.find((record) => record.projectId === projectId) ?? null;
}

export function listRemoteExecutions() {
  return loadStore().records;
}

export function recordRemoteSubmission(
  job: RemoteRunnerJob,
  runnerBaseUrl: string,
): RemoteExecutionRecord {
  const now = new Date().toISOString();
  const record: RemoteExecutionRecord = {
    projectId: job.projectId,
    jobId: job.id,
    idempotencyKey: job.idempotencyKey,
    runnerBaseUrl,
    status: job.status,
    submittedAt: job.createdAt || now,
    updatedAt: job.updatedAt || now,
    lastSyncedAt: null,
    error: job.error,
  };
  const store = loadStore();
  store.records = [
    record,
    ...store.records.filter((item) => item.projectId !== record.projectId),
  ];
  saveStore(store);
  return record;
}

export function updateRemoteExecution(job: RemoteRunnerJob) {
  const store = loadStore();
  const existing = store.records.find((record) => record.projectId === job.projectId);
  if (!existing) return null;

  const updated: RemoteExecutionRecord = {
    ...existing,
    jobId: job.id,
    idempotencyKey: job.idempotencyKey,
    status: job.status,
    updatedAt: job.updatedAt,
    lastSyncedAt: new Date().toISOString(),
    error: job.error,
  };
  store.records = store.records.map((record) =>
    record.projectId === job.projectId ? updated : record,
  );
  saveStore(store);
  return updated;
}

export function clearRemoteExecution(projectId: string) {
  const store = loadStore();
  store.records = store.records.filter((record) => record.projectId !== projectId);
  saveStore(store);
}
