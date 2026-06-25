import { useState } from 'react';
import type { Project } from '../types';
import { createProjectAsync, deleteProjectAsync } from '../storage';
import { ConfirmModal } from '../components/ConfirmModal';

interface Props {
  projects: Project[];
  onProjectsChange: (projects: Project[]) => void;
  onSelect: (project: Project) => void;
}

export function ProjectList({ projects, onProjectsChange, onSelect }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const project = await createProjectAsync(title.trim(), description.trim());
      onProjectsChange([project, ...projects]);
      setTitle('');
      setDescription('');
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteProjectAsync(id);
    onProjectsChange(projects.filter((p) => p.id !== id));
    setDeleteTarget(null);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">📒 개발자 노트</h1>
          <p className="page-subtitle">프로젝트별 기능명세, API, 사용자 분석을 한 곳에</p>
        </div>
        {!showForm && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + 프로젝트 추가
          </button>
        )}
      </header>

      {showForm && (
        <form className="create-form" onSubmit={handleCreate}>
          <h2 className="form-title">새 프로젝트</h2>
          <div className="form-row">
            <label htmlFor="proj-title">프로젝트 이름 *</label>
            <input
              id="proj-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 쇼핑몰 앱"
              autoFocus
              required
            />
          </div>
          <div className="form-row">
            <label htmlFor="proj-desc">설명</label>
            <textarea
              id="proj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="프로젝트에 대한 간단한 설명"
              rows={3}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? '저장 중...' : '만들기'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>취소</button>
          </div>
        </form>
      )}

      {projects.length === 0 && !showForm && (
        <div className="empty-state">
          <p className="empty-icon">📂</p>
          <p>아직 프로젝트가 없어요.</p>
          <p className="empty-sub">+ 프로젝트 추가 버튼으로 시작해보세요.</p>
        </div>
      )}

      <div className="projects-grid">
        {projects.map((project) => (
          <div
            key={project.id}
            className="project-card"
            onClick={() => onSelect(project)}
          >
            <div className="project-card-body">
              <h2 className="project-card-title">{project.title}</h2>
              {project.description && (
                <p className="project-card-desc">{project.description}</p>
              )}
              <div className="project-card-meta">
                <span className="meta-badge">기능 {project.spec.length}</span>
                <span className="meta-badge">API {project.api.length}</span>
                <span className="meta-badge">유저 {project.users.length}</span>
              </div>
            </div>
            <div className="project-card-footer">
              <span className="project-date">{formatDate(project.updatedAt)}</span>
              <button
                className="btn-icon-delete"
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(project.id); }}
                aria-label="삭제"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <ConfirmModal
          message="이 프로젝트를 정말 삭제할까요? 모든 내용이 사라져요."
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
