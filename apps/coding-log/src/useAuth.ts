import { useEffect, useState } from 'react';

export function useAuth() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.user) setAuthed(true);
        else {
          // 현재 URL을 returnTo로 저장 후 메인으로 이동
          const returnTo = encodeURIComponent(window.location.href);
          window.location.href = `/?returnTo=${returnTo}`;
        }
      })
      .catch(() => { window.location.href = '/'; });
  }, []);
  return authed;
}
