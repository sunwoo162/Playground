import { useState } from 'react';
import type { Project, TabType } from '../types';
import { updateProject } from '../storage';
import { FeatureSpec } from './tabs/FeatureSpec';
import { ApiSpec } from './tabs/ApiSpec';
import { UserAnalysis } from './tabs/UserAnalysis';

interface Props {
  project: Project;
  onBack: () => void;
  onUpdate: (project: Project) => void;
}

const TABS: { key: TabType; label: string; icon: string }[] = [
  { key: 'spec', label: '기능 명세서', icon: '📋' },
  { key: 'api', label: 'API 명세서', icon: '🔌' },
  { key: 'users', label: '사용자 분석', icon: '👥' },
];

export function ProjectDetail({ project, onBack, onUpdate }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('spec');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(project.title);

  const handleTabChange = <K extends keyof Project>(key: K, value: Project[K]) => {
    const updated = { ...project, [key]: value };
    updateProject(updated);
    onUpdate(updated);
  };

  const handleTitleSave = () => {
    if (!titleInput.trim()) return;
    const updated = { ...project, title: titleInput.trim() };
    updateProject(updated);
    onUpdate(updated);
    setEditingTitle(false);
  };

  return (
    <div className="page">
      <header className="detail-header">
        <button className="btn-back" onClick={onBack}>← 목록</button>
        <div className="detail-title-row">
          {editingTitle ? (
            <div className="title-edit-row">
              <input
                className="title-input"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') setEditingTitle(false); }}
                autoFocus
              />
              <button className="btn-primary btn-sm" onClick={handleTitleSave}>저장</button>
              <button className="btn-ghost btn-sm" onClick={() => setEditingTitle(false)}>취소</button>
            </div>
          ) : (
            <h1 className="detail-title" onClick={() => setEditingTitle(true)} title="클릭해서 수정">
              {project.title} <span className="edit-hint">✏️</span>
            </h1>
          )}
          {project.description && <p className="detail-desc">{project.description}</p>}
        </div>
      </header>

      <nav className="tab-nav">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            <span className="tab-count">
              {tab.key === 'spec' ? project.spec.length
                : tab.key === 'api' ? project.api.length
                : project.users.length}
            </span>
          </button>
        ))}
      </nav>

      <div className="tab-panel">
        {activeTab === 'spec' && (
          <FeatureSpec items={project.spec} onChange={(v) => handleTabChange('spec', v)} />
        )}
        {activeTab === 'api' && (
          <ApiSpec items={project.api} onChange={(v) => handleTabChange('api', v)} />
        )}
        {activeTab === 'users' && (
          <UserAnalysis items={project.users} onChange={(v) => handleTabChange('users', v)} />
        )}
      </div>
    </div>
  );
}
