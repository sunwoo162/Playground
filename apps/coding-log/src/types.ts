export type Platform = 'programmers' | 'baekjoon';
export type Status = 'solved' | 'failed' | 'retry';

export interface CodingLog {
  id: string;
  userId?: string;
  userLogin?: string;
  userAvatarUrl?: string;
  platform: Platform;
  problemTitle: string;
  problemNumber?: string;
  level?: string;
  status: Status;
  approach: string;
  code: string;
  timeComplexity?: string;
  tags: string[];
  date: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}
