import type { CodingLog } from './types';

const KEY = 'coding-log-entries';

export function getLogs(): CodingLog[] {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveLog(log: CodingLog): void {
  const all = getLogs();
  const idx = all.findIndex(l => l.id === log.id);
  if (idx >= 0) all[idx] = { ...log, updatedAt: new Date().toISOString() };
  else all.unshift(log);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function deleteLog(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(getLogs().filter(l => l.id !== id)));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// URL 파라미터에서 문제 정보 파싱
export function parseUrlParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    title: p.get('title') || '',
    level: p.get('level') || '',
    platform: (p.get('platform') || 'programmers') as 'programmers' | 'baekjoon',
    number: p.get('number') || '',
  };
}
