import type { FailureEntry, WastedTimeEntry, SmallWinEntry } from './types';

const KEYS = {
  failures: 'life-tracker-failures',
  wastedTime: 'life-tracker-wasted-time',
  smallWins: 'life-tracker-small-wins',
};

function getItems<T>(key: string): T[] {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}

function setItems<T>(key: string, items: T[]): void {
  localStorage.setItem(key, JSON.stringify(items));
}

export function getFailures(): FailureEntry[] {
  return getItems<FailureEntry>(KEYS.failures);
}

export function addFailure(entry: Omit<FailureEntry, 'id'>): FailureEntry {
  const items = getFailures();
  const newEntry = { ...entry, id: crypto.randomUUID() };
  items.unshift(newEntry);
  setItems(KEYS.failures, items);
  return newEntry;
}

export function deleteFailure(id: string): void {
  const items = getFailures().filter((i) => i.id !== id);
  setItems(KEYS.failures, items);
}

export function getWastedTime(): WastedTimeEntry[] {
  return getItems<WastedTimeEntry>(KEYS.wastedTime);
}

export function addWastedTime(entry: Omit<WastedTimeEntry, 'id'>): WastedTimeEntry {
  const items = getWastedTime();
  const newEntry = { ...entry, id: crypto.randomUUID() };
  items.unshift(newEntry);
  setItems(KEYS.wastedTime, items);
  return newEntry;
}

export function deleteWastedTime(id: string): void {
  const items = getWastedTime().filter((i) => i.id !== id);
  setItems(KEYS.wastedTime, items);
}

export function getSmallWins(): SmallWinEntry[] {
  return getItems<SmallWinEntry>(KEYS.smallWins);
}

export function addSmallWin(entry: Omit<SmallWinEntry, 'id'>): SmallWinEntry {
  const items = getSmallWins();
  const newEntry = { ...entry, id: crypto.randomUUID() };
  items.unshift(newEntry);
  setItems(KEYS.smallWins, items);
  return newEntry;
}

export function deleteSmallWin(id: string): void {
  const items = getSmallWins().filter((i) => i.id !== id);
  setItems(KEYS.smallWins, items);
}
