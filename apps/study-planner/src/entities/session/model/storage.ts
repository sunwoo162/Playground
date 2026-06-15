import type { StudySession } from './types';

const KEY = 'study-planner-sessions';

export function getSessions(): StudySession[] {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveSessions(sessions: StudySession[]): void {
  localStorage.setItem(KEY, JSON.stringify(sessions));
}

export function addSession(session: StudySession): void {
  const all = getSessions();
  all.unshift(session);
  saveSessions(all);
}

export function deleteSession(id: string): void {
  saveSessions(getSessions().filter(s => s.id !== id));
}
