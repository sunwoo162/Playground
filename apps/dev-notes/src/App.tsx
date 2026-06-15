import { useState, useEffect } from 'react';
import type { Project } from './types';
import { getProjectsAsync } from './storage';
import { ProjectList } from './pages/ProjectList';
import { ProjectDetail } from './pages/ProjectDetail';
import './App.css';

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProjectsAsync().then((data) => {
      setProjects(data);
      setLoading(false);
    });
  }, []);

  const handleUpdate = (updated: Project) => {
    setProjects((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    setSelected(updated);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888' }}>
        불러오는 중...
      </div>
    );
  }

  if (selected) {
    return (
      <ProjectDetail
        project={selected}
        onBack={() => setSelected(null)}
        onUpdate={handleUpdate}
      />
    );
  }

  return (
    <ProjectList
      projects={projects}
      onProjectsChange={setProjects}
      onSelect={setSelected}
    />
  );
}

export default App;
