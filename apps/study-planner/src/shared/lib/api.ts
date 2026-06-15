const BASE = 'http://ssh.gsmsv.site:8080/api/study';

async function req<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Subjects
export const apiGetSubjects = () => req<SubjectRes[]>(`${BASE}/subjects`);
export const apiCreateSubject = (data: SubjectReq) =>
  req<SubjectRes>(`${BASE}/subjects`, { method: 'POST', body: JSON.stringify(data) });
export const apiUpdateSubject = (id: number, data: SubjectReq) =>
  req<SubjectRes>(`${BASE}/subjects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const apiDeleteSubject = (id: number) =>
  req<void>(`${BASE}/subjects/${id}`, { method: 'DELETE' });

// Sessions
export const apiGetSessions = () => req<SessionRes[]>(`${BASE}/sessions`);
export const apiCreateSession = (data: SessionReq) =>
  req<SessionRes>(`${BASE}/sessions`, { method: 'POST', body: JSON.stringify(data) });
export const apiDeleteSession = (id: number) =>
  req<void>(`${BASE}/sessions/${id}`, { method: 'DELETE' });

// Daily Goal
export const apiGetGoal = () => req<GoalRes>(`${BASE}/goal`);
export const apiSaveGoal = (totalMinutes: number) =>
  req<GoalRes>(`${BASE}/goal`, { method: 'PUT', body: JSON.stringify({ totalMinutes }) });

// Types
export interface SubjectReq { name: string; color: string; dailyGoalMinutes: number; }
export interface SubjectRes { id: number; name: string; color: string; dailyGoalMinutes: number; }
export interface SessionReq {
  subjectId: number; date: string;
  startTime?: string; endTime?: string;
  durationSeconds: number; durationMinutes: number; memo?: string;
}
export interface SessionRes {
  id: number; subjectId: number; date: string;
  startTime?: string; endTime?: string;
  durationSeconds: number; durationMinutes: number; memo?: string;
}
export interface GoalRes { totalMinutes: number; }
