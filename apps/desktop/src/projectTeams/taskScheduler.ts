import { getProjectEvolutionInstructions } from "./evolutionExperiments";
import { failureRecoveryContext } from "./failureRouting";
import type { OrganizationRuntimeSettings } from "./organization";
import type { AgentTaskRuntimeInput, DependencyArtifact } from "./runtime";
import type { ProjectTaskRun, ProjectTeamsState } from "./types";

function dependencySummary(
  run: ProjectTaskRun,
  fallbackSummary: string,
) {
  const base = run.summary ?? fallbackSummary;
  if (run.reviewedPullRequests.length === 0) {
    return base;
  }

  return `${base} | upstream reviewed PRs: ${run.reviewedPullRequests
    .map((number) => `#${number}`)
    .join(", ")}`;
}

function evolutionContext(
  state: ProjectTeamsState,
  project: ProjectTeamsState["projects"][number],
  run: ProjectTaskRun,
) {
  const experiment = getProjectEvolutionInstructions(state, project, run.agentId);
  if (!experiment) return null;

  const playbook = experiment.playbookChanges.length > 0
    ? experiment.playbookChanges.map((change) => `- ${change}`).join("\n")
    : "- 이번 실험에서 별도 Team playbook 변경 없음";
  const agent = experiment.agentInstructions.length > 0
    ? experiment.agentInstructions.map((change) => `- ${change}`).join("\n")
    : "- 이 Agent 전용 변경 없음. Team playbook 실험만 독립적으로 적용";

  return [
    `TEAM EVOLUTION EXPERIMENT ${experiment.experimentId}`,
    `Candidate team playbook version: ${experiment.playbookVersion}`,
    "이 변경은 이전 프로젝트 회고에서 나온 가설이며 권위가 아닙니다. 실제 repository/테스트/요구사항과 충돌하면 근거를 남기고 안전한 쪽을 우선하세요.",
    "Experimental team playbook changes:",
    playbook,
    "Experimental agent-specific objective:",
    agent,
    "최종 결과에는 실험 지침이 도움이 됐는지 또는 방해가 됐는지 관찰 가능한 evidence를 남기세요.",
  ].join("\n");
}

export function buildAgentTaskRuntimeInput(
  state: ProjectTeamsState,
  projectId: string,
  run: ProjectTaskRun,
  runtimeSettings: OrganizationRuntimeSettings,
): AgentTaskRuntimeInput {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project?.plan || !project.repositoryFullName || !project.workspacePath) {
    throw new Error("PM 계획 또는 project repository/workspace가 준비되지 않았습니다.");
  }

  const team = state.teams.find((item) => item.id === project.teamId);
  if (!team) {
    throw new Error(`프로젝트 팀을 찾을 수 없습니다: ${project.teamId}`);
  }

  const task = project.plan.tasks.find((item) => item.id === run.taskId);
  if (!task) {
    throw new Error(`PM Task를 찾을 수 없습니다: ${run.taskId}`);
  }

  const dependencies: DependencyArtifact[] = task.dependsOn.map((dependencyId) => {
    const dependencyRun = project.taskRuns.find((item) => item.taskId === dependencyId);
    const dependencyTask = project.plan?.tasks.find((item) => item.id === dependencyId);
    if (!dependencyRun || !dependencyTask || dependencyRun.status !== "done") {
      throw new Error(`${task.id}의 dependency ${dependencyId}가 완료되지 않았습니다.`);
    }

    return {
      taskId: dependencyId,
      role: dependencyRun.role,
      summary: dependencySummary(dependencyRun, dependencyTask.summary),
      branchName: dependencyRun.branchName,
      commitSha: dependencyRun.commitSha,
      pullRequestNumber: dependencyRun.pullRequestNumber,
      pullRequestUrl: dependencyRun.pullRequestUrl,
    };
  });

  const summary = [
    task.summary,
    failureRecoveryContext(project, task.id),
    evolutionContext(state, project, run),
  ].filter((value): value is string => Boolean(value?.trim())).join("\n\n");

  return {
    organization: runtimeSettings.organization,
    projectId: project.id,
    teamId: project.teamId,
    teamName: team.name,
    role: task.role,
    agentId: run.agentId,
    taskId: task.id,
    taskSlug: task.taskSlug,
    title: task.title,
    summary,
    acceptanceCriteria: task.acceptanceCriteria,
    userRequest: project.request,
    productSummary: project.plan.productSummary,
    architectureSummary: project.plan.architectureSummary,
    repositoryFullName: project.repositoryFullName,
    workspacePath: project.workspacePath,
    dependencies,
  };
}
