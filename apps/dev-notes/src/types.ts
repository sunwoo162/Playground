export interface Project {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  spec: FeatureSpec[];
  api: ApiSpec[];
  users: UserAnalysis[];
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

export type TabType = 'spec' | 'api' | 'users';
