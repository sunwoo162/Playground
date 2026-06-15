import type { StudySession } from './types';
import { getSessionSeconds } from '../../../shared/lib';

/** 특정 날짜의 총 공부 시간 (초) */
export function getTotalSecondsByDate(date: string, sessions: StudySession[]): number {
  return sessions
    .filter(s => s.date === date)
    .reduce((sum, s) => sum + getSessionSeconds(s), 0);
}

/** 특정 과목의 총 공부 시간 (초) */
export function getTotalSecondsBySubject(subjectId: string, sessions: StudySession[]): number {
  return sessions
    .filter(s => s.subjectId === subjectId)
    .reduce((sum, s) => sum + getSessionSeconds(s), 0);
}

/** 연속 공부 일수 */
export function getStreak(sessions: StudySession[]): number {
  const studiedDates = new Set(sessions.map(s => s.date));
  if (studiedDates.size === 0) return 0;

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (studiedDates.has(d.toISOString().split('T')[0])) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/** 이번 주 공부한 날 수 */
export function getWeekStudyDays(sessions: StudySession[]): number {
  const today = new Date();
  const studiedDates = new Set(sessions.map(s => s.date));
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (studiedDates.has(d.toISOString().split('T')[0])) count++;
  }
  return count;
}
