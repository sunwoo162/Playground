import "../TeamPerformanceOverview.css";

import { ensureTeamPerformanceProfiles } from "../projectTeams/teamPerformance";
import { loadProjectTeamsState } from "../projectTeams/store";
import type { AgentRole, TeamStrengthEvidence } from "../projectTeams/types";

const ROLE_LABELS: Record<Exclude<AgentRole, "pm">, string> = {
  idea: "Idea",
  "design-system": "Design System",
  designer: "Designer",
  frontend: "Frontend",
  backend: "Backend",
  "data-marketing": "Data & Marketing",
  "code-review": "Code Review",
  reviewer: "Reviewer",
  qa: "QA",
  documentation: "Documentation",
  "debug-router": "Debug Router",
  "user-a": "User A",
  "user-b": "User B",
  "process-evaluator": "Process Evaluator",
};

function confidenceLabel(strength: TeamStrengthEvidence) {
  return strength.confidence === "established" ? "검증됨" : "관찰 중";
}

function rateLabel(value: number) {
  return value.toFixed(2);
}

export function TeamPerformanceOverview() {
  const state = ensureTeamPerformanceProfiles(loadProjectTeamsState());

  return (
    <section className="team-performance-overview">
      <div className="team-performance-heading">
        <div>
          <span className="project-policy-label">TEAM EVIDENCE</span>
          <h3>측정된 팀 강점</h3>
        </div>
        <span className="team-performance-policy">동급 비교</span>
      </div>

      <p className="team-performance-intro">
        팀 성격을 미리 정하지 않고 완료 프로젝트의 재시도·실패·검증 결과가 충분히 쌓였을 때만 강점으로 표시합니다.
      </p>

      <div className="team-performance-list" aria-label="팀별 실측 성과">
        {state.teams.map((team) => {
          const profile = team.performanceProfile;
          const strengths = profile?.strengths.slice(0, 2) ?? [];
          const measuredProjects = profile?.measuredProjectCount ?? 0;

          return (
            <div className="team-performance-row" key={team.id}>
              <div className="team-performance-teamline">
                <strong>{team.name}</strong>
                <span>{measuredProjects} projects</span>
              </div>

              {strengths.length > 0 ? (
                <div className="team-performance-strengths">
                  {strengths.map((strength) => (
                    <div className="team-performance-strength" key={`${team.id}-${strength.role}`}>
                      <div>
                        <strong>{ROLE_LABELS[strength.role]}</strong>
                        <span data-confidence={strength.confidence}>{confidenceLabel(strength)}</span>
                      </div>
                      <small>
                        issue {rateLabel(strength.teamIssueRate)} · peer {rateLabel(strength.peerIssueRate)} · {strength.taskCount} tasks
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="team-performance-empty">
                  <span>{measuredProjects === 0 ? "측정 전" : "표본 축적 중"}</span>
                  <small>
                    {measuredProjects === 0
                      ? "완료 프로젝트가 생기면 자동으로 측정합니다."
                      : "동급 팀 비교와 최소 표본 기준을 충족해야 강점이 표시됩니다."}
                  </small>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
