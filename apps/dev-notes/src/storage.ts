/**
 * storage.ts
 * 백엔드 연동 전: LocalStorage 사용
 * 백엔드 연동 후: API 호출로 대체
 *
 * 현재는 하이브리드 방식:
 * - 로그인 상태 → API 사용
 * - 비로그인 또는 API 실패 → LocalStorage fallback
 */
import type { Project } from './types';
import * as api from './api/projectApi';
import { generateId } from './utils/uuid';

const KEY = 'dev-notes-projects';

// ── LocalStorage 유틸 ──────────────────────────────
function localGetProjects(): Project[] {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

function localSaveProjects(projects: Project[]): void {
  localStorage.setItem(KEY, JSON.stringify(projects));
}

// ── API 연동 함수 (async) ──────────────────────────
export async function getProjectsAsync(): Promise<Project[]> {
  try {
    const data = await api.fetchProjects();
    return mapApiProjects(data);
  } catch {
    return localGetProjects();
  }
}

export async function createProjectAsync(title: string, description: string): Promise<Project> {
  try {
    const data = await api.createProject(title, description);
    return mapApiProject(data);
  } catch {
    return createProjectLocal(title, description);
  }
}

export async function updateProjectAsync(project: Project): Promise<void> {
  try {
    await api.updateProject(String(project.id), {
      title: project.title,
      description: project.description,
      overview: JSON.stringify(project.overview),
      spec: project.spec.map(s => ({
        id: s.id,
        title: s.title,
        description: s.description,
        priority: s.priority,
        status: s.status,
      })),
      api: project.api.map(a => ({
        id: a.id,
        method: a.method,
        endpoint: a.endpoint,
        description: a.description,
        headers: a.headers ? JSON.stringify(a.headers) : undefined,
        queryParams: a.queryParams ? JSON.stringify(a.queryParams) : undefined,
        requestBody: a.requestBody,
        responseBody: a.responseBody,
      })),
      users: project.users.map(u => ({
        id: u.id,
        persona: u.persona,
        goal: u.goal,
        painPoint: u.painPoint,
      })),
    });
  } catch {
    updateProjectLocal(project);
  }
}

export async function deleteProjectAsync(id: string): Promise<void> {
  try {
    await api.deleteProject(id);
  } catch {
    deleteProjectLocal(id);
  }
}

// ── LocalStorage fallback ──────────────────────────
function createProjectLocal(title: string, description: string): Project {
  const projects = localGetProjects();
  const now = new Date().toISOString();
  const project: Project = {
    id: generateId(),
    title,
    description,
    createdAt: now,
    updatedAt: now,
    overview: { background: '', techStack: '', targetUsers: '', schedule: '', links: [] },
    spec: [],
    api: [],
    users: [],
  };
  projects.unshift(project);
  localSaveProjects(projects);
  return project;
}

function updateProjectLocal(updated: Project): void {
  const projects = localGetProjects().map((p) =>
    p.id === updated.id ? { ...updated, updatedAt: new Date().toISOString() } : p
  );
  localSaveProjects(projects);
}

function deleteProjectLocal(id: string): void {
  localSaveProjects(localGetProjects().filter((p) => p.id !== id));
}

// ── 기존 동기 함수 유지 (하위 호환) ──────────────────
export function getProjects(): Project[] { return localGetProjects(); }
export function saveProjects(p: Project[]): void { localSaveProjects(p); }
export function updateProject(p: Project): void { updateProjectLocal(p); }
export function deleteProject(id: string): void { deleteProjectLocal(id); }
export function createProject(title: string, description: string): Project {
  return createProjectLocal(title, description);
}

// ── API 응답 → 내부 타입 변환 ─────────────────────
function mapApiProject(d: Record<string, unknown>): Project {
  return {
    id: String(d.id),
    title: String(d.title ?? ''),
    description: String(d.description ?? ''),
    createdAt: String(d.createdAt ?? new Date().toISOString()),
    updatedAt: String(d.updatedAt ?? new Date().toISOString()),
    overview: d.overview
      ? (typeof d.overview === 'string' ? JSON.parse(d.overview) : d.overview)
      : { background: '', techStack: '', targetUsers: '', schedule: '', links: [] },
    spec: Array.isArray(d.spec) ? d.spec as Project['spec'] : [],
    api: Array.isArray(d.api) ? (d.api as Record<string, unknown>[]).map(a => ({
      ...a,
      headers: typeof a.headers === 'string' ? JSON.parse(a.headers) : (a.headers ?? []),
      queryParams: typeof a.queryParams === 'string' ? JSON.parse(a.queryParams) : (a.queryParams ?? []),
    })) as Project['api'] : [],
    users: Array.isArray(d.users) ? d.users as Project['users'] : [],
    ownerId: d.ownerId ? String(d.ownerId) : undefined,
    isOwner: d.isOwner as boolean ?? true,
    sharedWith: Array.isArray(d.sharedWith) ? d.sharedWith as string[] : [],
  };
}

function mapApiProjects(data: unknown[]): Project[] {
  return data.map(d => mapApiProject(d as Record<string, unknown>));
}
