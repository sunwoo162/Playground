const BASE = 'http://ssh.gsmsv.site:8080/api/dev-notes/projects';

// 인증 필요 fetch 래퍼
async function authFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'include', // 세션 쿠키 포함
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchProjects() {
  return authFetch(BASE);
}

export async function fetchProject(id: string) {
  return authFetch(`${BASE}/${id}`);
}

export async function createProject(title: string, description: string) {
  return authFetch(BASE, {
    method: 'POST',
    body: JSON.stringify({ title, description }),
  });
}

export async function updateProject(id: string, data: object) {
  return authFetch(`${BASE}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string) {
  return authFetch(`${BASE}/${id}`, { method: 'DELETE' });
}
