import { useEffect, useState } from 'react';

export interface AuthUser { id: string; login: string; }

export function useAuth(): { authed: boolean | null; user: AuthUser | null } {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.user) {
          setAuthed(true);
          setUser({ id: String(data.user.id), login: data.user.login });
        } else {
          const returnTo = encodeURIComponent(window.location.href);
          window.location.href = `/?returnTo=${returnTo}`;
        }
      })
      .catch(() => { window.location.href = '/'; });
  }, []);
  return { authed, user };
}
