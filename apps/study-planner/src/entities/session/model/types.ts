export interface StudySession {
  id: string;
  subjectId: string;
  date: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  durationMinutes: number;
  memo?: string;
}
