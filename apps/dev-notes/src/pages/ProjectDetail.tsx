import { useState, useEffect } from 'react';
import type { Project, TabType } from '../types';
import { updateProjectAsync } from '../storage';
import { ProjectOverview } from './tabs/ProjectOverview';
import { FeatureSpec } from './tabs/FeatureSpec';
import { ApiSpec } from './tabs/ApiSpec';
import { UserAnalysis } from './tabs/UserAnalysis';

interface SharedUser {
  userId: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

interface Friend {
  githubId: string;
  login: string;
  name: string;
  avatarUrl: string;
}

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
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingShare, setLoadingShare] = useState(false);

  useEffect(() => {
    if (showSharePanel) loadShareData();
  }, [showSharePanel]);

  const loadShareData = async () => {
    setLoadingShare(true);
    try {
      const [sharedRes, friendsRes] = await Promise.all([
        fetch(`/api/dev-notes/projects/${project.id}/share`, { credentials: 'include' }),
        fetch('/api/friends', { credentials: 'include' }),
      ]);
      if (sharedRes.ok) setSharedUsers(await sharedRes.json());
      if (friendsRes.ok) setFriends(await friendsRes.json());
    } finally {
      setLoadingShare(false);
    }
  };

  const handleShare = async (friendId: string) => {
    const res = await fetch(`/api/dev-notes/projects/${project.id}/share/${friendId}`, {
      method: 'POST', credentials: 'include',
    });
    if (res.ok) loadShareData();
  };

  const handleUnshare = async (userId: string) => {
    const res = await fetch(`/api/dev-notes/projects/${project.id}/share/${userId}`, {
      method: 'DELETE', credentials: 'include',
    });
    if (res.ok) loadShareData();
  };

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

  const overview = project.overview ?? {
    background: '', techStack: '', targetUsers: '', schedule: '', links: [],
  };

  // 이미 공유된 친구 ID 목록
  const sharedIds = sharedUsers.map(u => u.userId);
  // 공유 가능한 친구 (아직 공유 안 된)
  const sharableFriends = friends.filter(f => !sharedIds.includes(f.githubId));

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
        <div className="detail-header-actions">
          {/* 소유자만 공유 버튼 표시 */}
          {project.isOwner !== false && (
            <button
              className={`btn-share ${showSharePanel ? 'active' : ''}`}
              onClick={() => setShowSharePanel(!showSharePanel)}
            >
              👥 공유 {sharedUsers.length > 0 && <span className="share-count">{sharedUsers.length}</span>}
            </button>
          )}
          {/* 공유받은 프로젝트 표시 */}
          {project.isOwner === false && (
            <span className="share-badge">🤝 공유됨</span>
          )}
        </div>
      </header>

      {/* 공유 패널 */}
      {showSharePanel && (
        <div className="share-panel">
          <h3 className="share-panel-title">👥 프로젝트 공유</h3>

          {/* 현재 팀원 */}
          {sharedUsers.length > 0 && (
            <div className="share-section">
              <p className="share-label">현재 팀원</p>
              {sharedUsers.map(u => (
                <div key={u.userId} className="share-user-item">
                  {u.avatarUrl && <img src={u.avatarUrl} alt={u.login} className="share-avatar" />}
                  <span className="share-user-name">{u.name || u.login}</span>
                  <span className="share-user-login">@{u.login}</span>
                  {project.isOwner !== false && (
                    <button className="btn-text danger" onClick={() => handleUnshare(u.userId)}>제거</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 친구 추가 */}
          {project.isOwner !== false && (
            <div className="share-section">
              <p className="share-label">친구 추가</p>
              {loadingShare ? (
                <p className="share-empty">불러오는 중...</p>
              ) : sharableFriends.length === 0 ? (
                <p className="share-empty">
                  {friends.length === 0 ? '친구가 없어요. 먼저 친구를 추가해보세요.' : '모든 친구와 공유 중이에요.'}
                </p>
              ) : (
                sharableFriends.map(f => (
                  <div key={f.githubId} className="share-user-item">
                    <img src={f.avatarUrl} alt={f.login} className="share-avatar" />
                    <span className="share-user-name">{f.name || f.login}</span>
                    <span className="share-user-login">@{f.login}</span>
                    <button className="btn-primary btn-sm" onClick={() => handleShare(f.githubId)}>추가</button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

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
