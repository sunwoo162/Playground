export interface StudySession {
  id: string;
  subjectId: string;
  date: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  durationMinutes: number; // 하위 호환
  memo?: string;
}
