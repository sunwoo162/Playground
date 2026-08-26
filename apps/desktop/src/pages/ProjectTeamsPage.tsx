import { FormEvent, useMemo, useState } from "react";

import { ProjectRuntimePanel } from "../components/ProjectRuntimePanel";
import { ProjectTaskQueue } from "../components/ProjectTaskQueue";
import {
  BOUQUET_AUTH_POLICY,
  EXECUTION_POLICY,
  WORKFLOW_STAGES,
} from "../projectTeams/catalog";
import {
  getProjectExecutionControlState,
  pauseProjectExecution,
  reconcileProjectExecutionControl,
  resetProjectExecutionControlState,
  resumeProjectExecution,
  stopProjectExecution,
} from "../projectTeams/executionControlState";
import { diagnoseBlockedTask, toFailureRouteRecord } from "../projectTeams/failureRouting";
import { applyFailureRoute, beginFailureRouting, failFailureRouting } from "../projectTeams/failureState";
import { integrateProjectPullRequests } from "../projectTeams/integration";
import { markProjectIntegrated } from "../projectTeams/integrationState";
import {
  analyzeProjectIntake,
  PROJECT_INTAKE_AGENT_VERSION,
} from "../projectTeams/intakeRuntime";
import { startProjectRuntimeWithIntake } from "../projectTeams/intakePlanning";
import { loadOrganizationRuntimeSettings } from "../projectTeams/organization";
import {
  getProductOwnerDecision,
  recordProductOwnerRecoveryDecision,
} from "../projectTeams/productOwnerDecision";
import { startProjectWithIntake } from "../projectTeams/projectIntakeState";
import {
  getPmRecoveryTrigger,
  runProjectFailureReplan,
} from "../projectTeams/replanning";
import {
  applyProjectFailureReplan,
  beginProjectFailureReplan,
  failProjectFailureReplan,
} from "../projectTeams/replanState";
import { runProjectRetrospectives } from "../projectTeams/retrospective";
import { completeProjectRetrospective } from "../projectTeams/retrospectiveState";
import { dispatchAgentTask } from "../projectTeams/runtime";
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
  const [selectedTeamId, setSelectedTeamId] = useState<TeamId>(
    state.teams.find((team) => team.activeProjectId)?.id ?? state.teams[0]?.id ?? "rose",
  );
  const [command, setCommand] = useState("/start");
  const [awaitingRequirement, setAwaitingRequirement] = useState(false);
  const [awaitingDecision, setAwaitingDecision] = useState(false);
  const [runningIntake, setRunningIntake] = useState(false);
  const [launchingProject, setLaunchingProject] = useState(false);
  const [dispatchingAgents, setDispatchingAgents] = useState(false);
  const [runningReplan, setRunningReplan] = useState(false);
  const [runningRetrospective, setRunningRetrospective] = useState(false);
  const [message, setMessage] = useState("/start로 요구사항을 조직 분석한 뒤 적합한 대기 팀을 배정할 수 있습니다.");
  const runtimeBusy = runningIntake
    || launchingProject
    || dispatchingAgents
    || runningReplan
    || runningRetrospective;
  const commandLocked = runningIntake
    || launchingProject
    || runningReplan
    || runningRetrospective;

  const selectedTeam = useMemo(
    () => state.teams.find((team) => team.id === selectedTeamId) ?? state.teams[0],
    [selectedTeamId, state.teams],
  );

  const activeProject = useMemo(() => {
    if (!selectedTeam?.activeProjectId) return null;
    return state.projects.find((project) => project.id === selectedTeam.activeProjectId) ?? null;
  }, [selectedTeam, state.projects]);

  const activeExecutionControl = activeProject
    ? getProjectExecutionControlState(activeProject.id)
    : null;
  const latestFailureRoute = activeProject?.failureRoutes?.[0] ?? null;
  const latestProductOwnerDecision = activeProject && latestFailureRoute?.route === "needs-human"
    ? getProductOwnerDecision(state, activeProject.id, latestFailureRoute.id)
    : null;
  const pmRecoveryTrigger = activeProject
    ? getPmRecoveryTrigger(state, activeProject)
    : null;
  const blockedActionLabel = latestFailureRoute?.route === "escalate-pm"
    ? "PM 복구 재계획"
    : latestFailureRoute?.route === "needs-human"
      ? latestProductOwnerDecision
        ? "결정 기반 PM 복구 재계획"
        : "Product Owner 결정: /decide"
      : "Debug Router로 재분석";

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

  const runFailureReplanStage = async (
    baseState: ProjectTeamsState,
    projectId: string,
  ) => {
    let nextState = beginProjectFailureReplan(baseState, projectId);
    setState(nextState);
    setRunningReplan(true);
    setMessage("복구 trigger 확인 완료 · PM Codex가 기존 repository와 Git 작업을 보존한 재계획을 생성 중");

    try {
      const outcome = await runProjectFailureReplan(nextState, projectId);
      nextState = applyProjectFailureReplan(nextState, projectId, outcome);
      setState(nextState);
      setMessage(nextState.projects.find((item) => item.id === projectId)?.runtimeMessage ?? outcome.runtime.proposal.summary);
      return nextState;
    } catch (error) {
      nextState = failProjectFailureReplan(nextState, projectId, errorMessage(error));
      setState(nextState);
      setMessage(nextState.projects.find((item) => item.id === projectId)?.runtimeMessage ?? errorMessage(error));
      return nextState;
    } finally {
      setRunningReplan(false);
    }
  };

  const routeBlockedTask = async (
    baseState: ProjectTeamsState,
    projectId: string,
    taskId: string,
  ) => {
    let nextState = beginFailureRouting(baseState, projectId, taskId);
    setState(nextState);
    setMessage(`${taskId} 실패 · Debug / Problem Router Agent가 로그와 검증 근거를 분석 중`);

    try {
      const result = await diagnoseBlockedTask(nextState, projectId, taskId);
      const project = nextState.projects.find((item) => item.id === projectId);
      if (!project) return nextState;
      const route = toFailureRouteRecord(project, result);
      nextState = applyFailureRoute(nextState, projectId, route);
      setState(nextState);
      setMessage(
        route.route === "needs-human"
          ? `Product Owner 결정 필요 · ${route.recommendedAction} · /decide 로 결정을 입력하세요.`
          : nextState.projects.find((item) => item.id === projectId)?.runtimeMessage ?? route.summary,
      );

      if (route.route === "escalate-pm") {
        nextState = await runFailureReplanStage(nextState, projectId);
      }
      return nextState;
    } catch (error) {
      nextState = failFailureRouting(nextState, projectId, taskId, errorMessage(error));
      setState(nextState);
      setMessage(nextState.projects.find((item) => item.id === projectId)?.runtimeMessage ?? errorMessage(error));
      return nextState;
    }
  };

  const runAgentQueue = async (baseState: ProjectTeamsState, projectId: string) => {
    const runtimeSettings = loadOrganizationRuntimeSettings();
    let nextState = baseState;
    setDispatchingAgents(true);

    try {
      while (true) {
        let controlResult = reconcileProjectExecutionControl(nextState, projectId);
        nextState = controlResult.state;
        setState(nextState);
        if (controlResult.control.state !== "running") {
          setMessage(nextState.projects.find((item) => item.id === projectId)?.runtimeMessage ?? "Agent 실행 제어 대기");
          break;
        }

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
          nextState = await routeBlockedTask(nextState, projectId, wave[0].taskId);
          if (nextState.projects.find((item) => item.id === projectId)?.status === "blocked") break;
          continue;
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

        controlResult = reconcileProjectExecutionControl(nextState, projectId);
        nextState = controlResult.state;
        setState(nextState);
        if (controlResult.control.state !== "running") {
          setMessage(nextState.projects.find((item) => item.id === projectId)?.runtimeMessage ?? "Agent 실행 제어 대기");
          break;
        }

        const blockedTaskIds = wave
          .map((task) => task.taskId)
          .filter((taskId) =>
            nextState.projects
              .find((item) => item.id === projectId)
              ?.taskRuns.find((run) => run.taskId === taskId)?.status === "blocked",
          );

        for (const taskId of blockedTaskIds) {
          nextState = await routeBlockedTask(nextState, projectId, taskId);
          if (nextState.projects.find((item) => item.id === projectId)?.status === "blocked") {
            break;
          }
        }

        const updatedProject = nextState.projects.find((item) => item.id === projectId);
        if (!updatedProject || updatedProject.status === "blocked") break;
      }

      const finalProject = nextState.projects.find((item) => item.id === projectId);
      if (!finalProject) return nextState;

      const finalControl = getProjectExecutionControlState(projectId);
      if (finalControl.state !== "running") {
        setMessage(finalProject.runtimeMessage);
        return nextState;
      }

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
    setMessage(`${teamName}팀 PM Codex가 Organization Intake 근거를 독립 검증하고 프로젝트를 계획 중입니다.`);

    try {
      const runtimeResult = await startProjectRuntimeWithIntake({
        organization: runtimeSettings.organization,
        workspaceRoot: runtimeSettings.workspaceRoot,
        projectId: project.id,
        teamId: project.teamId,
        teamName,
        request: project.request,
      }, project.intake);

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

    setRunningIntake(true);
    setMessage("Organization Project Intake Agent가 팀을 선택하기 전에 사용자·범위·복잡도·필요 역할·위험을 분석 중입니다.");

    let intake;
    try {
      intake = await analyzeProjectIntake({
        organization: runtimeSettings.organization,
        workspaceRoot: runtimeSettings.workspaceRoot,
        request,
      });
    } catch (error) {
      setMessage(`Project Intake Runtime 실패: ${errorMessage(error)} · 팀은 아직 배정되지 않았습니다.`);
      return;
    } finally {
      setRunningIntake(false);
    }

    const result = startProjectWithIntake(state, request, intake);
    setState(result.state);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setSelectedTeamId(result.project.teamId);
    setAwaitingRequirement(false);
    setAwaitingDecision(false);
    setCommand("/start");
    setMessage(
      `Intake ${intake.id} 완료 · ${intake.complexity} · 핵심 역할 ${intake.criticalRoles.join(", ") || "없음"} · ${getTeamName(result.state, result.project.teamId)}팀 배정`,
    );
    await launchProjectRuntime(result.state, result.project.id);
  };

  const submitProductOwnerDecision = async (decisionText: string) => {
    if (!activeProject || latestFailureRoute?.route !== "needs-human") {
      setMessage("현재 Product Owner 결정을 기다리는 프로젝트가 없습니다.");
      return;
    }

    try {
      const result = recordProductOwnerRecoveryDecision(
        state,
        activeProject.id,
        latestFailureRoute.id,
        decisionText,
      );
      let nextState = result.state;
      setState(nextState);
      setAwaitingDecision(false);
      setCommand("/start");
      setMessage(`Product Owner 결정 기록 완료 · ${result.decision.rationaleSummary} · PM 복구 재계획 시작`);

      nextState = await runFailureReplanStage(nextState, activeProject.id);
      const project = nextState.projects.find((item) => item.id === activeProject.id);
      if (project && project.status !== "blocked") {
        await runAgentQueue(nextState, activeProject.id);
      }
    } catch (error) {
      setMessage(`Product Owner 결정 처리 실패: ${errorMessage(error)}`);
    }
  };

  const handlePauseExecution = () => {
    if (!activeProject || !activeProject.plan) {
      setMessage("일시정지할 Agent 프로젝트가 없습니다.");
      return;
    }
    const result = pauseProjectExecution(state, activeProject.id);
    setState(result.state);
    setMessage(result.state.projects.find((project) => project.id === activeProject.id)?.runtimeMessage ?? "일시정지 요청됨");
  };

  const handleResumeExecution = async () => {
    if (!activeProject || !activeProject.plan) {
      setMessage("재개할 Agent 프로젝트가 없습니다.");
      return;
    }
    const result = resumeProjectExecution(state, activeProject.id);
    setState(result.state);
    setMessage(result.state.projects.find((project) => project.id === activeProject.id)?.runtimeMessage ?? "Agent 실행 재개");

    const project = result.state.projects.find((item) => item.id === activeProject.id);
    if (
      result.control.state === "running"
      && !dispatchingAgents
      && project
      && project.status !== "blocked"
      && project.status !== "retrospective"
      && project.status !== "completed"
    ) {
      await runAgentQueue(result.state, activeProject.id);
    }
  };

  const handleStopExecution = () => {
    if (!activeProject || !activeProject.plan) {
      setMessage("중지할 Agent 프로젝트가 없습니다.");
      return;
    }
    const result = stopProjectExecution(state, activeProject.id);
    setState(result.state);
    setMessage(result.state.projects.find((project) => project.id === activeProject.id)?.runtimeMessage ?? "프로젝트 실행 중지 요청됨");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = command.trim();
    const executionControlCommand = value === "/pause" || value === "/resume" || value === "/stop";
    if (runtimeBusy && !executionControlCommand) return;

    if (value === "/pause") {
      handlePauseExecution();
      return;
    }

    if (value === "/resume") {
      await handleResumeExecution();
      return;
    }

    if (value === "/stop") {
      handleStopExecution();
      return;
    }

    if (awaitingDecision) {
      await submitProductOwnerDecision(value);
      return;
    }

    if (awaitingRequirement) {
      await submitRequirement(value);
      return;
    }

    if (value === "/start") {
      setAwaitingRequirement(true);
      setAwaitingDecision(false);
      setCommand("");
      setMessage("프로젝트 요구사항을 입력해 주세요. 입력 후 Organization Intake가 먼저 실행됩니다.");
      return;
    }

    if (value.startsWith("/start ")) {
      await submitRequirement(value.slice(7));
      return;
    }

    if (value === "/decide") {
      if (!activeProject || latestFailureRoute?.route !== "needs-human") {
        setMessage("현재 Product Owner 결정을 기다리는 프로젝트가 없습니다.");
        return;
      }
      setAwaitingDecision(true);
      setAwaitingRequirement(false);
      setCommand("");
      setMessage(`Product Owner 결정을 입력해 주세요 · 요청: ${latestFailureRoute.recommendedAction}`);
      return;
    }

    if (value.startsWith("/decide ")) {
      await submitProductOwnerDecision(value.slice(8));
      return;
    }

    setMessage("현재는 /start, /decide, /pause, /resume, /stop 명령을 사용할 수 있습니다.");
  };

  const handleRetryPmRuntime = async () => {
    if (!activeProject || runtimeBusy) return;
    if (activeProject.plan) {
      if (!getPmRecoveryTrigger(state, activeProject)) return;
      const nextState = await runFailureReplanStage(state, activeProject.id);
      const project = nextState.projects.find((item) => item.id === activeProject.id);
      if (project && project.status !== "blocked") {
        await runAgentQueue(nextState, activeProject.id);
      }
      return;
    }
    await launchProjectRuntime(state, activeProject.id);
  };

  const handleContinueAgents = async () => {
    if (!activeProject || runtimeBusy || !activeProject.plan) return;
    await runAgentQueue(state, activeProject.id);
  };

  const handleRetryBlockedAgents = async () => {
    if (!activeProject || runtimeBusy || !activeProject.plan) return;

    const route = activeProject.failureRoutes?.[0];
    if (route?.route === "needs-human" && !latestProductOwnerDecision) {
      setMessage(`Product Owner 결정 필요 · ${route.recommendedAction} · /decide 로 결정을 입력하세요.`);
      return;
    }
    if (route?.route === "escalate-pm" || (route?.route === "needs-human" && latestProductOwnerDecision)) {
      const nextState = await runFailureReplanStage(state, activeProject.id);
      const project = nextState.projects.find((item) => item.id === activeProject.id);
      if (project && project.status !== "blocked") {
        await runAgentQueue(nextState, activeProject.id);
      }
      return;
    }

    let nextState = state;
    const blockedTaskIds = activeProject.taskRuns
      .filter((run) => run.status === "blocked")
      .map((run) => run.taskId);

    for (const taskId of blockedTaskIds) {
      nextState = await routeBlockedTask(nextState, activeProject.id, taskId);
      if (nextState.projects.find((item) => item.id === activeProject.id)?.status === "blocked") {
        break;
      }
    }

    const project = nextState.projects.find((item) => item.id === activeProject.id);
    if (project && project.status !== "blocked") {
      await runAgentQueue(nextState, activeProject.id);
    }
  };

  const handleRunRetrospective = async () => {
    if (!activeProject || runtimeBusy || activeProject.status !== "retrospective") return;
    await runRetrospectiveStage(state, activeProject.id);
  };

  const handleReset = () => {
    if (runtimeBusy) return;
    resetProjectExecutionControlState();
    const nextState = resetProjectTeamsState();
    setState(nextState);
    setSelectedTeamId(nextState.teams[0].id);
    setAwaitingRequirement(false);
    setAwaitingDecision(false);
    setCommand("/start");
    setMessage("로컬 팀 상태를 초기화했습니다.");
  };

  return (
    <div className="project-teams-page">
      <header className="project-teams-header">
        <div>
          <span className="project-teams-kicker">PROJECT TEAMS</span>
          <h1>프로젝트 팀</h1>
          <p>요구사항을 조직 레벨에서 먼저 분석한 뒤, 다섯 동급 팀 중 근거가 있는 대기 팀을 배정합니다.</p>
        </div>
        <div className="project-teams-runtime">
          <span className="project-teams-runtime-dot" />
          <div>
            <strong>
              {runningIntake
                ? "Organization Intake 실행 중"
                : runningReplan
                  ? "PM Recovery Replan 실행 중"
                  : runningRetrospective
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
          <small>
            {awaitingDecision
              ? "Product Owner 결정 입력"
              : awaitingRequirement
                ? "요구사항 입력 → 조직 분석 → 팀 배정"
                : "새 프로젝트 / Agent 실행 제어 / 복구 결정"}
          </small>
        </div>
        <input
          aria-label="프로젝트 팀 명령"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={
            awaitingDecision
              ? "결정 내용을 입력하세요"
              : awaitingRequirement
                ? "무엇을 만들지 입력하세요"
                : "/start, /decide, /pause, /resume, /stop"
          }
          disabled={commandLocked}
        />
        <button type="submit" disabled={commandLocked}>
          {commandLocked ? "실행 중" : "실행"}
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
                  {activeExecutionControl && activeProject.plan && (
                    <small>Execution control: {activeExecutionControl.state}</small>
                  )}
                  {activeProject.intake && (
                    <small>
                      Intake {activeProject.intake.id} · {activeProject.intake.complexity} · 핵심 역할 {activeProject.intake.criticalRoles.join(", ") || "없음"} · risk {activeProject.intake.riskFlags.join(", ") || "없음"}
                    </small>
                  )}
                  {activeProject.plan && activeProject.status !== "completed" && activeProject.status !== "retrospective" && (
                    <div>
                      <button
                        className="project-reset-button project-runtime-retry-button"
                        type="button"
                        onClick={handlePauseExecution}
                        disabled={commandLocked || activeExecutionControl?.state === "paused" || activeExecutionControl?.state === "pause-requested" || activeExecutionControl?.state === "stopped" || activeExecutionControl?.state === "stop-requested"}
                      >
                        일시정지
                      </button>
                      <button
                        className="project-reset-button project-runtime-retry-button"
                        type="button"
                        onClick={handleResumeExecution}
                        disabled={commandLocked || (activeExecutionControl?.state !== "paused" && activeExecutionControl?.state !== "pause-requested")}
                      >
                        재개
                      </button>
                      <button
                        className="project-reset-button project-runtime-retry-button"
                        type="button"
                        onClick={handleStopExecution}
                        disabled={commandLocked || activeExecutionControl?.state === "stopped" || activeExecutionControl?.state === "stop-requested"}
                      >
                        중지
                      </button>
                    </div>
                  )}
                  {activeProject.status === "queued" && !activeProject.plan && (
                    <button
                      className="project-reset-button project-runtime-retry-button"
                      type="button"
                      onClick={handleRetryPmRuntime}
                      disabled={runtimeBusy}
                    >
                      PM Runtime 실행
                    </button>
                  )}
                  {activeProject.status === "blocked" && activeProject.runtimeFailureSource && (
                    <small>
                      실패 단계: {activeProject.runtimeFailureSource === "pm" ? "PM Runtime" : "Agent Runtime"}
                    </small>
                  )}
                  {activeProject.status === "blocked" && latestFailureRoute?.route === "needs-human" && (
                    <small>
                      {latestProductOwnerDecision
                        ? `Product Owner 결정 기록: ${latestProductOwnerDecision.rationaleSummary}`
                        : `Product Owner 결정 필요: ${latestFailureRoute.recommendedAction} · /decide`}
                    </small>
                  )}
                  {activeProject.status === "blocked" && !activeProject.plan && (
                    <button
                      className="project-reset-button project-runtime-retry-button"
                      type="button"
                      onClick={handleRetryPmRuntime}
                      disabled={runtimeBusy}
                    >
                      PM Runtime 다시 실행
                    </button>
                  )}
                  {activeProject.status === "blocked"
                    && activeProject.plan
                    && pmRecoveryTrigger && (
                    <button
                      className="project-reset-button project-runtime-retry-button"
                      type="button"
                      onClick={handleRetryPmRuntime}
                      disabled={runtimeBusy}
                    >
                      {latestFailureRoute?.route === "needs-human"
                        ? "Product Owner 결정 기반 PM 재계획"
                        : "PM 복구 재계획 다시 실행"}
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
                  blockedActionLabel={blockedActionLabel}
                  blockedActionDisabled={latestFailureRoute?.route === "needs-human" && !latestProductOwnerDecision}
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
              <h3>Project Intake Agent</h3>
              <p>팀 배정 전에 요구사항, 사용자, 복잡도, 필요한 역할과 위험을 분석합니다. 특정 팀을 직접 고르지 않으며 결과는 PM이 독립 검증하는 evidence로만 사용합니다.</p>
              <div className="project-policy-meta">v{state.intakeAgentVersion ?? PROJECT_INTAKE_AGENT_VERSION}</div>
            </section>

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
