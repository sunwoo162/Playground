import { FormEvent, useMemo, useState } from "react";

import { ProjectRuntimePanel } from "../components/ProjectRuntimePanel";
import { ProjectTaskQueue } from "../components/ProjectTaskQueue";
import {
  BOUQUET_AUTH_POLICY,
  EXECUTION_POLICY,
  WORKFLOW_STAGES,
} from "../projectTeams/catalog";
import { integrateProjectPullRequests } from "../projectTeams/integration";
import { markProjectIntegrated } from "../projectTeams/integrationState";
import { loadOrganizationRuntimeSettings } from "../projectTeams/organization";
import { runProjectRetrospectives } from "../projectTeams/retrospective";
import { completeProjectRetrospective } from "../projectTeams/retrospectiveState";
import { dispatchAgentTask, startProjectRuntime } from "../projectTeams/runtime";
import {
  beginAgentTasks,
  beginProjectPlanning,
  completeAgentTask,
  completeProjectPlanning,
  failAgentTask,
  failProjectRuntime,
  getRunnableTaskRuns,
  getTeamName,
  loadProjectTeamsState,
  resetProjectTeamsState,
  retryBlockedAgentTasks,
  startProject,
} from "../projectTeams/store";
import { buildAgentTaskRuntimeInput } from "../projectTeams/taskScheduler";
import type { ProjectTeamsState, TeamId } from "../projectTeams/types";

function teamStatusLabel(status: ProjectTeamsState["teams"][number]["status"]) {
  switch (status) {
    case "reserved":
      return "배정됨";
    case "working":
      return "작업 중";
    case "retrospective":
      return "회고 중";
    case "evolving":
      return "개선 중";
    case "idle":
    default:
      return "대기";
  }
}

