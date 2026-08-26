import type { OrganizationRuntimeSettings } from "./organization";
import type { AgentTaskRuntimeInput, DependencyArtifact } from "./runtime";
import type { ProjectTaskRun, ProjectTeamsState } from "./types";

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
      summary: dependencyRun.summary ?? dependencyTask.summary,
      branchName: dependencyRun.branchName,
      commitSha: dependencyRun.commitSha,
      pullRequestNumber: dependencyRun.pullRequestNumber,
      pullRequestUrl: dependencyRun.pullRequestUrl,
    };
  });

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
    summary: task.summary,
    acceptanceCriteria: task.acceptanceCriteria,
    userRequest: project.request,
    productSummary: project.plan.productSummary,
    architectureSummary: project.plan.architectureSummary,
    repositoryFullName: project.repositoryFullName,
    workspacePath: project.workspacePath,
    dependencies,
  };
}
