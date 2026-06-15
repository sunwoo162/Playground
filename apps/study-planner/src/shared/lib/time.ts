export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0초';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0 && m === 0 && s === 0) return `${h}시간`;
  if (h > 0 && s === 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간 ${m}분 ${s}초`;
  if (m > 0 && s === 0) return `${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

// 분 단위 입력용 (하위 호환)
export function formatDurationFromMinutes(minutes: number): string {
  return formatDuration(minutes * 60);
}

export function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export function getWeekDates(): string[] {
  const today = new Date();
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function getMonthDates(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1).getDay(); // 0=일
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return cells;
}

export function getSessionSeconds(session: { durationSeconds?: number; durationMinutes: number }): number {
  return session.durationSeconds ?? session.durationMinutes * 60;
}
