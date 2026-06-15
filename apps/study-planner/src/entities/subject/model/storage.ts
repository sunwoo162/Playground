import type { Subject, DailyGoal } from './types';
import {
  apiGetSubjects, apiCreateSubject, apiUpdateSubject,
  apiDeleteSubject, apiGetGoal, apiSaveGoal,
} from '../../../shared/lib/api';

const SUBJECT_KEY = 'study-planner-subjects';
const GOAL_KEY = 'study-planner-goal';

// ── LocalStorage fallback ──
function localGetSubjects(): Subject[] {
  const raw = localStorage.getItem(SUBJECT_KEY);
  return raw ? JSON.parse(raw) : [];
}
function localSaveSubjects(subjects: Subject[]): void {
  localStorage.setItem(SUBJECT_KEY, JSON.stringify(subjects));
}
function localGetGoal(): DailyGoal {
  const raw = localStorage.getItem(GOAL_KEY);
  return raw ? JSON.parse(raw) : { totalMinutes: 480 };
}
function localSaveGoal(goal: DailyGoal): void {
  localStorage.setItem(GOAL_KEY, JSON.stringify(goal));
}

// ── API with LocalStorage fallback ──
export async function getSubjectsAsync(): Promise<Subject[]> {
  try {
    const data = await apiGetSubjects();
    const subjects = data.map(s => ({
      id: String(s.id),
      name: s.name,
      color: s.color,
      dailyGoalMinutes: s.dailyGoalMinutes,
    }));
    localSaveSubjects(subjects);
    return subjects;
  } catch {
    return localGetSubjects();
  }
}

export async function createSubjectAsync(name: string, color: string, dailyGoalMinutes: number): Promise<Subject> {
  try {
    const data = await apiCreateSubject({ name, color, dailyGoalMinutes });
    return { id: String(data.id), name: data.name, color: data.color, dailyGoalMinutes: data.dailyGoalMinutes };
  } catch {
    const s: Subject = { id: crypto.randomUUID(), name, color, dailyGoalMinutes };
    const all = localGetSubjects();
    localSaveSubjects([...all, s]);
    return s;
  }
}

export async function updateSubjectAsync(subject: Subject): Promise<void> {
  try {
    const numId = parseInt(subject.id);
    if (!isNaN(numId)) {
      await apiUpdateSubject(numId, { name: subject.name, color: subject.color, dailyGoalMinutes: subject.dailyGoalMinutes });
    }
  } catch {
    const all = localGetSubjects().map(s => s.id === subject.id ? subject : s);
    localSaveSubjects(all);
  }
}

export async function deleteSubjectAsync(id: string): Promise<void> {
  try {
    const numId = parseInt(id);
    if (!isNaN(numId)) await apiDeleteSubject(numId);
  } catch {}
  localSaveSubjects(localGetSubjects().filter(s => s.id !== id));
}

export async function getDailyGoalAsync(): Promise<DailyGoal> {
  try {
    const data = await apiGetGoal();
    localSaveGoal({ totalMinutes: data.totalMinutes });
    return { totalMinutes: data.totalMinutes };
  } catch {
    return localGetGoal();
  }
}

export async function saveDailyGoalAsync(totalMinutes: number): Promise<void> {
  try {
    await apiSaveGoal(totalMinutes);
  } catch {}
  localSaveGoal({ totalMinutes });
}

// ── 동기 fallback (기존 호환) ──
export function getSubjects(): Subject[] { return localGetSubjects(); }
export function saveSubjects(s: Subject[]): void { localSaveSubjects(s); }
export function getDailyGoal(): DailyGoal { return localGetGoal(); }
export function saveDailyGoal(goal: DailyGoal): void { localSaveGoal(goal); }
