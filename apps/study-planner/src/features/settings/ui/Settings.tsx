import { useRef, useState } from 'react';
import type { StudySession } from '../../../entities/session';
import type { Subject } from '../../../entities/subject';

const SUBJECT_KEY = 'study-planner-subjects';
const SESSION_KEY = 'study-planner-sessions';
const NOTE_KEY = 'study-planner-notes';
const GOAL_KEY = 'study-planner-goal';
const TIMER_KEY = 'study-planner-timer';

interface Props {
  subjects: Subject[];
  sessions: StudySession[];
  dailyGoalMinutes: number;
  running: boolean;
  onDataImported: () => void;
}

interface BackupPayload {
  app: 'study-planner';
  version: 1;
  exportedAt: string;
  data: {
    subjects: unknown[];
    sessions: unknown[];
    notes: unknown[];
    dailyGoal: { totalMinutes: number };
  };
}

function readJsonStorage(key: string, fallback: unknown) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function isBackupPayload(value: unknown): value is BackupPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as BackupPayload;
  return payload.app === 'study-planner'
    && payload.version === 1
    && Boolean(payload.data)
    && Array.isArray(payload.data.subjects)
    && Array.isArray(payload.data.sessions)
    && Array.isArray(payload.data.notes)
    && typeof payload.data.dailyGoal?.totalMinutes === 'number';
}

export function Settings({ subjects, sessions, dailyGoalMinutes, running, onDataImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState('');
  const [dangerConfirm, setDangerConfirm] = useState(false);

  const exportData = () => {
    const payload: BackupPayload = {
      app: 'study-planner',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        subjects: readJsonStorage(SUBJECT_KEY, subjects),
        sessions: readJsonStorage(SESSION_KEY, sessions),
        notes: readJsonStorage(NOTE_KEY, []),
        dailyGoal: readJsonStorage(GOAL_KEY, { totalMinutes: dailyGoalMinutes }) as { totalMinutes: number },
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `study-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage('백업 파일을 만들었습니다.');
  };

  const importData = async (file: File | undefined) => {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (!isBackupPayload(payload)) {
        setMessage('스터디 플래너 백업 파일 형식이 아닙니다.');
        return;
      }
      if (running) {
        setMessage('타이머를 종료한 뒤 복원할 수 있습니다.');
        return;
      }
      localStorage.setItem(SUBJECT_KEY, JSON.stringify(payload.data.subjects));
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload.data.sessions));
      localStorage.setItem(NOTE_KEY, JSON.stringify(payload.data.notes));
      localStorage.setItem(GOAL_KEY, JSON.stringify(payload.data.dailyGoal));
      localStorage.removeItem(TIMER_KEY);
      setMessage('백업을 복원했습니다.');
      onDataImported();
    } catch {
      setMessage('파일을 읽을 수 없습니다. JSON 백업 파일을 선택하세요.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearLocalData = () => {
    if (running) {
      setMessage('타이머를 종료한 뒤 초기화할 수 있습니다.');
      return;
    }
    if (!dangerConfirm) {
      setDangerConfirm(true);
      setMessage('한 번 더 누르면 이 브라우저의 학습 데이터가 삭제됩니다.');
      return;
    }
    [SUBJECT_KEY, SESSION_KEY, NOTE_KEY, GOAL_KEY, TIMER_KEY].forEach(key => localStorage.removeItem(key));
    setDangerConfirm(false);
    setMessage('로컬 데이터를 초기화했습니다.');
    onDataImported();
  };

  return (
    <div className="settings-page">
      <section className="settings-hero">
        <div>
          <p className="settings-kicker">local-first control</p>
          <h2>공부 기록은 사용자가 들고 있어야 합니다.</h2>
          <p>
            지금 버전은 브라우저 저장소를 기본으로 사용합니다. 서버가 없거나 로그인 동기화가 실패해도
            백업 파일로 기록을 옮기고 복구할 수 있습니다.
          </p>
        </div>
        <div className="settings-ledger" aria-label="현재 저장 상태">
          <span>{subjects.length}<small>과목</small></span>
          <span>{sessions.length}<small>세션</small></span>
          <span>{Math.round(dailyGoalMinutes / 60)}h<small>일일 목표</small></span>
        </div>
      </section>

      <section className="section-card settings-grid">
        <div>
          <h3 className="section-title">데이터 백업</h3>
          <p className="settings-copy">과목, 세션, 노트, 하루 목표를 JSON 파일로 저장합니다.</p>
        </div>
        <button className="btn-primary" onClick={exportData}>백업 내보내기</button>
      </section>

      <section className="section-card settings-grid">
        <div>
          <h3 className="section-title">데이터 복원</h3>
          <p className="settings-copy">다른 브라우저나 새 기기에서 백업 파일을 불러옵니다.</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="settings-file"
          onChange={event => importData(event.target.files?.[0])}
        />
      </section>

      <section className="section-card settings-grid danger-zone">
        <div>
          <h3 className="section-title">로컬 데이터 초기화</h3>
          <p className="settings-copy">이 브라우저에 저장된 학습 데이터를 삭제합니다. 먼저 백업을 권장합니다.</p>
        </div>
        <button className="btn-ghost danger-action" onClick={clearLocalData}>
          {dangerConfirm ? '삭제 확인' : '초기화'}
        </button>
      </section>

      {message && <p className="settings-message" role="status">{message}</p>}
    </div>
  );
}
