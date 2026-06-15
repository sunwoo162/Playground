import type { Subject, DailyGoal } from './types';

const SUBJECT_KEY = 'study-planner-subjects';
const GOAL_KEY = 'study-planner-goal';

export function getSubjects(): Subject[] {
  const raw = localStorage.getItem(SUBJECT_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveSubjects(subjects: Subject[]): void {
  localStorage.setItem(SUBJECT_KEY, JSON.stringify(subjects));
}

export function getDailyGoal(): DailyGoal {
  const raw = localStorage.getItem(GOAL_KEY);
  return raw ? JSON.parse(raw) : { totalMinutes: 480 };
}

export function saveDailyGoal(goal: DailyGoal): void {
  localStorage.setItem(GOAL_KEY, JSON.stringify(goal));
}
