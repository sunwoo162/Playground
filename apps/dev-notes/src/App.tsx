import { useState } from 'react';
import type { Project } from './types';
import { getProjects } from './storage';
import { ProjectList } from './pages/ProjectList';
import { ProjectDetail } from './pages/ProjectDetail';
import './App.css';

function App() {
  const [projects, setProjects] = useState<Project[]>(getProjects);
  const [selected, setSelected] = useState<Project | null>(null);

  const handleUpdate = (updated: Project) => {
    setProjects((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    setSelected(updated);
  };

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
