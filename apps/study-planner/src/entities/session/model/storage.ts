import type { StudySession } from './types';
import { apiGetSessions, apiCreateSession, apiDeleteSession } from '../../../shared/lib/api';

const KEY = 'study-planner-sessions';

function localGet(): StudySession[] {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}
function localSave(sessions: StudySession[]): void {
  localStorage.setItem(KEY, JSON.stringify(sessions));
}

function toLocal(s: { id: number; subjectId: number; date: string; startTime?: string; endTime?: string; durationSeconds: number; durationMinutes: number; memo?: string }): StudySession {
  return {
    id: String(s.id),
    subjectId: String(s.subjectId),
    date: s.date,
    startTime: s.startTime ?? new Date().toISOString(),
    endTime: s.endTime ?? new Date().toISOString(),
    durationSeconds: s.durationSeconds,
    durationMinutes: s.durationMinutes,
    memo: s.memo,
  };
}

export async function getSessionsAsync(): Promise<StudySession[]> {
  try {
    const data = await apiGetSessions();
    const sessions = data.map(toLocal);
    localSave(sessions);
    return sessions;
  } catch {
    return localGet();
  }
}

export async function addSessionAsync(session: StudySession): Promise<StudySession> {
  try {
    const res = await apiCreateSession({
      subjectId: parseInt(session.subjectId),
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      durationSeconds: session.durationSeconds,
      durationMinutes: session.durationMinutes,
      memo: session.memo,
    });
    const saved = toLocal(res);
    const all = localGet();
    localSave([saved, ...all]);
    return saved;
  } catch {
    localSave([session, ...localGet()]);
    return session;
  }
}

export async function deleteSessionAsync(id: string): Promise<void> {
  try {
    const numId = parseInt(id);
    if (!isNaN(numId)) await apiDeleteSession(numId);
  } catch {}
  localSave(localGet().filter(s => s.id !== id));
}

// ── 동기 fallback ──
export function getSessions(): StudySession[] { return localGet(); }
export function saveSessions(s: StudySession[]): void { localSave(s); }
export function addSession(session: StudySession): void {
  localSave([session, ...localGet()]);
}
export function deleteSession(id: string): void {
  localSave(localGet().filter(s => s.id !== id));
}
