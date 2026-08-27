import { evaluateProjectMergeGate } from "./mergeGate";
import { mergeProjectPullRequests } from "./runtime";
import type { ProjectState } from "./types";
import { cleanupProjectWorktrees, summarizeWorktreeCleanup } from "./worktreeLifecycle";

export type IntegrateProjectResult =
  | {
      ok: true;
      mergedPullRequestNumbers: number[];
      message: string;
    }
  | {
      ok: false;
      reasons: string[];
      message: string;
    };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function integrateProjectPullRequests(
  project: ProjectState,
): Promise<IntegrateProjectResult> {
  if (!project.repositoryFullName) {
    return {
      ok: false,
      reasons: ["Project repository가 준비되지 않았습니다."],
      message: "PR 통합을 시작할 수 없습니다.",
    };
  }

  const gate = evaluateProjectMergeGate(project);
  if (!gate.ready) {
    return {
      ok: false,
      reasons: gate.reasons,
      message: `PR merge gate 대기 · ${gate.reasons.join(" · ")}`,
    };
  }

  const result = await mergeProjectPullRequests({
    repositoryFullName: project.repositoryFullName,
    pullRequestNumbers: gate.pullRequestNumbers,
  });
  const mergedPullRequestNumbers = result.mergedPullRequests.map((pullRequest) => pullRequest.number);

  let cleanupMessage = "worktree lifecycle 미실행";
  try {
    const cleanup = await cleanupProjectWorktrees(project);
    cleanupMessage = summarizeWorktreeCleanup(cleanup);
  } catch (error) {
    cleanupMessage = `worktree 정리 경고: ${errorMessage(error)}`;
  }

  return {
    ok: true,
    mergedPullRequestNumbers,
    message: `develop 통합 완료 · ${mergedPullRequestNumbers.map((number) => `#${number}`).join(", ")} · ${cleanupMessage}`,
  };
}