function agentStatusLabel(status: ProjectTeamsState["teams"][number]["agents"][number]["status"]) {
  switch (status) {
    case "ready":
      return "준비";
    case "working":
      return "작업 중";
    case "blocked":
      return "막힘";
    case "review":
      return "검토";
    case "done":
      return "완료";
    case "idle":
    default:
      return "대기";
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function ProjectTeamsPage() {
  const [state, setState] = useState<ProjectTeamsState>(() => loadProjectTeamsState());
  const [selectedTeamId, setSelectedTeamId] = useState<TeamId>(state.teams[0]?.id ?? "rose");
  const [command, setCommand] = useState("/start");
  const [awaitingRequirement, setAwaitingRequirement] = useState(false);
  const [launchingProject, setLaunchingProject] = useState(false);
  const [dispatchingAgents, setDispatchingAgents] = useState(false);
  const [runningRetrospective, setRunningRetrospective] = useState(false);
  const [message, setMessage] = useState("/start로 새 프로젝트를 배정할 수 있습니다.");
  const runtimeBusy = launchingProject || dispatchingAgents || runningRetrospective;

  const selectedTeam = useMemo(
    () => state.teams.find((team) => team.id === selectedTeamId) ?? state.teams[0],
    [selectedTeamId, state.teams],
  );

  const activeProject = useMemo(() => {
    if (!selectedTeam?.activeProjectId) return null;
    return state.projects.find((project) => project.id === selectedTeam.activeProjectId) ?? null;
  }, [selectedTeam, state.projects]);

  const runRetrospectiveStage = async (baseState: ProjectTeamsState, projectId: string) => {
    const project = baseState.projects.find((item) => item.id === projectId);
    if (!project || project.status !== "retrospective") return baseState;

    setRunningRetrospective(true);
    setMessage("참여 Agent별 독립 회고 실행 중 · 완료 후 Team Evolution Agent가 개선 제안을 검증합니다.");

    try {
      const result = await runProjectRetrospectives(baseState, projectId);
      const nextState = completeProjectRetrospective(baseState, result);
      setState(nextState);
      setMessage(
        `프로젝트 완료 · Agent 회고 ${result.retrospectives.length}개 저장 · Team Evolution 제안 ${result.evolution.playbookChanges.length + result.evolution.agentVersionChanges.length}개 저장 · 팀 대기 전환`,
      );
      return nextState;
    } catch (error) {
      setMessage(`회고 / Team Evolution Runtime 실패: ${errorMessage(error)} · 프로젝트는 회고 상태로 유지됩니다.`);
      return baseState;
    } finally {
      setRunningRetrospective(false);
    }
  };

  const runAgentQueue = async (baseState: ProjectTeamsState, projectId: string) => {
    const runtimeSettings = loadOrganizationRuntimeSettings();
    let nextState = baseState;
    setDispatchingAgents(true);

    try {
      while (true) {
        const currentProject = nextState.projects.find((item) => item.id === projectId);
        if (!currentProject || currentProject.status === "blocked") break;

        const wave = getRunnableTaskRuns(nextState, projectId, 2);
        if (wave.length === 0) break;

        let inputs;
        try {
          inputs = wave.map((run) =>
            buildAgentTaskRuntimeInput(nextState, projectId, run, runtimeSettings),
          );
        } catch (error) {
          const reason = `Agent Task 입력 구성 실패: ${errorMessage(error)}`;
          nextState = failAgentTask(nextState, projectId, wave[0].taskId, reason);
          setState(nextState);
          setMessage(reason);
          break;
        }

        nextState = beginAgentTasks(
          nextState,
          projectId,
          wave.map((run) => run.taskId),
        );
        setState(nextState);
        setMessage(
          `${wave.map((run) => `${run.taskId} ${run.role}`).join(" · ")} 독립 Codex Agent 실행 중`,
        );

        const results = await Promise.allSettled(inputs.map((input) => dispatchAgentTask(input)));
        results.forEach((result, index) => {
          const task = wave[index];
          if (result.status === "fulfilled") {
            nextState = completeAgentTask(nextState, result.value);
          } else {
            nextState = failAgentTask(
              nextState,
              projectId,
              task.taskId,
              `Agent Runtime 실패: ${errorMessage(result.reason)}`,
            );
          }
        });
        setState(nextState);

        const updatedProject = nextState.projects.find((item) => item.id === projectId);
        if (!updatedProject || updatedProject.status === "blocked") break;
      }

      const finalProject = nextState.projects.find((item) => item.id === projectId);
      if (!finalProject) return nextState;

      const allTasksDone = finalProject.taskRuns.length > 0
        && finalProject.taskRuns.every((run) => run.status === "done");

      if (!allTasksDone || finalProject.status === "blocked") {
        setMessage(finalProject.runtimeMessage);
        return nextState;
      }

      setMessage("모든 Agent Task 완료 · Code Review / Reviewer / QA merge gate와 GitHub PR 상태 검증 중");

      try {
        const integration = await integrateProjectPullRequests(finalProject);
        if (!integration.ok) {
          setMessage(integration.message);
          return nextState;
        }

        nextState = markProjectIntegrated(
          nextState,
          projectId,
          integration.mergedPullRequestNumbers,
        );
        setState(nextState);
        setMessage(`${integration.message} · Agent 회고 / Team Evolution 시작`);
        nextState = await runRetrospectiveStage(nextState, projectId);
      } catch (error) {
        setMessage(`PR 통합 Runtime 실패: ${errorMessage(error)}`);
      }
    } finally {
      setDispatchingAgents(false);
    }

    return nextState;
  };

  const launchProjectRuntime = async (baseState: ProjectTeamsState, projectId: string) => {
    const project = baseState.projects.find((item) => item.id === projectId);
    if (!project) {
      setMessage("실행할 프로젝트를 찾지 못했습니다.");
      return;
    }

    const runtimeSettings = loadOrganizationRuntimeSettings();
    if (!runtimeSettings.workspaceRoot) {
      setMessage("Workspace root를 저장한 뒤 PM Runtime을 실행해 주세요.");
      return;
    }

    const teamName = getTeamName(baseState, project.teamId);
    let nextState = beginProjectPlanning(baseState, project.id);
    let plannedState: ProjectTeamsState | null = null;
    setState(nextState);
    setSelectedTeamId(project.teamId);
    setLaunchingProject(true);
    setMessage(`${teamName}팀 PM Codex가 프로젝트를 분석 중입니다.`);

    try {
      const runtimeResult = await startProjectRuntime({
        organization: runtimeSettings.organization,
        workspaceRoot: runtimeSettings.workspaceRoot,
        projectId: project.id,
        teamId: project.teamId,
        teamName,
        request: project.request,
      });

      nextState = completeProjectPlanning(nextState, {
        projectId: project.id,
        plan: runtimeResult.pm.plan,
        repositoryFullName: runtimeResult.repository.repository,
        workspacePath: runtimeResult.repository.workspacePath,
        pmSessionId: runtimeResult.pm.sessionId,
      });
      plannedState = nextState;
      setState(nextState);
      setMessage(
        `${teamName}팀 PM 계획 완료 · ${runtimeResult.repository.repository} 준비 완료 · Agent 실행 시작`,
      );
    } catch (error) {
      const reason = `PM Runtime 실패: ${errorMessage(error)}`;
      nextState = failProjectRuntime(nextState, project.id, reason);
      setState(nextState);
      setMessage(reason);
      return;
    } finally {
      setLaunchingProject(false);
    }

    if (!plannedState) return;

    try {
      await runAgentQueue(plannedState, project.id);
    } catch (error) {
      setMessage(`Agent Runtime 실행 실패: ${errorMessage(error)}`);
    }
  };

  const submitRequirement = async (request: string) => {
    const runtimeSettings = loadOrganizationRuntimeSettings();
    if (!runtimeSettings.workspaceRoot) {
      setMessage("Workspace root를 저장한 뒤 새 프로젝트를 시작해 주세요.");
      return;
    }

    const result = startProject(state, request);
    setState(result.state);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setSelectedTeamId(result.project.teamId);
    setAwaitingRequirement(false);
    setCommand("/start");
    await launchProjectRuntime(result.state, result.project.id);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (runtimeBusy) return;

    const value = command.trim();

    if (awaitingRequirement) {
      await submitRequirement(value);
      return;
    }

    if (value === "/start") {
      setAwaitingRequirement(true);
      setCommand("");
      setMessage("프로젝트 요구사항을 입력해 주세요.");
      return;
    }

    if (value.startsWith("/start ")) {
      await submitRequirement(value.slice(7));
      return;
    }

    setMessage("현재는 /start 명령만 준비되어 있습니다.");
  };

  const handleRetryPmRuntime = async () => {
    if (!activeProject || runtimeBusy || activeProject.plan) return;
    await launchProjectRuntime(state, activeProject.id);
  };

  const handleContinueAgents = async () => {
    if (!activeProject || runtimeBusy || !activeProject.plan) return;
    await runAgentQueue(state, activeProject.id);
  };

  const handleRetryBlockedAgents = async () => {
    if (!activeProject || runtimeBusy || !activeProject.plan) return;
    const nextState = retryBlockedAgentTasks(state, activeProject.id);
    setState(nextState);
    await runAgentQueue(nextState, activeProject.id);
  };

  const handleRunRetrospective = async () => {
    if (!activeProject || runtimeBusy || activeProject.status !== "retrospective") return;
    await runRetrospectiveStage(state, activeProject.id);
  };

  const handleReset = () => {
    if (runtimeBusy) return;
    const nextState = resetProjectTeamsState();
    setState(nextState);
    setSelectedTeamId(nextState.teams[0].id);
    setAwaitingRequirement(false);
    setCommand("/start");
    setMessage("로컬 팀 상태를 초기화했습니다.");
  };

  return (
    <div className="project-teams-page">
      <header className="project-teams-header">
        <div>
          <span className="project-teams-kicker">PROJECT TEAMS</span>
          <h1>프로젝트 팀</h1>
          <p>다섯 개의 독립 팀을 배정하고 Agent 상태와 프로젝트 기준을 관리합니다.</p>
        </div>
        <div className="project-teams-runtime">
          <span className="project-teams-runtime-dot" />
          <div>
            <strong>
              {runningRetrospective
                ? "Retrospective Runtime 실행 중"
                : dispatchingAgents
                  ? "Agent Runtime 실행 중"
                  : launchingProject
                    ? "PM Runtime 실행 중"
                    : "Codex Runtime"}
            </strong>
            <span>ChatGPT Codex 인증과 BloomBouquet 로컬 Runtime을 사용</span>
          </div>
        </div>
      </header>

      <form className="project-command" onSubmit={handleSubmit}>
        <div className="project-command-label">
          <span>Command</span>
          <small>{awaitingRequirement ? "프로젝트 요구사항 입력" : "새 프로젝트 시작"}</small>
        </div>
        <input
          aria-label="프로젝트 팀 명령"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={awaitingRequirement ? "무엇을 만들지 입력하세요" : "/start"}
          disabled={runtimeBusy}
        />
        <button type="submit" disabled={runtimeBusy}>
          {runtimeBusy ? "실행 중" : "실행"}
        </button>
      </form>

      <p className="project-command-message">{message}</p>

      <section className="project-team-strip" aria-label="프로젝트 팀 목록">
        {state.teams.map((team) => (
          <button
            key={team.id}
            className={`project-team-item ${selectedTeamId === team.id ? "active" : ""}`}
            onClick={() => setSelectedTeamId(team.id)}
            type="button"
          >
            <div>
              <strong>{team.name}</strong>
              <span>Playbook {team.playbookVersion}</span>
            </div>
            <span className={`project-team-status status-${team.status}`}>{teamStatusLabel(team.status)}</span>
          </button>
        ))}
      </section>

      {selectedTeam && (
        <div className="project-teams-layout">
          <section className="project-team-panel">
            <div className="project-section-heading">
              <div>
                <span>TEAM</span>
                <h2>{selectedTeam.name}</h2>
              </div>
              <div className="project-team-metrics">
                <span>완료 {selectedTeam.completedProjects}</span>
                <span>평가 {selectedTeam.averageScore ?? "-"}</span>
              </div>
            </div>

            {activeProject ? (
              <>
                <div className="project-active-project">
                  <div className="project-active-project-topline">
                    <strong>{activeProject.plan?.projectName ?? activeProject.id}</strong>
                    <span>{activeProject.status}</span>
                  </div>
                  <p>{activeProject.plan?.productSummary ?? activeProject.request}</p>
                  <small>
                    {activeProject.repositoryFullName
                      ? `${activeProject.repositoryFullName} · ${activeProject.plan?.tasks.length ?? 0} tasks · ${activeProject.runtimeMessage}`
                      : activeProject.runtimeMessage}
                  </small>
                  {activeProject.status === "blocked" && activeProject.runtimeFailureSource && (
                    <small>
                      실패 단계: {activeProject.runtimeFailureSource === "pm" ? "PM Runtime" : "Agent Runtime"}
                    </small>
                  )}
                  {activeProject.status === "blocked"
                    && (activeProject.runtimeFailureSource === "pm"
                      || (!activeProject.plan && activeProject.runtimeFailureSource === null)) && (
                    <button
                      className="project-reset-button project-runtime-retry-button"
                      type="button"
                      onClick={handleRetryPmRuntime}
                      disabled={runtimeBusy}
                    >
                      PM Runtime 다시 실행
                    </button>
                  )}
                  {activeProject.status === "retrospective" && (
                    <button
                      className="project-reset-button project-runtime-retry-button"
                      type="button"
                      onClick={handleRunRetrospective}
                      disabled={runtimeBusy}
                    >
                      Agent 회고 / Team Evolution 실행
                    </button>
                  )}
                </div>

                <ProjectTaskQueue
                  project={activeProject}
                  busy={runtimeBusy}
                  onContinue={handleContinueAgents}
                  onRetryBlocked={handleRetryBlockedAgents}
                />
              </>
            ) : (
              <div className="project-empty-state">
                <strong>배정된 프로젝트 없음</strong>
                <span>이 팀은 다음 프로젝트를 받을 수 있습니다.</span>
              </div>
            )}

            <div className="project-agent-list">
              {selectedTeam.agents.map((agent) => (
                <div className="project-agent-row" key={agent.id}>
                  <div className="project-agent-copy">
                    <strong>{agent.label}</strong>
                    <span>{agent.description}</span>
                  </div>
                  <span className="project-agent-version">v{agent.version}</span>
                  <span className={`project-agent-status agent-${agent.status}`}>
                    {agentStatusLabel(agent.status)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <aside className="project-policy-panel">
            <ProjectRuntimePanel />

            <section>
              <span className="project-policy-label">ORGANIZATION</span>
              <h3>Team Evolution Agent</h3>
              <p>각 프로젝트의 평가와 모든 Agent 회고를 누적해 팀별 Playbook과 Agent 버전 개선 후보를 관리합니다.</p>
              <div className="project-policy-meta">v{state.evolutionAgentVersion}</div>
            </section>

            <section>
              <span className="project-policy-label">AUTH STANDARD</span>
              <h3>{BOUQUET_AUTH_POLICY.name}</h3>
              <p>{BOUQUET_AUTH_POLICY.summary}</p>
              <div className="project-policy-meta">v{BOUQUET_AUTH_POLICY.version}</div>
            </section>

            <section>
              <span className="project-policy-label">EXECUTION</span>
              <h3>이설 방식</h3>
              <p>{EXECUTION_POLICY.summary}</p>
              <div className="project-policy-meta">v{EXECUTION_POLICY.version}</div>
            </section>

            <section>
              <span className="project-policy-label">FLOW</span>
              <div className="project-workflow-list">
                {WORKFLOW_STAGES.map((stage, index) => (
                  <div key={stage}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{stage}</strong>
                  </div>
                ))}
              </div>
            </section>

            <button className="project-reset-button" onClick={handleReset} type="button" disabled={runtimeBusy}>
              로컬 상태 초기화
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
