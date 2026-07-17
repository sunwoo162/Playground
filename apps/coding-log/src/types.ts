export type Platform = 'programmers' | 'baekjoon';
export type Status = 'solved' | 'failed' | 'retry';
export type Language = 'python' | 'javascript' | 'typescript' | 'java' | 'cpp' | 'c' | 'kotlin' | 'swift' | 'go' | 'rust';

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
  language?: Language;
  approach: string;
  code: string;
  timeComplexity?: string;
  tags: string[];
  date: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: number;
  userId: string;
  userLogin: string;
  userAvatarUrl: string;
  content: string;
  createdAt: string;
}

export interface VelogSettings {
  enabled: boolean;
  username: string;
  accessToken: string;
  tags: string;
  isPrivate: boolean;
}
