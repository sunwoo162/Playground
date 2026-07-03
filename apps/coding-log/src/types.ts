export type Platform = 'programmers' | 'baekjoon';
export type Status = 'solved' | 'failed' | 'retry';

export interface CodingLog {
  id: string;
  platform: Platform;
  problemTitle: string;
  problemNumber?: string;
  level?: string;          // 프로그래머스: Lv.1~5, 백준: 브론즈~플래티넘
  status: Status;
  approach: string;        // 풀이 접근법
  code: string;            // 코드
  timeComplexity?: string; // 시간 복잡도
  tags: string[];          // DP, 그리디, BFS 등
  date: string;            // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}
