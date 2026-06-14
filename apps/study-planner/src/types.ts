export interface Subject {
  id: string;
  name: string;
  color: string;
  dailyGoalMinutes: number; // 하루 목표 시간
}

export interface StudySession {
  id: string;
  subjectId: string;
  date: string;        // YYYY-MM-DD
  startTime: string;   // ISO string
  endTime: string;     // ISO string
  durationMinutes: number;
  memo?: string;
}

export interface DailyGoal {
  totalMinutes: number; // 하루 전체 목표 시간
}

export type TabType = 'timer' | 'stats' | 'calendar' | 'subjects';
