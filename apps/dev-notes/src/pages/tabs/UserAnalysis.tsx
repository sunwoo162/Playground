import { useState } from 'react';
import type { UserAnalysis as UserAnalysisType } from '../../types';

interface Props {
  items: UserAnalysisType[];
  onChange: (items: UserAnalysisType[]) => void;
}

export function UserAnalysis({ items, onChange }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [persona, setPersona] = useState('');
  const [goal, setGoal] = useState('');
  const [painPoint, setPainPoint] = useState('');

  const resetForm = () => {
    setPersona(''); setGoal(''); setPainPoint('');
    setEditId(null); setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!persona.trim()) return;

    const data: UserAnalysisType = {
      id: editId ?? crypto.randomUUID(),
      persona: persona.trim(),
      goal: goal.trim(),
      painPoint: painPoint.trim(),
    };

    if (editId) {
      onChange(items.map((i) => i.id === editId ? data : i));
    } else {
      onChange([...items, data]);
    }
    resetForm();
  };

  const startEdit = (item: UserAnalysisType) => {
    setEditId(item.id);
    setPersona(item.persona);
    setGoal(item.goal);
    setPainPoint(item.painPoint);
    setShowForm(true);
  };

  return (
    <div className="tab-content">
      <div className="tab-content-header">
        <h3 className="tab-section-title">사용자 분석</h3>
        {!showForm && (
          <button className="btn-primary btn-sm" onClick={() => setShowForm(true)}>+ 페르소나 추가</button>
        )}
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>페르소나 *</label>
            <input
              type="text"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="예: 20대 직장인"
              autoFocus
              required
            />
          </div>
          <div className="form-row">
            <label>🎯 목표 (Goal)</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="이 사용자가 원하는 것은?"
              rows={2}
            />
          </div>
          <div className="form-row">
            <label>😣 페인 포인트 (Pain Point)</label>
            <textarea
              value={painPoint}
              onChange={(e) => setPainPoint(e.target.value)}
              placeholder="이 사용자가 겪는 불편함은?"
              rows={2}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary btn-sm">{editId ? '수정' : '추가'}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={resetForm}>취소</button>
          </div>
        </form>
      )}

      {items.length === 0 && !showForm && (
        <div className="empty-state-sm">아직 페르소나가 없어요. 추가해보세요.</div>
      )}

      <div className="user-list">
        {items.map((item) => (
          <div key={item.id} className="user-card">
            <div className="user-card-header">
              <span className="user-persona">👤 {item.persona}</span>
              <div className="item-actions">
                <button className="btn-text" onClick={() => startEdit(item)}>수정</button>
                <button className="btn-text danger" onClick={() => onChange(items.filter((i) => i.id !== item.id))}>삭제</button>
              </div>
            </div>
            {item.goal && (
              <div className="user-field">
                <span className="user-field-label">🎯 목표</span>
                <p>{item.goal}</p>
              </div>
            )}
            {item.painPoint && (
              <div className="user-field">
                <span className="user-field-label">😣 페인포인트</span>
                <p>{item.painPoint}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
