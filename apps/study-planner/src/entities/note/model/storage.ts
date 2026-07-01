import type { CornellNote } from './types';

const KEY = 'study-planner-notes';

function localGet(): CornellNote[] {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}
function localSave(notes: CornellNote[]): void {
  localStorage.setItem(KEY, JSON.stringify(notes));
}

export async function getNotesAsync(): Promise<CornellNote[]> {
  return localGet();
}

export async function saveNoteAsync(note: CornellNote): Promise<CornellNote> {
  const all = localGet();
  const idx = all.findIndex(n => n.id === note.id);
  if (idx >= 0) {
    all[idx] = { ...note, updatedAt: new Date().toISOString() };
  } else {
    all.unshift(note);
  }
  localSave(all);
  return note;
}

export async function deleteNoteAsync(id: string): Promise<void> {
  localSave(localGet().filter(n => n.id !== id));
}
