import { FormEvent, useMemo, useState } from "react";

import { MarketDiscoveryPanel } from "../components/MarketDiscoveryPanel";
import type { LunaPage } from "../components/Sidebar";
import { analyzeProjectIntake } from "../projectTeams/intakeRuntime";
import {
  buildDiscoveryProjectRequest,
  loadMarketDiscoveries,
  runMarketDiscovery,
  type ProductIdea,
  type StoredMarketDiscovery,
} from "../projectTeams/marketDiscovery";
import { loadOrganizationRuntimeSettings } from "../projectTeams/organization";
import { startProjectWithIntake } from "../projectTeams/projectIntakeState";
import { getTeamName, loadProjectTeamsState } from "../projectTeams/store";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function MarketDiscoveryPage({ onChangePage }: { onChangePage: (page: LunaPage) => void }) {
  const stored = useMemo(() => loadMarketDiscoveries(), []);
  const [topic, setTopic] = useState("");
  const [latestDiscovery, setLatestDiscovery] = useState<StoredMarketDiscovery | null>(stored[0] ?? null);
  const [runningDiscovery, setRunningDiscovery] = useState(false);
  const [startingProject, setStartingProject] = useState(false);
  const [message, setMessage] = useState(
    stored[0]
      ? `최근 Market Discovery ${stored[0].discoveryId}를 불러왔습니다.`
      : "시장이나 사용자 문제 영역을 입력하면 Data & Marketing → Idea Agent 순서로 조사합니다.",
  );

  const busy = runningDiscovery || startingProject;

  const handleDiscover = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    const runtimeSettings = loadOrganizationRuntimeSettings();
    if (!runtimeSettings.workspaceRoot.trim()) {
      setMessage("Project Teams Runtime에서 Workspace root를 먼저 설정해 주세요.");
      return;
    }
    if (!topic.trim()) {
      setMessage("시장 탐색 주제를 입력해 주세요. 예: 학생 일정 조율, 리뷰 신뢰성, 지역 이동 불편");
      return;
    }

    setRunningDiscovery(true);
    setMessage("organization:data-marketing이 현재 공개 웹 근거를 조사 중입니다. 이후 organization:idea가 프로젝트 후보를 독립 생성합니다.");
    try {
      const discovery = await runMarketDiscovery(runtimeSettings, topic);
      setLatestDiscovery(discovery);
      setMessage(
        `시장 탐색 완료 · 공개 출처 ${discovery.market.sources.length}개 · 프로젝트 후보 ${discovery.portfolio.ideas.length}개 · 추천 ${discovery.portfolio.recommendedIdeaId}`,
      );
    } catch (error) {
      setMessage(`Market Discovery 실패: ${errorMessage(error)}`);
    } finally {
      setRunningDiscovery(false);
    }
  };

  const startIdeaProject = async (idea: ProductIdea) => {
    if (!latestDiscovery || busy) return;
    const runtimeSettings = loadOrganizationRuntimeSettings();
    if (!runtimeSettings.workspaceRoot.trim()) {
      setMessage("Workspace root를 먼저 설정해 주세요.");
      return;
    }

    const request = buildDiscoveryProjectRequest(latestDiscovery, idea);
    setStartingProject(true);
    setMessage(`${idea.title} 선택 · Organization Project Intake가 시장 근거와 제품 범위를 다시 검증 중입니다.`);

    try {
      const intake = await analyzeProjectIntake({
        organization: runtimeSettings.organization,
        workspaceRoot: runtimeSettings.workspaceRoot,
        request,
      });
      const currentState = loadProjectTeamsState();
      const result = startProjectWithIntake(currentState, request, intake);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      const teamName = getTeamName(result.state, result.project.teamId);
      setMessage(
        `${idea.title} 프로젝트 생성 · ${teamName}팀 배정 · Project Teams에서 PM/Agent 실행을 계속합니다.`,
      );
      onChangePage("project-teams");
    } catch (error) {
      setMessage(`시장 아이디어 Project Intake 실패: ${errorMessage(error)}`);
    } finally {
      setStartingProject(false);
    }
  };

  return (
    <div className="project-teams-page">
      <header className="project-teams-header">
        <div>
          <span className="project-teams-kicker">MARKET DISCOVERY</span>
          <h1>시장부터 프로젝트 찾기</h1>
          <p>공개 시장 근거를 조사한 뒤 Idea Agent가 후보를 만들고, 선택한 아이디어만 기존 Project Intake와 팀 배정으로 넘깁니다.</p>
        </div>
        <div className="project-teams-runtime">
          <span className="project-teams-runtime-dot" />
          <div>
            <strong>{runningDiscovery ? "시장 조사 중" : startingProject ? "Project Intake 중" : "Discovery Runtime"}</strong>
            <span>ChatGPT Codex web search · 출처 기반 · Product Owner 최종 선택</span>
          </div>
        </div>
      </header>

      <form className="project-command" onSubmit={handleDiscover}>
        <div className="project-command-label">
          <span>Discovery topic</span>
          <small>시장 / 사용자 문제 / 산업 / 키워드</small>
        </div>
        <input
          aria-label="시장 탐색 주제"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="예: 학교·취업 준비 과정에서 반복되는 정보 탐색 문제"
          disabled={busy}
        />
        <button type="submit" disabled={busy}>{runningDiscovery ? "조사 중" : "시장 탐색"}</button>
      </form>

      <div className="project-command-message" role="status">{message}</div>

      <MarketDiscoveryPanel discovery={latestDiscovery} busy={busy} onBuild={startIdeaProject} />
    </div>
  );
}
