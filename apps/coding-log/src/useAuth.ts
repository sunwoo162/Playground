import { useEffect, useState } from 'react';

export function useAuth() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.user) setAuthed(true);
        else window.location.href = '/';
      })
      .catch(() => { window.location.href = '/'; });
  }, []);
  return authed;
}
