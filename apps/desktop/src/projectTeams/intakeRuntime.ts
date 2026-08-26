import { invoke } from "@tauri-apps/api/core";

import type { ProjectIntakeAnalysis, ProjectIntakeRecord } from "./types";

export const PROJECT_INTAKE_AGENT_VERSION = "1.0.0";

export type AnalyzeProjectIntakeInput = {
  organization: string;
  workspaceRoot: string;
  request: string;
};

type AnalyzeProjectIntakeRuntimeResult = {
  analysis: ProjectIntakeAnalysis;
  sessionId: string | null;
  eventsPath: string;
  outputPath: string;
};

function createIntakeId() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INTAKE-${time}-${random}`;
}

export async function analyzeProjectIntake(
  input: AnalyzeProjectIntakeInput,
): Promise<ProjectIntakeRecord> {
  const request = input.request.trim();
  if (!request) {
    throw new Error("프로젝트 요구사항을 입력해 주세요.");
  }
  if (!input.workspaceRoot.trim()) {
    throw new Error("Workspace root를 먼저 설정해 주세요.");
  }

  const id = createIntakeId();
  const result = await invoke<AnalyzeProjectIntakeRuntimeResult>("analyze_project_intake", {
    organization: input.organization,
    workspaceRoot: input.workspaceRoot,
    intakeId: id,
    request,
  });

  return {
    id,
    agentVersion: PROJECT_INTAKE_AGENT_VERSION,
    ...result.analysis,
    sessionId: result.sessionId,
    eventsPath: result.eventsPath,
    outputPath: result.outputPath,
    createdAt: new Date().toISOString(),
  };
}
