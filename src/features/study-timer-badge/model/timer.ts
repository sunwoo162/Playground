export function getStudyTimerElapsed(): number | null {
  try {
    const raw = localStorage.getItem('study-planner-timer');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.running || !data.startTime) return null;
    return Math.floor((Date.now() - new Date(data.startTime).getTime()) / 1000);
  } catch {
    return null;
  }
}

export function formatStudyTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
