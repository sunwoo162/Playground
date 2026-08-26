import "../E2ECanaryPanel.css";

import {
  E2E_CANARY_REQUEST,
  evaluateE2ECanaryProject,
  findLatestE2ECanaryProject,
} from "../projectTeams/e2eCanary";
import type { ProjectTeamsState } from "../projectTeams/types";

type E2ECanaryPanelProps = {
  state: ProjectTeamsState;
  busy: boolean;
  onStart: (request: string) => Promise<void>;
  onSelectProject: (projectId: string) => void;
};

function statusLabel(status: ReturnType<typeof evaluateE2ECanaryProject>["stages"][number]["status"]) {
  switch (status) {
    case "passed":
      return "PASS";
    case "running":
      return "RUN";
    case "blocked":
      return "BLOCK";
    case "pending":
    default:
      return "WAIT";
  }
}

export function E2ECanaryPanel({ state, busy, onStart, onSelectProject }: E2ECanaryPanelProps) {
  const project = findLatestE2ECanaryProject(state);
  const report = project ? evaluateE2ECanaryProject(project) : null;

  return (
    <section className="e2e-canary-panel">
      <div className="e2e-canary-heading">
        <div>
          <span className="project-policy-label">LIVE E2E</span>
          <h3>PulseNote Canary</h3>
        </div>
        <span className={report?.passed ? "passed" : report?.blockers.length ? "blocked" : "idle"}>
          {report?.passed ? "PASS" : report?.blockers.length ? "BLOCKED" : report ? "ACTIVE" : "READY"}
        </span>
      </div>

      <p>
        실제 `/start` 경로로 작은 full-stack 제품을 생성해 Intake부터 Team Evolution까지 끊김 없이 통과하는지 증명합니다.
      </p>

      {!report ? (
        <button
          className="project-reset-button project-runtime-retry-button"
          type="button"
          disabled={busy}
          onClick={() => void onStart(E2E_CANARY_REQUEST)}
        >
          실제 E2E Canary 시작
        </button>
      ) : (
        <>
          <div className="e2e-canary-meta">
            <span>{report.projectName}</span>
            <span>{report.repositoryFullName ?? "repository 생성 전"}</span>
            <span>{report.teamId} · {report.status}</span>
          </div>

          <div className="e2e-canary-stages" aria-label="E2E Canary 단계">
            {report.stages.map((stage) => (
              <div className="e2e-canary-stage" data-status={stage.status} key={stage.id}>
                <span>{statusLabel(stage.status)}</span>
                <div>
                  <strong>{stage.label}</strong>
                  <small>{stage.evidence}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="e2e-canary-evidence">
            <span>PR {report.pullRequests.length}</span>
            <span>Commit {report.commitShas.length}</span>
            <span>Failure route {report.failureRouteCount}</span>
            <span>Replan {report.replanCount}</span>
          </div>

          {report.blockers.length > 0 && (
            <div className="e2e-canary-blockers">
              <strong>현재 blocker</strong>
              {report.blockers.map((blocker) => <span key={blocker}>{blocker}</span>)}
            </div>
          )}

          <div className="e2e-canary-actions">
            <button
              className="project-reset-button"
              type="button"
              onClick={() => onSelectProject(report.projectId)}
            >
              Canary 프로젝트 보기
            </button>
            {report.passed && (
              <button
                className="project-reset-button"
                type="button"
                disabled={busy}
                onClick={() => void onStart(E2E_CANARY_REQUEST)}
              >
                새 Canary 다시 실행
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
