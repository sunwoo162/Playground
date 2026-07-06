import type { CodingLog } from './types';

const BASE = '/api/coding-log';

async function req<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getMyLogs(): Promise<CodingLog[]> {
  const data = await req<ApiLog[]>(`${BASE}/my`);
  return data.map(toLocal);
}

export async function getPublicLogs(): Promise<CodingLog[]> {
  const data = await req<ApiLog[]>(`${BASE}/public`);
  return data.map(toLocal);
}

export async function createLog(log: CodingLog): Promise<CodingLog> {
  const data = await req<ApiLog>(BASE, {
    method: 'POST',
    body: JSON.stringify(toApi(log)),
  });
  return toLocal(data);
}

export async function updateLog(log: CodingLog): Promise<CodingLog> {
  const data = await req<ApiLog>(`${BASE}/${log.id}`, {
    method: 'PUT',
    body: JSON.stringify(toApi(log)),
  });
  return toLocal(data);
}

export async function deleteLog(id: string): Promise<void> {
  await req(`${BASE}/${id}`, { method: 'DELETE' });
}

// ── 타입 변환 ──────────────────────────────────────────────
interface ApiLog {
  id: number;
  userId: string;
  userLogin: string;
  userAvatarUrl: string | null;
  platform: string;
  problemTitle: string;
  problemNumber: string | null;
  level: string | null;
  status: string;
  approach: string | null;
  code: string | null;
  timeComplexity: string | null;
  tags: string | null;
  date: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

function toLocal(a: ApiLog): CodingLog {
  return {
    id: String(a.id),
    userId: a.userId,
    userLogin: a.userLogin,
    userAvatarUrl: a.userAvatarUrl ?? undefined,
    platform: a.platform as 'programmers' | 'baekjoon',
    problemTitle: a.problemTitle,
    problemNumber: a.problemNumber ?? '',
    level: a.level ?? '',
    status: a.status as 'solved' | 'failed' | 'retry',
    language: (a as any).language ?? undefined,
    approach: a.approach ?? '',
    code: a.code ?? '',
    timeComplexity: a.timeComplexity ?? '',
    tags: a.tags ? JSON.parse(a.tags) : [],
    date: a.date,
    isPublic: a.isPublic,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function toApi(log: CodingLog) {
  return {
    platform: log.platform,
    problemTitle: log.problemTitle,
    problemNumber: log.problemNumber || null,
    level: log.level || null,
    status: log.status,
    language: log.language || null,
    approach: log.approach || null,
    code: log.code || null,
    timeComplexity: log.timeComplexity || null,
    tags: JSON.stringify(log.tags),
    date: log.date,
    isPublic: log.isPublic,
  };
}

// ── 좋아요 ──────────────────────────────────────────────
export async function getLike(logId: string): Promise<{ liked: boolean; count: number }> {
  return req(`/api/coding-log/${logId}/like`);
}
export async function toggleLike(logId: string): Promise<{ liked: boolean; count: number }> {
  return req(`/api/coding-log/${logId}/like`, { method: 'POST' });
}

// ── 댓글 ────────────────────────────────────────────────
export async function getComments(logId: string) {
  return req<any[]>(`/api/coding-log/${logId}/comments`);
}
export async function addComment(logId: string, content: string) {
  return req(`/api/coding-log/${logId}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
}
export async function deleteComment(commentId: number) {
  return req(`/api/coding-log/comments/${commentId}`, { method: 'DELETE' });
}

// ── 유틸 ──────────────────────────────────────────────────
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseUrlParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    title: p.get('title') || '',
    level: p.get('level') || '',
    platform: (p.get('platform') || 'programmers') as 'programmers' | 'baekjoon',
    number: p.get('number') || '',
    commitSha: p.get('commitSha') || '',
    repo: p.get('repo') || '',
  };
}

/**
 * GitHub commit API로 코드 파일 내용을 가져옴
 * GET /repos/{repo}/commits/{commitSha} → files[].raw_url 로 내용 fetch
 */
export async function fetchCodeFromCommit(
  repo: string,
  commitSha: string,
  problemTitle: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits/${commitSha}`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const files: Array<{ filename: string; raw_url: string }> = data.files ?? [];

    // README 제외하고 코드 파일만
    const codeFiles = files.filter(f => !f.filename.endsWith('.md'));

    // 문제 제목을 기반으로 파일 매칭
    const normalize = (s: string) =>
      s.toLowerCase().replace(/[\s_\-+\[\]().]+/g, '').replace(/[^a-z0-9가-힣]/g, '');

    const titleNorm = normalize(problemTitle);
    const matched = codeFiles.find(f => {
      const baseName = f.filename.split('/').pop() || f.filename;
      const nameWithoutExt = baseName.replace(/\.[^.]+$/, '');
      return normalize(nameWithoutExt).includes(titleNorm) || titleNorm.includes(normalize(nameWithoutExt));
    });
    const target = matched ?? codeFiles[0];

    if (!target) return null;

    // github.com/raw → raw.githubusercontent.com으로 변환 (CORS 우회)
    const rawUrl = target.raw_url
      .replace('https://github.com/', 'https://raw.githubusercontent.com/')
      .replace('/raw/', '/');

    const codeRes = await fetch(rawUrl);
    if (!codeRes.ok) return null;

    return await codeRes.text();
  } catch {
    return null;
  }
}
