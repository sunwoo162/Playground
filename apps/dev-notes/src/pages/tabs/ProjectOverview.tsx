import { useState } from 'react';
import type { ProjectOverview as ProjectOverviewType, ProjectLink } from '../../types';

interface Props {
  data: ProjectOverviewType;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  onChange: (data: ProjectOverviewType) => void;
  onDescriptionChange: (desc: string) => void;
}

export function ProjectOverview({ data, description, createdAt, updatedAt, onChange, onDescriptionChange }: Props) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState(description);
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [showLinkForm, setShowLinkForm] = useState(false);

  const update = (key: keyof ProjectOverviewType, value: string | ProjectLink[]) => {
    onChange({ ...data, [key]: value });
  };

  const handleDescSave = () => {
    onDescriptionChange(descInput);
    setEditingDesc(false);
  };

  const addLink = () => {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    const link: ProjectLink = {
      id: crypto.randomUUID(),
      label: newLinkLabel.trim(),
      url: newLinkUrl.trim().startsWith('http') ? newLinkUrl.trim() : 'https://' + newLinkUrl.trim(),
    };
    onChange({ ...data, links: [...data.links, link] });
    setNewLinkLabel('');
    setNewLinkUrl('');
    setShowLinkForm(false);
  };

  const removeLink = (id: string) => {
    onChange({ ...data, links: data.links.filter((l) => l.id !== id) });
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="tab-content">
      {/* 프로젝트 메타 */}
      <div className="overview-meta-card">
        <div className="overview-meta-row">
          <span className="overview-meta-label">📅 생성일</span>
          <span className="overview-meta-value">{formatDate(createdAt)}</span>
        </div>
        <div className="overview-meta-row">
          <span className="overview-meta-label">🔄 수정일</span>
          <span className="overview-meta-value">{formatDate(updatedAt)}</span>
        </div>
      </div>

      {/* 프로젝트 설명 */}
      <div className="overview-section">
        <div className="overview-section-header">
          <h4 className="overview-section-title">📝 프로젝트 설명</h4>
          {!editingDesc && (
            <button className="btn-text" onClick={() => { setDescInput(description); setEditingDesc(true); }}>수정</button>
          )}
        </div>
        {editingDesc ? (
          <div className="overview-edit-block">
            <textarea
              className="overview-textarea"
              value={descInput}
              onChange={(e) => setDescInput(e.target.value)}
              rows={3}
              placeholder="프로젝트 설명"
              autoFocus
            />
            <div className="form-actions">
              <button className="btn-primary btn-sm" onClick={handleDescSave}>저장</button>
              <button className="btn-ghost btn-sm" onClick={() => setEditingDesc(false)}>취소</button>
            </div>
          </div>
        ) : (
          <p className="overview-text">{description || '설명을 추가해보세요.'}</p>
        )}
      </div>

      {/* 배경/목적 */}
      <OverviewField
        icon="🎯"
        label="배경 및 목적"
        value={data.background}
        placeholder="이 프로젝트를 왜 만드는지, 어떤 문제를 해결하는지"
        onChange={(v) => update('background', v)}
      />

      {/* 기술 스택 */}
      <OverviewField
        icon="🛠️"
        label="기술 스택"
        value={data.techStack}
        placeholder="예: React, TypeScript, Node.js, PostgreSQL"
        onChange={(v) => update('techStack', v)}
      />

      {/* 타겟 사용자 */}
      <OverviewField
        icon="🎯"
        label="타겟 사용자"
        value={data.targetUsers}
        placeholder="예: 20~30대 직장인, 개발자"
        onChange={(v) => update('targetUsers', v)}
      />

      {/* 일정 */}
      <OverviewField
        icon="📆"
        label="개발 일정"
        value={data.schedule}
        placeholder="예: 2024.01 ~ 2024.03 (3개월)"
        onChange={(v) => update('schedule', v)}
      />

      {/* 관련 링크 */}
      <div className="overview-section">
        <div className="overview-section-header">
          <h4 className="overview-section-title">🔗 관련 링크</h4>
          {!showLinkForm && (
            <button className="btn-text" onClick={() => setShowLinkForm(true)}>+ 추가</button>
          )}
        </div>
        {showLinkForm && (
          <div className="link-form">
            <input
              type="text"
              className="overview-input"
              value={newLinkLabel}
              onChange={(e) => setNewLinkLabel(e.target.value)}
              placeholder="이름 (예: GitHub, Figma)"
            />
            <input
              type="text"
              className="overview-input"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              placeholder="URL"
              onKeyDown={(e) => e.key === 'Enter' && addLink()}
            />
            <div className="form-actions">
              <button className="btn-primary btn-sm" onClick={addLink}>추가</button>
              <button className="btn-ghost btn-sm" onClick={() => setShowLinkForm(false)}>취소</button>
            </div>
          </div>
        )}
        <div className="link-list">
          {data.links.length === 0 && !showLinkForm && (
            <span className="overview-empty">링크를 추가해보세요.</span>
          )}
          {data.links.map((link) => (
            <div key={link.id} className="link-item">
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="link-anchor">
                🔗 {link.label}
              </a>
              <button className="btn-text danger" onClick={() => removeLink(link.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* 공통 텍스트 편집 필드 */
interface FieldProps {
  icon: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

function OverviewField({ icon, label, value, placeholder, onChange }: FieldProps) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(value);

  const save = () => {
    onChange(input);
    setEditing(false);
  };

  return (
    <div className="overview-section">
      <div className="overview-section-header">
        <h4 className="overview-section-title">{icon} {label}</h4>
        {!editing && (
          <button className="btn-text" onClick={() => { setInput(value); setEditing(true); }}>수정</button>
        )}
      </div>
      {editing ? (
        <div className="overview-edit-block">
          <textarea
            className="overview-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            placeholder={placeholder}
            autoFocus
          />
          <div className="form-actions">
            <button className="btn-primary btn-sm" onClick={save}>저장</button>
            <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}>취소</button>
          </div>
        </div>
      ) : (
        <p className="overview-text">{value || <span className="overview-empty">{placeholder}</span>}</p>
      )}
    </div>
  );
}
