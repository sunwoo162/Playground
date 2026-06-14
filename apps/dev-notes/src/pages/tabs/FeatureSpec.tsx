import { useState } from 'react';
import type { FeatureSpec as FeatureSpecType } from '../../types';

interface Props {
  items: FeatureSpecType[];
  onChange: (items: FeatureSpecType[]) => void;
}

const PRIORITIES = ['high', 'medium', 'low'] as const;
const STATUSES = ['planned', 'in-progress', 'done'] as const;

const priorityLabel: Record<string, string> = { high: '🔴 높음', medium: '🟡 보통', low: '🟢 낮음' };
const statusLabel: Record<string, string> = { planned: '📋 예정', 'in-progress': '⚡ 진행중', done: '✅ 완료' };

export function FeatureSpec({ items, onChange }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<FeatureSpecType['priority']>('medium');
  const [status, setStatus] = useState<FeatureSpecType['status']>('planned');

  const resetForm = () => {
    setTitle(''); setDescription('');
    setPriority('medium'); setStatus('planned');
    setEditId(null); setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (editId) {
      onChange(items.map((i) => i.id === editId ? { ...i, title: title.trim(), description: description.trim(), priority, status } : i));
    } else {
      const newItem: FeatureSpecType = {
        id: crypto.randomUUID(),
        title: title.trim(),
        description: description.trim(),
        priority,
        status,
      };
      onChange([...items, newItem]);
    }
    resetForm();
  };

  const startEdit = (item: FeatureSpecType) => {
    setEditId(item.id);
    setTitle(item.title);
    setDescription(item.description);
    setPriority(item.priority);
    setStatus(item.status);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    onChange(items.filter((i) => i.id !== id));
  };

  return (
    <div className="tab-content">
      <div className="tab-content-header">
        <h3 className="tab-section-title">기능 명세서</h3>
        {!showForm && (
          <button className="btn-primary btn-sm" onClick={() => setShowForm(true)}>+ 기능 추가</button>
        )}
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>기능명 *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 회원가입" autoFocus required />
          </div>
          <div className="form-row">
            <label>설명</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="기능 상세 설명" rows={2} />
          </div>
          <div className="form-row-inline">
            <div className="form-row">
              <label>우선순위</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as FeatureSpecType['priority'])}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{priorityLabel[p]}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>상태</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as FeatureSpecType['status'])}>
                {STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary btn-sm">{editId ? '수정' : '추가'}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={resetForm}>취소</button>
          </div>
        </form>
      )}

      {items.length === 0 && !showForm && (
        <div className="empty-state-sm">아직 기능이 없어요. 추가해보세요.</div>
      )}

      <div className="spec-list">
        {items.map((item) => (
          <div key={item.id} className="spec-item">
            <div className="spec-item-header">
              <span className="spec-title">{item.title}</span>
              <div className="spec-badges">
                <span className={`badge priority-${item.priority}`}>{priorityLabel[item.priority]}</span>
                <span className={`badge status-${item.status}`}>{statusLabel[item.status]}</span>
              </div>
            </div>
            {item.description && <p className="spec-desc">{item.description}</p>}
            <div className="item-actions">
              <button className="btn-text" onClick={() => startEdit(item)}>수정</button>
              <button className="btn-text danger" onClick={() => handleDelete(item.id)}>삭제</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
