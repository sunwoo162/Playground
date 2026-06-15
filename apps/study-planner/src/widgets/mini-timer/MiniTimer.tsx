import type { Subject } from '../../entities/subject';
import { formatTimer } from '../../shared/lib';

interface Props {
  running: boolean;
  elapsed: number;
  subject?: Subject;
}

export function MiniTimer({ running, elapsed, subject }: Props) {
  if (!running) return null;

  return (
    <div className="mini-timer" style={{ borderColor: subject?.color ?? '#70a1ff' }}>
      <span className="mini-timer-dot" style={{ backgroundColor: subject?.color ?? '#70a1ff' }} />
      <span className="mini-timer-subject">{subject?.name}</span>
      <span className="mini-timer-time" style={{ color: subject?.color ?? '#70a1ff' }}>
        {formatTimer(elapsed)}
      </span>
    </div>
  );
}
