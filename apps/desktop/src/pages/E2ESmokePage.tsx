import { useMemo, useState } from "react";

import type { LunaPage } from "../components/Sidebar";
import {
  auditLiveE2EProject,
  createLiveE2ESmokeRequest,
  findLatestLiveE2EProject,
} from "../projectTeams/e2eSmoke";
import { loadProjectTeamsState } from "../projectTeams/store";
import "../E2ESmoke.css";

type E2ESmokePageProps = {
  onChangePage: (page: LunaPage) => void;
};

function statusLabel(status: "pass" | "pending" | "fail") {
  if (status === "pass") return "PASS";
  if (status === "fail") return "FAIL";
  return "WAIT";
}

export function E2ESmokePage({ onChangePage }: E2ESmokePageProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [copyMessage, setCopyMessage] = useState("");
  const smoke = useMemo(() => createLiveE2ESmokeRequest(), []);
  const state = useMemo(() => loadProjectTeamsState(), [refreshKey]);
  const project = findLatestLiveE2EProject(state);
  const audit = project ? auditLiveE2EProject(state, project) : null;

  const prepareRun = async () => {
    try {
      await navigator.clipboard.writeText(smoke.command);
      setCopyMessage("E2E /start 명령을 복사했습니다. Project Teams에서 붙여넣고 실행하세요.");
    } catch {
      setCopyMessage("클립보드 복사 권한이 없습니다. 아래 명령을 직접 복사해 주세요.");
    }
    onChangePage("project-teams");
  };

  return (
    <div className="e2e-smoke-page">
      <header className="e2e-smoke-header">
        <div>
          <span className="home-eyebrow">LIVE E2E</span>
          <h1>Luna 전체 파이프라인 Smoke</h1>
          <p>
            mock이 아니라 기존 /start, Organization Intake, 팀 배정, PM, 독립 Agent,
            GitHub PR, 마케팅, 문서화, Review, QA, 회고, Team Evolution 흐름을 그대로 사용합니다.
          </p>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
          상태 새로고침
        </button>
      </header>

      <section className="e2e-smoke-run-card">
        <div className="e2e-smoke-section-title">
          <div>
            <span>FIXTURE</span>
            <h2>Pulseboard</h2>
          </div>
          <small>full-stack · SQLite · no auth · no external API</small>
        </div>
        <p>
          Frontend와 Backend를 모두 실제로 만들게 하고, 이후 Data & Marketing과 Documentation,
          Code Review, Reviewer, QA, develop 통합, 회고/Evolution까지 모두 통과해야 완료됩니다.
        </p>
        <textarea value={smoke.command} readOnly aria-label="Live E2E start command" />
        <div className="e2e-smoke-actions">
          <button type="button" onClick={prepareRun}>명령 복사하고 Project Teams 열기</button>
          <span>{copyMessage || "실제 로컬 Codex + gh 인증 환경에서 실행됩니다."}</span>
        </div>
      </section>

      <section className="e2e-smoke-audit">
        <div className="e2e-smoke-section-title">
          <div>
            <span>AUDIT</span>
            <h2>최신 Live E2E 결과</h2>
          </div>
          {audit && (
            <strong data-result={audit.passed ? "pass" : "running"}>
              {audit.passed ? "ALL PASS" : `${audit.completedChecks}/${audit.totalChecks}`}
            </strong>
          )}
        </div>

        {!project || !audit ? (
          <div className="e2e-smoke-empty">
            아직 `[LUNA-E2E-SMOKE]` 프로젝트가 없습니다. 위 fixture로 첫 실행을 시작하세요.
          </div>
        ) : (
          <>
            <div className="e2e-smoke-project-summary">
              <strong>{project.plan?.projectName ?? project.id}</strong>
              <span>{project.status}</span>
              <small>{project.repositoryFullName ?? "repository 준비 전"}</small>
              <small>{project.runtimeMessage}</small>
            </div>

            <div className="e2e-smoke-checks">
              {audit.checks.map((item) => (
                <div className="e2e-smoke-check" key={item.id} data-status={item.status}>
                  <span>{statusLabel(item.status)}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="e2e-smoke-note">
        <strong>PASS 기준</strong>
        <p>
          CI가 초록색인 것만으로 끝내지 않습니다. 실제 Intake session, 팀 배정 evidence, PM repository,
          Frontend/Backend 완료, writer commit/PR, Data Marketing/Documentation, Review/QA coverage,
          develop 통합, 회고/Team Evolution, 팀 idle 복귀가 모두 확인되어야 합니다.
        </p>
      </section>
    </div>
  );
}
