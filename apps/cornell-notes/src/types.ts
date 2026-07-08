export interface CornellNote {
  id: string;
  subjectId: string;
  date: string;
  title: string;
  cues: string;      // 키워드/질문 (왼쪽)
  notes: string;     // 세부 내용 (오른쪽)
  summary: string;   // 요약 (하단)
  createdAt: string;
  updatedAt: string;
}

export interface Subject {
  id: string;
  name: string;
  color: string;
}

export interface GitRepoSettings {
  repo: string;
  basePath: string;
}
