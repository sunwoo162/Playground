import type { Project } from './types';

const KEY = 'dev-notes-projects';

export function getProjects(): Project[] {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveProjects(projects: Project[]): void {
  localStorage.setItem(KEY, JSON.stringify(projects));
}

export function getProject(id: string): Project | null {
  return getProjects().find((p) => p.id === id) ?? null;
}

export function createProject(title: string, description: string): Project {
  const projects = getProjects();
  const now = new Date().toISOString();
  const project: Project = {
    id: crypto.randomUUID(),
    title,
    description,
    createdAt: now,
    updatedAt: now,
    overview: {
      background: '',
      techStack: '',
      targetUsers: '',
      schedule: '',
      links: [],
    },
    spec: [],
    api: [],
    users: [],
  };
  projects.unshift(project);
  saveProjects(projects);
  return project;
}

export function updateProject(updated: Project): void {
  const projects = getProjects().map((p) =>
    p.id === updated.id ? { ...updated, updatedAt: new Date().toISOString() } : p
  );
  saveProjects(projects);
}

export function deleteProject(id: string): void {
  saveProjects(getProjects().filter((p) => p.id !== id));
}
