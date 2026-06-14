export interface FailureEntry {
  id: string;
  date: string;
  category: '면접' | '프로젝트' | '운동' | '습관' | '기타';
  title: string;
  description: string;
  lesson: string;
}

export interface WastedTimeEntry {
  id: string;
  date: string;
  category: '유튜브' | '쇼츠' | '게임' | '배달앱' | 'SNS' | '기타';
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  note?: string;
}

export interface SmallWinEntry {
  id: string;
  date: string;
  title: string;
  emoji: string;
}

export type TabType = 'failures' | 'wasted-time' | 'small-wins';
