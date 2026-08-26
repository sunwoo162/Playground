import { useState } from "react";

import "../ProjectRuntimePanel.css";
import {
  loadOrganizationRuntimeSettings,
  saveOrganizationRuntimeSettings,
  type OrganizationRuntimeSettings,
} from "../projectTeams/organization";
import { checkProjectRuntime, type ProjectRuntimePreflight } from "../projectTeams/runtime";

function statusLabel(value: boolean) {
  return value ? "준비" : "필요";
}

function readyValue(value: boolean) {
  return value ? "true" : "false";
}

export function ProjectRuntimePanel() {
  const [settings, setSettings] = useState<OrganizationRuntimeSettings>(() =>
    loadOrganizationRuntimeSettings(),
  );
  const [workspaceRoot, setWorkspaceRoot] = useState(settings.workspaceRoot);
  const [preflight, setPreflight] = useState<ProjectRuntimePreflight | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("BloomBouquet를 기본 프로젝트 Organization으로 사용합니다.");

  const saveSettings = () => {
    const nextSettings = saveOrganizationRuntimeSettings({
      ...settings,
      workspaceRoot,
    });
    setSettings(nextSettings);
    setWorkspaceRoot(nextSettings.workspaceRoot);
    setMessage("Organization Runtime 설정을 저장했습니다.");
  };

  const runPreflight = async () => {
    setChecking(true);
    try {
      const result = await checkProjectRuntime(settings.organization);
      setPreflight(result);
      setMessage(result.message);
    } catch (error) {
      setPreflight(null);
      setMessage(
        `Tauri Runtime 확인 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="project-runtime-panel-section">
      <span className="project-policy-label">GITHUB ORGANIZATION</span>
      <div className="project-runtime-org-row">
        <h3>{settings.organization}</h3>
        <span>연결 대상</span>
      </div>
      <p>
        프로젝트 저장소는 기본적으로 이 Organization에 만들고, Agent별 작업은 독립 branch/worktree에서 진행합니다.
      </p>

      <label className="project-runtime-field">
        <span>Workspace root</span>
        <input
          value={workspaceRoot}
          onChange={(event) => setWorkspaceRoot(event.target.value)}
          placeholder="C:\\Users\\user\\Documents\\luna-workspaces"
        />
      </label>

      <div className="project-runtime-rule">
        <span>release</span>
        <strong>{settings.releaseBranch}</strong>
      </div>
      <div className="project-runtime-rule">
        <span>integration</span>
        <strong>{settings.integrationBranch}</strong>
      </div>
      <div className="project-runtime-rule">
        <span>Agent branch</span>
        <strong>{settings.agentBranchPattern}</strong>
      </div>

      <div className="project-runtime-actions">
        <button type="button" onClick={saveSettings}>
          설정 저장
        </button>
        <button type="button" onClick={runPreflight} disabled={checking}>
          {checking ? "확인 중" : "Runtime 확인"}
        </button>
      </div>

      {preflight && (
        <div className="project-runtime-checks" aria-label="로컬 Runtime 사전 점검 결과">
          <div><span>Git</span><strong data-ready={readyValue(preflight.gitAvailable)}>{statusLabel(preflight.gitAvailable)}</strong></div>
          <div><span>GitHub CLI</span><strong data-ready={readyValue(preflight.ghAvailable)}>{statusLabel(preflight.ghAvailable)}</strong></div>
          <div><span>gh 인증</span><strong data-ready={readyValue(preflight.ghAuthenticated)}>{statusLabel(preflight.ghAuthenticated)}</strong></div>
          <div><span>Codex CLI</span><strong data-ready={readyValue(preflight.codexAvailable)}>{statusLabel(preflight.codexAvailable)}</strong></div>
          <div><span>Organization</span><strong data-ready={readyValue(preflight.organizationAccessible)}>{statusLabel(preflight.organizationAccessible)}</strong></div>
        </div>
      )}

      <p className="project-runtime-note">{message}</p>
    </section>
  );
}
