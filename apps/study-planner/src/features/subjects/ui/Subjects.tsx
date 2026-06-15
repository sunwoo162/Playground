import { useState } from 'react';
import type { Subject } from '../../../entities/subject';
import {
  createSubjectAsync, updateSubjectAsync, deleteSubjectAsync, saveDailyGoalAsync,
  getDailyGoal,
} from '../../../entities/subject';
import { formatDuration, SUBJECT_COLORS } from '../../../shared/lib';

interface Props {
  subjects: Subject[];
  onSubjectsChange: (subjects: Subject[]) => void;
  onGoalChange: (minutes: number) => void;
}

export function Subjects({ subjects, onSubjectsChange, onGoalChange }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
  const [goalHour, setGoalHour] = useState(2);
  const [goalMin, setGoalMin] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);
  const [dailyGoalMins, setDailyGoalMins] = useState(getDailyGoal().totalMinutes);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(Math.floor(getDailyGoal().totalMinutes / 60)));
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName(''); setColor(SUBJECT_COLORS[0]);
    setGoalHour(2); setGoalMin(0);
    setEditId(null); setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    const goalMins = goalHour * 60 + goalMin;
    try {
      if (editId) {
        const updated = { id: editId, name: name.trim(), color, dailyGoalMinutes: goalMins };
        await updateSubjectAsync(updated);
        onSubjectsChange(subjects.map(s => s.id === editId ? updated : s));
      } else {
        const newSubject = await createSubjectAsync(name.trim(), color, goalMins);
        onSubjectsChange([...subjects, newSubject]);
      }
    } finally {
      setSaving(false);
      resetForm();
    }
  };

  const startEdit = (s: Subject) => {
    setEditId(s.id); setName(s.name); setColor(s.color);
    setGoalHour(Math.floor(s.dailyGoalMinutes / 60));
    setGoalMin(s.dailyGoalMinutes % 60);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    await deleteSubjectAsync(id);
    onSubjectsChange(subjects.filter(s => s.id !== id));
  };

  const saveGoal = async () => {
    const mins = parseInt(goalInput) * 60;
    if (isNaN(mins) || mins <= 0) return;
    await saveDailyGoalAsync(mins);
    setDailyGoalMins(mins);
    onGoalChange(mins);
    setEditingGoal(false);
  };

  return (
    <div className="subjects-page">
      {/* 하루 목표 */}
      <div className="section-card">
        <div className="section-header">
          <h3 className="section-title">🎯 하루 목표 시간</h3>
          {!editingGoal && <button className="btn-text" onClick={() => setEditingGoal(true)}>수정</button>}
        </div>
        {editingGoal ? (
          <div className="goal-edit-row">
            <input type="number" className="goal-input" value={goalInput}
              onChange={e => setGoalInput(e.target.value)} min={1} max={24} />
            <span>시간</span>
            <button className="btn-primary btn-sm" onClick={saveGoal}>저장</button>
            <button className="btn-ghost btn-sm" onClick={() => setEditingGoal(false)}>취소</button>
          </div>
        ) : (
          <p className="goal-display">{formatDuration(dailyGoalMins * 60)}</p>
        )}
      </div>

      {/* 과목 관리 */}
      <div className="section-card">
        <div className="section-header">
          <h3 className="section-title">📚 과목 관리</h3>
          {!showForm && <button className="btn-primary btn-sm" onClick={() => setShowForm(true)}>+ 과목 추가</button>}
        </div>

        {showForm && (
          <form className="subject-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <label>과목명 *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="예: 수학, 영어, 코딩" autoFocus required />
            </div>
            <div className="form-row">
              <label>색상</label>
              <div className="color-picker">
                {SUBJECT_COLORS.map(c => (
                  <button key={c} type="button"
                    className={`color-dot ${color === c ? 'selected' : ''}`}
                    style={{ backgroundColor: c }} onClick={() => setColor(c)} />
                ))}
              </div>
            </div>
            <div className="form-row">
              <label>하루 목표</label>
              <div className="goal-time-row">
                <select value={goalHour} onChange={e => setGoalHour(Number(e.target.value))}>
                  {Array.from({ length: 13 }, (_, i) => <option key={i} value={i}>{i}시간</option>)}
                </select>
                <select value={goalMin} onChange={e => setGoalMin(Number(e.target.value))}>
                  {[0, 10, 20, 30, 40, 50].map(m => <option key={m} value={m}>{m}분</option>)}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary btn-sm" disabled={saving}>
                {saving ? '저장 중...' : (editId ? '수정' : '추가')}
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={resetForm}>취소</button>
            </div>
          </form>
        )}

        <div className="subject-list">
          {subjects.length === 0 && !showForm && (
            <p className="empty-text">과목을 추가해서 공부를 시작해보세요!</p>
          )}
          {subjects.map(s => (
            <div key={s.id} className="subject-item">
              <div className="subject-item-left">
                <span className="subject-color-block" style={{ backgroundColor: s.color }} />
                <div>
                  <div className="subject-item-name">{s.name}</div>
                  {s.dailyGoalMinutes > 0 && (
                    <div className="subject-item-goal">목표: {formatDuration(s.dailyGoalMinutes * 60)}</div>
                  )}
                </div>
              </div>
              <div className="subject-item-actions">
                <button className="btn-text" onClick={() => startEdit(s)}>수정</button>
                <button className="btn-text danger" onClick={() => handleDelete(s.id)}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
