import { useCallback, useEffect, useRef, useState } from "react";

import "./RemoteExecutionController.css";
import {
  hasRemoteRunnerSessionToken,
  loadRemoteRunnerSettings,
  submitRemoteProject,
} from "../projectTeams/remoteRunner";
import {
  getRemoteExecution,
  listRemoteExecutions,
  recordRemoteSubmission,
} from "../projectTeams/remoteExecutionState";
import { syncRemoteExecution } from "../projectTeams/remoteExecutionSync";
import { loadOrganizationRuntimeSettings } from "../projectTeams/organization";
import { loadProjectTeamsState } from "../projectTeams/store";

const POLL_INTERVAL_MS = 3000;

function isSafeForInitialRemoteHandoff(
  project: ReturnType<typeof loadProjectTeamsState>["projects"][number],
) {
  return project.taskRuns.length > 0
    && project.taskRuns.every(
      (run) =>
        run.attempts === 0
        && (run.status === "pending" || run.status === "ready"),
    );
}

function jobStatusLabel(status: string) {
  switch (status) {
    case "queued":
      return "원격 대기";
    case "running":
      return "원격 실행 중";
    case "succeeded":
      return "원격 작업 완료";
    case "failed":
      return "원격 실행 실패";
    case "cancelled":
      return "원격 작업 취소됨";
    default:
      return status;
  }
}

export function RemoteExecutionController() {
  const [message, setMessage] = useState("Remote Runner handoff를 준비 중입니다.");
  const [busy, setBusy] = useState(false);
  const runningRef = useRef(false);

  const synchronize = useCallback(async () => {
    const runnerSettings = loadRemoteRunnerSettings();
    if (runnerSettings.mode !== "remote" || runningRef.current) return;

    runningRef.current = true;
    setBusy(true);
    try {
      let state = loadProjectTeamsState();
      const activeProjects = state.projects.filter((project) =>
        state.teams.some((team) => team.activeProjectId === project.id),
      );
      const plannedProjects = activeProjects.filter(
        (project) => project.plan && project.status !== "completed",
      );

      if (plannedProjects.length === 0) {
        setMessage("Remote 모드 · PM 계획이 완료된 프로젝트를 기다리고 있습니다.");
        return;
      }

      for (const project of plannedProjects) {
        let record = getRemoteExecution(project.id);

        if (!record) {
          if (!isSafeForInitialRemoteHandoff(project)) {
            const attempted = project.taskRuns.filter((run) => run.attempts > 0).length;
            setMessage(
              attempted > 0
                ? `${project.plan?.projectName ?? project.id} · 이미 로컬 Agent 실행 이력이 있어 자동 Remote handoff를 차단했습니다.`
                : `${project.plan?.projectName ?? project.id} · Remote handoff 가능한 초기 Task 상태가 아닙니다.`,
            );
            continue;
          }

          if (!hasRemoteRunnerSessionToken()) {
            setMessage(
              `${project.plan?.projectName ?? project.id} · PM 계획 완료 · Runner 세션 토큰 입력 후 자동 handoff됩니다.`,
            );
            continue;
          }

          const job = await submitRemoteProject(
            state,
            project.id,
            loadOrganizationRuntimeSettings(),
            runnerSettings,
          );
          record = recordRemoteSubmission(job, runnerSettings.baseUrl);
          setMessage(
            `${project.plan?.projectName ?? project.id} · Runner Job ${job.id.slice(0, 8)} 제출 완료 · ${jobStatusLabel(job.status)}`,
          );
        }

        if (!hasRemoteRunnerSessionToken()) {
          setMessage(
            `${project.plan?.projectName ?? project.id} · ${jobStatusLabel(record.status)} · 상태 동기화를 위해 Runner 세션 토큰을 다시 입력해 주세요.`,
          );
          continue;
        }

        const synced = await syncRemoteExecution(state, project.id);
        if (!synced) continue;
        state = synced.state;

        if (synced.appliedTaskCount > 0) {
          setMessage(
            `${project.plan?.projectName ?? project.id} · 원격 Agent 결과 ${synced.appliedTaskCount}개를 Luna 상태에 반영했습니다.`,
          );
          window.setTimeout(() => window.location.reload(), 80);
          return;
        }

        if (synced.job.status === "failed") {
          setMessage(
            `${project.plan?.projectName ?? project.id} · Remote Runner 실패 · ${synced.job.error ?? "원격 로그를 확인해 주세요."}`,
          );
        } else if (synced.job.status === "cancelled") {
          setMessage(`${project.plan?.projectName ?? project.id} · Remote Runner 작업이 취소됐습니다.`);
        } else if (synced.job.status === "succeeded") {
          setMessage(
            `${project.plan?.projectName ?? project.id} · 원격 Agent 실행 완료 · Luna Task 결과 동기화 완료`,
          );
        } else {
          setMessage(
            `${project.plan?.projectName ?? project.id} · ${jobStatusLabel(synced.job.status)} · 노트북을 닫아도 Runner가 계속 실행합니다.`,
          );
        }
      }
    } catch (error) {
      setMessage(
        `Remote Runner 동기화 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const runnerSettings = loadRemoteRunnerSettings();
    if (runnerSettings.mode !== "remote") return undefined;

    void synchronize();
    const timer = window.setInterval(() => {
      void synchronize();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [synchronize]);

  if (loadRemoteRunnerSettings().mode !== "remote") {
    return null;
  }

  const records = listRemoteExecutions();
  return (
    <div className="remote-execution-banner" role="status">
      <div>
        <span className="remote-execution-kicker">REMOTE RUNNER</span>
        <strong>{message}</strong>
        <small>등록된 원격 프로젝트 {records.length}개 · 토큰은 앱 종료 시 메모리에서 제거됩니다.</small>
      </div>
      <button type="button" onClick={() => void synchronize()} disabled={busy}>
        {busy ? "동기화 중" : "지금 동기화"}
      </button>
    </div>
  );
}
