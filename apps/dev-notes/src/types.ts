export interface Project {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  overview: ProjectOverview;
  spec: FeatureSpec[];
  api: ApiSpec[];
  users: UserAnalysis[];
}

export interface ProjectOverview {
  background: string;       // 프로젝트 배경/목적
  techStack: string;        // 기술 스택
  targetUsers: string;      // 타겟 사용자
  schedule: string;         // 일정
  links: ProjectLink[];     // 관련 링크
}

export interface ProjectLink {
  id: string;
  label: string;
  url: string;
}

export interface FeatureSpec {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'planned' | 'in-progress' | 'done';
}

export interface ApiSpec {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  description: string;
  requestBody?: string;
  responseBody?: string;
}

export interface UserAnalysis {
  id: string;
  persona: string;
  goal: string;
  painPoint: string;
}

export type TabType = 'overview' | 'spec' | 'api' | 'users';
