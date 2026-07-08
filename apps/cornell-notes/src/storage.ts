import type { CornellNote, GitRepoSettings, Subject } from './types';

const NOTES_KEY = 'cornell-notes';
const SUBJECTS_KEY = 'cornell-subjects';
const GIT_REPO_KEY = 'cornell-git-repo-settings';

// ── Notes ──────────────────────────────────────────
export function getNotes(): CornellNote[] {
  const raw = localStorage.getItem(NOTES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveNote(note: CornellNote): void {
  const all = getNotes();
  const idx = all.findIndex(n => n.id === note.id);
  if (idx >= 0) {
    all[idx] = { ...note, updatedAt: new Date().toISOString() };
  } else {
    all.unshift(note);
  }
  localStorage.setItem(NOTES_KEY, JSON.stringify(all));
}

export function deleteNote(id: string): void {
  localStorage.setItem(NOTES_KEY, JSON.stringify(getNotes().filter(n => n.id !== id)));
}

// ── Subjects ───────────────────────────────────────
export function getSubjects(): Subject[] {
  const raw = localStorage.getItem(SUBJECTS_KEY);
  return raw ? JSON.parse(raw) : [
    { id: '1', name: '수학', color: '#70a1ff' },
    { id: '2', name: '영어', color: '#2ed573' },
    { id: '3', name: '과학', color: '#ffa502' },
  ];
}

export function saveSubjects(subjects: Subject[]): void {
  localStorage.setItem(SUBJECTS_KEY, JSON.stringify(subjects));
}

// ── GitHub repo settings ───────────────────────────
export function getGitRepoSettings(): GitRepoSettings {
  const raw = localStorage.getItem(GIT_REPO_KEY);
  return raw ? JSON.parse(raw) : { repo: '', basePath: 'cornell-notes' };
}

export function saveGitRepoSettings(settings: GitRepoSettings): void {
  localStorage.setItem(GIT_REPO_KEY, JSON.stringify(settings));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
