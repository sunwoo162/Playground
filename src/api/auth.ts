/**
 * 액세스 토큰 자동 갱신 유틸
 *
 * 401 응답 받으면 /api/auth/refresh로 새 액세스 토큰 발급 후 재시도
 */

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * 리프레시 토큰으로 액세스 토큰 갱신
 * 동시에 여러 요청이 401을 받아도 refresh는 한 번만 실행
 */
async function refreshAccessToken(): Promise<boolean> {
  if (isRefreshing && refreshPromise) return refreshPromise;

  isRefreshing = true;
  refreshPromise = fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
    .then((res) => {
      if (res.ok) return true;
      // refresh도 실패 → 로그인 필요
      window.location.href = '/auth/github';
      return false;
    })
    .catch(() => {
      window.location.href = '/auth/github';
      return false;
    })
    .finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });

  return refreshPromise;
}

/**
 * fetch 래퍼 - 401 시 자동으로 토큰 갱신 후 재시도
 */
export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { credentials: 'include', ...init });

  if (res.status === 401) {
    const ok = await refreshAccessToken();
    if (ok) {
      // 새 토큰으로 재시도
      return fetch(input, { credentials: 'include', ...init });
    }
  }

  return res;
}

/**
 * 쿠키에서 액세스 토큰(playground_token) 만료 시간 파싱
 */
export function getAccessTokenExpiry(): Date | null {
  const cookies = document.cookie.split(';');
  const tokenCookie = cookies.find((c) => c.trim().startsWith('playground_token='));
  if (!tokenCookie) return null;
  try {
    const token = tokenCookie.trim().substring('playground_token='.length);
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.exp ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

/**
 * 남은 시간 포맷
 */
export function formatTimeLeft(expiry: Date): string {
  const diff = expiry.getTime() - Date.now();
  if (diff <= 0) return '만료됨';
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (m >= 60) return `${Math.floor(m / 60)}시간 ${m % 60}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}
