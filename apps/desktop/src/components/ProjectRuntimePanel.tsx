import { useState } from "react";

import "../ProjectRuntimePanel.css";
import {
  loadOrganizationRuntimeSettings,
  saveOrganizationRuntimeSettings,
  type OrganizationRuntimeSettings,
} from "../projectTeams/organization";
import {
  checkRemoteRunner,
  loadRemoteRunnerSettings,
  saveRemoteRunnerSettings,
  setRemoteRunnerSessionToken,
  type RemoteRunnerHealth,
  type RemoteRunnerSettings,
} from "../projectTeams/remoteRunner";
import { checkProjectRuntime, type ProjectRuntimePreflight } from "../projectTeams/runtime";
import { TeamPerformanceOverview } from "./TeamPerformanceOverview";

function statusLabel(value: boolean) {
  return value ? "준비" : "필요";
}

function readyValue(value: boolean) {
  return value ? "true" : "false";
}

function codexAuthLabel(preflight: ProjectRuntimePreflight) {
  if (!preflight.codexAuthenticated) return "로그인 필요";
  if (!preflight.codexChatgptAuth) return "API 인증 차단";
  return "ChatGPT";
}

export function ProjectRuntimePanel() {
  const [settings, setSettings] = useState<OrganizationRuntimeSettings>(() =>
    loadOrganizationRuntimeSettings(),
  );
  const [workspaceRoot, setWorkspaceRoot] = useState(settings.workspaceRoot);
  const [runnerSettings, setRunnerSettings] = useState<RemoteRunnerSettings>(() =>
    loadRemoteRunnerSettings(),
  );
  const [runnerUrl, setRunnerUrl] = useState(runnerSettings.baseUrl);
  const [runnerToken, setRunnerToken] = useState("");
  const [preflight, setPreflight] = useState<ProjectRuntimePreflight | null>(null);
  const [runnerHealth, setRunnerHealth] = useState<RemoteRunnerHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkingRunner, setCheckingRunner] = useState(false);
  const [message, setMessage] = useState("BloomBouquet를 기본 프로젝트 Organization으로 사용합니다.");
  const [runnerMessage, setRunnerMessage] = useState("Remote 모드에서는 PM 계획 이후 Agent DAG를 항상 켜진 Runner로 넘깁니다.");

  const saveSettings = () => {
    const nextSettings = saveOrganizationRuntimeSettings({
      ...settings,
      workspaceRoot,
    });
    const nextRunnerSettings = saveRemoteRunnerSettings({
      ...runnerSettings,
      baseUrl: runnerUrl,
    });
    setRemoteRunnerSessionToken(runnerToken);
    setSettings(nextSettings);
    setWorkspaceRoot(nextSettings.workspaceRoot);
    setRunnerSettings(nextRunnerSettings);
    setRunnerUrl(nextRunnerSettings.baseUrl);
    setMessage("Organization Runtime 설정을 저장했습니다.");
    setRunnerMessage(
      runnerToken.trim()
        ? "Runner URL/모드를 저장했고 토큰은 현재 앱 세션 메모리에만 적용했습니다."
        : "Runner URL/모드를 저장했습니다. Remote 실행 전 토큰을 입력해야 합니다.",
    );
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

  const runRemotePreflight = async () => {
    setCheckingRunner(true);
    try {
      const nextRunnerSettings = saveRemoteRunnerSettings({
        ...runnerSettings,
        baseUrl: runnerUrl,
      });
      setRemoteRunnerSessionToken(runnerToken);
      setRunnerSettings(nextRunnerSettings);
      setRunnerUrl(nextRunnerSettings.baseUrl);
      const health = await checkRemoteRunner(nextRunnerSettings);
      setRunnerHealth(health);
      setRunnerMessage(
        health.workerConfigured
          ? `Runner 연결 완료 · queue ${health.queuedJobs} · Worker 준비됨`
          : "Runner에는 연결됐지만 LUNA_RUNNER_WORKER가 설정되지 않았습니다.",
      );
    } catch (error) {
      setRunnerHealth(null);
      setRunnerMessage(
        `Remote Runner 확인 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setCheckingRunner(false);
    }
  };

  return (
    <>
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
            {checking ? "확인 중" : "Local 확인"}
          </button>
        </div>

        {preflight && (
          <div className="project-runtime-checks" aria-label="로컬 Runtime 사전 점검 결과">
            <div><span>Git</span><strong data-ready={readyValue(preflight.gitAvailable)}>{statusLabel(preflight.gitAvailable)}</strong></div>
            <div><span>GitHub CLI</span><strong data-ready={readyValue(preflight.ghAvailable)}>{statusLabel(preflight.ghAvailable)}</strong></div>
            <div><span>gh 인증</span><strong data-ready={readyValue(preflight.ghAuthenticated)}>{statusLabel(preflight.ghAuthenticated)}</strong></div>
            <div><span>Codex CLI</span><strong data-ready={readyValue(preflight.codexAvailable)}>{statusLabel(preflight.codexAvailable)}</strong></div>
            <div><span>Codex 인증</span><strong data-ready={readyValue(preflight.codexChatgptAuth)}>{codexAuthLabel(preflight)}</strong></div>
            <div><span>Organization</span><strong data-ready={readyValue(preflight.organizationAccessible)}>{statusLabel(preflight.organizationAccessible)}</strong></div>
          </div>
        )}

        <p className="project-runtime-note">{message}</p>
      </section>

      <section className="project-runtime-panel-section project-remote-runtime-section">
        <span className="project-policy-label">EXECUTION LOCATION</span>
        <div className="project-runtime-mode" role="group" aria-label="Agent 실행 위치">
          <button
            type="button"
            className={runnerSettings.mode === "local" ? "active" : ""}
            onClick={() => setRunnerSettings((current) => ({ ...current, mode: "local" }))}
          >
            Local
          </button>
          <button
            type="button"
            className={runnerSettings.mode === "remote" ? "active" : ""}
            onClick={() => setRunnerSettings((current) => ({ ...current, mode: "remote" }))}
          >
            Remote
          </button>
        </div>

        <label className="project-runtime-field">
          <span>Runner URL</span>
          <input
            value={runnerUrl}
            onChange={(event) => setRunnerUrl(event.target.value)}
            placeholder="https://runner.example.com"
          />
        </label>

        <label className="project-runtime-field">
          <span>Session token · 저장되지 않음</span>
          <input
            type="password"
            value={runnerToken}
            onChange={(event) => {
              setRunnerToken(event.target.value);
              setRemoteRunnerSessionToken(event.target.value);
            }}
            autoComplete="off"
            placeholder="LUNA_RUNNER_TOKEN"
          />
        </label>

        <div className="project-runtime-actions">
          <button type="button" onClick={saveSettings}>
            모드 저장
          </button>
          <button type="button" onClick={runRemotePreflight} disabled={checkingRunner}>
            {checkingRunner ? "확인 중" : "Runner 확인"}
          </button>
        </div>

        {runnerHealth && (
          <div className="project-runtime-checks" aria-label="Remote Runner 사전 점검 결과">
            <div><span>Runner</span><strong data-ready={readyValue(runnerHealth.ok)}>{statusLabel(runnerHealth.ok)}</strong></div>
            <div><span>Protocol</span><strong data-ready={readyValue(runnerHealth.protocolVersion === 1)}>v{runnerHealth.protocolVersion}</strong></div>
            <div><span>Worker</span><strong data-ready={readyValue(runnerHealth.workerConfigured)}>{statusLabel(runnerHealth.workerConfigured)}</strong></div>
            <div><span>Queue</span><strong data-ready="true">{runnerHealth.queuedJobs}</strong></div>
          </div>
        )}

        <p className="project-runtime-note">{runnerMessage}</p>
      </section>

      <TeamPerformanceOverview />
    </>
  );
}
