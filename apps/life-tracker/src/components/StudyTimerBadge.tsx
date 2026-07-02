import { useEffect, useState } from 'react';

function getElapsed(): number | null {
  try {
    const raw = localStorage.getItem('study-planner-timer');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.running || !data.startTime) return null;
    return Math.floor((Date.now() - new Date(data.startTime).getTime()) / 1000);
  } catch { return null; }
}

function fmt(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

export function StudyTimerBadge() {
  const [elapsed, setElapsed] = useState<number | null>(getElapsed);
  useEffect(() => {
    const id = setInterval(() => setElapsed(getElapsed()), 1000);
    return () => clearInterval(id);
  }, []);
  if (elapsed === null) return null;
  return (
    <a href="/apps/study-planner/" className="study-timer-badge">⏱️ {fmt(elapsed)}</a>
  );
}
