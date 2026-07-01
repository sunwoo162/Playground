export interface CornellNote {
  id: string;
  subjectId: string;
  date: string;         // YYYY-MM-DD
  title: string;
  cues: string;         // 왼쪽: 키워드/질문
  notes: string;        // 오른쪽: 세부 내용
  summary: string;      // 하단: 요약
  createdAt: string;
  updatedAt: string;
}
