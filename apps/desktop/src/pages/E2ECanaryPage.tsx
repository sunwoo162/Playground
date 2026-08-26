import { useState } from "react";

import { E2ECanaryPanel } from "../components/E2ECanaryPanel";
import type { LunaPage } from "../components/Sidebar";
import { analyzeProjectIntake } from "../projectTeams/intakeRuntime";
import { loadOrganizationRuntimeSettings } from "../projectTeams/organization";
import { startProjectWithIntake } from "../projectTeams/projectIntakeState";
import { getTeamName, loadProjectTeamsState } from "../projectTeams/store";
import type { ProjectTeamsState } from "../projectTeams/types";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function E2ECanaryPage({ onChangePage }: { onChangePage: (page: LunaPage) => void }) {
  const [state, setState] = useState<ProjectTeamsState>(() => loadProjectTeamsState());
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState(
    "PulseNote Canary는 실제 Organization Intake와 팀 배정을 만든 뒤 Project Teams의 기존 PM/Agent Runtime으로 이어집니다.",
  );

  const startCanary = async (request: string) => {
    if (running) return;
    const runtimeSettings = loadOrganizationRuntimeSettings();
    if (!runtimeSettings.workspaceRoot.trim()) {
      setMessage("Project Teams Runtime에서 Workspace root를 먼저 설정해 주세요.");
      return;
    }

    setRunning(true);
    setMessage("E2E Canary Organization Intake 실행 중 · 실제 요구사항 분석 후 대기 팀을 배정합니다.");

    try {
      const intake = await analyzeProjectIntake({
        organization: runtimeSettings.organization,
        workspaceRoot: runtimeSettings.workspaceRoot,
        request,
      });
      const currentState = loadProjectTeamsState();
      const result = startProjectWithIntake(currentState, request, intake);
      setState(result.state);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      const teamName = getTeamName(result.state, result.project.teamId);
      setMessage(
        `E2E Canary 생성 완료 · ${teamName}팀 배정 · Project Teams에서 PM Runtime 실행을 누르면 PM → Agent → PR → 회고/Evolution 전체 체인이 이어집니다.`,
      );
      onChangePage("project-teams");
    } catch (error) {
      setMessage(`E2E Canary 시작 실패: ${errorMessage(error)}`);
    } finally {
      setRunning(false);
    }
  };

  const refresh = () => {
    setState(loadProjectTeamsState());
    setMessage("최신 Project Teams 상태에서 E2E evidence를 다시 계산했습니다.");
  };

  return (
    <div className="project-teams-page">
      <header className="project-teams-header">
        <div>
          <span className="project-teams-kicker">LIVE E2E CANARY</span>
          <h1>Luna 전체 흐름 증명</h1>
          <p>작은 실제 full-stack 제품 하나로 Intake부터 Team Evolution까지 같은 production Runtime을 끝까지 통과시키고 단계별 evidence를 확인합니다.</p>
        </div>
        <div className="project-teams-runtime">
          <span className="project-teams-runtime-dot" />
          <div>
            <strong>{running ? "Canary Intake 실행 중" : "실제 Runtime 사용"}</strong>
            <span>mock orchestration이 아니라 기존 ChatGPT Codex + gh + BloomBouquet 경로를 사용</span>
          </div>
        </div>
      </header>

      <div className="project-command-message" role="status">{message}</div>

      <div className="project-teams-layout">
        <section className="project-team-panel">
          <E2ECanaryPanel
            state={state}
            busy={running}
            onStart={startCanary}
            onSelectProject={() => onChangePage("project-teams")}
          />
        </section>

        <aside className="project-policy-panel">
          <section>
            <span className="project-policy-label">CANARY PRODUCT</span>
            <h3>PulseNote</h3>
            <p>React UI + backend HTTP API + SQLite persistence를 가진 작은 노트 CRUD 제품입니다. auth·결제·외부 API를 제외해 Runtime 자체의 실패를 제품 복잡도와 구분합니다.</p>
          </section>

          <section>
            <span className="project-policy-label">PASS CRITERIA</span>
            <h3>12단계 모두 PASS</h3>
            <p>Intake, 팀 배정, PM/repository, Frontend+Backend, Data & Marketing, Documentation, Code Review, Reviewer, QA, develop 통합, 회고, Team Evolution이 모두 실제 state/evidence로 완료되어야 PASS입니다.</p>
          </section>

          <section>
            <span className="project-policy-label">IMPORTANT</span>
            <h3>CI와 E2E를 구분</h3>
            <p>Harness 성공만으로 Canary PASS 처리하지 않습니다. 로컬 Codex 로그인, gh 인증, BloomBouquet repository/branch/PR, 실제 Agent 결과가 Project Teams state에 남아야 합니다.</p>
          </section>

          <button className="project-reset-button" type="button" disabled={running} onClick={refresh}>
            E2E 상태 새로고침
          </button>
        </aside>
      </div>
    </div>
  );
}
