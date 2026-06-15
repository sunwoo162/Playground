export interface Subject {
  id: string;
  name: string;
  color: string;
  dailyGoalMinutes: number;
}

export interface DailyGoal {
  totalMinutes: number;
}
