import type { Subject, StudySession, DailyGoal } from './types';

const KEYS = {
  subjects: 'study-planner-subjects',
  sessions: 'study-planner-sessions',
  goal: 'study-planner-goal',
};

// Subjects
export function getSubjects(): Subject[] {
  const raw = localStorage.getItem(KEYS.subjects);
  return raw ? JSON.parse(raw) : [];
}
export function saveSubjects(subjects: Subject[]) {
  localStorage.setItem(KEYS.subjects, JSON.stringify(subjects));
}

// Sessions
export function getSessions(): StudySession[] {
  const raw = localStorage.getItem(KEYS.sessions);
  return raw ? JSON.parse(raw) : [];
}
export function saveSessions(sessions: StudySession[]) {
  localStorage.setItem(KEYS.sessions, JSON.stringify(sessions));
}
export function addSession(session: StudySession) {
  const sessions = getSessions();
  sessions.unshift(session);
  saveSessions(sessions);
}
export function deleteSession(id: string) {
  saveSessions(getSessions().filter(s => s.id !== id));
}

// Daily Goal
export function getDailyGoal(): DailyGoal {
  const raw = localStorage.getItem(KEYS.goal);
  return raw ? JSON.parse(raw) : { totalMinutes: 480 }; // 기본 8시간
}
export function saveDailyGoal(goal: DailyGoal) {
  localStorage.setItem(KEYS.goal, JSON.stringify(goal));
}

// 날짜별 총 공부 시간 (분)
export function getTotalMinutesByDate(date: string, sessions?: StudySession[]): number {
  const all = sessions ?? getSessions();
  return all.filter(s => s.date === date).reduce((sum, s) => sum + s.durationMinutes, 0);
}

// 과목별 총 공부 시간
export function getMinutesBySubject(subjectId: string, sessions?: StudySession[]): number {
  const all = sessions ?? getSessions();
  return all.filter(s => s.subjectId === subjectId).reduce((sum, s) => sum + s.durationMinutes, 0);
}

// 연속 공부 일수 (streak) - 오늘 포함
export function getStreak(sessions?: StudySession[]): number {
  const all = sessions ?? getSessions();
  const studiedDates = new Set(all.map(s => s.date));
  if (studiedDates.size === 0) return 0;

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    if (studiedDates.has(dateStr)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// 이번 주 공부한 날 수
export function getWeekStudyDays(sessions?: StudySession[]): number {
  const all = sessions ?? getSessions();
  const today = new Date();
  const weekDates = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    weekDates.add(d.toISOString().split('T')[0]);
  }
  const studiedDates = new Set(all.map(s => s.date));
  return [...weekDates].filter(d => studiedDates.has(d)).length;
}
