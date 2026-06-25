import { useState } from 'react';
import type { Project, TabType } from '../types';
import { updateProjectAsync } from '../storage';
import { ProjectOverview } from './tabs/ProjectOverview';
import { FeatureSpec } from './tabs/FeatureSpec';
import { ApiSpec } from './tabs/ApiSpec';
import { UserAnalysis } from './tabs/UserAnalysis';

interface Props {
  project: Project;
  onBack: () => void;
  onUpdate: (project: Project) => void;
}

const TABS: { key: TabType; label: string; icon: string }[] = [
  { key: 'overview', label: '프로젝트 개요', icon: '🗂️' },
  { key: 'spec', label: '기능 명세서', icon: '📋' },
  { key: 'api', label: 'API 명세서', icon: '🔌' },
  { key: 'users', label: '사용자 분석', icon: '👥' },
];

export function ProjectDetail({ project, onBack, onUpdate }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(project.title);

  const save = (updated: Project) => {
    updateProjectAsync(updated);
    onUpdate(updated);
  };

  const handleTabChange = <K extends keyof Project>(key: K, value: Project[K]) => {
    save({ ...project, [key]: value });
  };

  const handleTitleSave = () => {
    if (!titleInput.trim()) return;
    save({ ...project, title: titleInput.trim() });
    setEditingTitle(false);
  };

  // 기존 프로젝트에 overview가 없을 경우 기본값
  const overview = project.overview ?? {
    background: '', techStack: '', targetUsers: '', schedule: '', links: [],
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSave();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
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
            {tab.key !== 'overview' && (
              <span className="tab-count">
                {tab.key === 'spec' ? project.spec.length
                  : tab.key === 'api' ? project.api.length
                  : project.users.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="tab-panel">
        {activeTab === 'overview' && (
          <ProjectOverview
            data={overview}
            title={project.title}
            description={project.description}
            createdAt={project.createdAt}
            updatedAt={project.updatedAt}
            onChange={(v) => handleTabChange('overview', v)}
            onDescriptionChange={(desc) => save({ ...project, description: desc })}
          />
        )}
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
