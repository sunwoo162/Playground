import { validateMarketingDocumentationPlan } from "./dataMarketing";
import type { AgentRole, ProjectPlan } from "./types";

export const REPOSITORY_WRITER_ROLES: Array<Exclude<AgentRole, "pm">> = [
  "design-system",
  "designer",
  "frontend",
  "frontend-ui",
  "frontend-state",
  "backend",
  "backend-api",
  "backend-domain",
  "integration",
  "test-automation",
  "performance",
  "observability",
  "database",
  "security",
  "devops",
  "accessibility",
  "data-marketing",
  "documentation",
  "debug-router",
];

export const REQUIRED_REVIEW_ROLES: Array<Exclude<AgentRole, "pm">> = [
  "code-review",
  "reviewer",
  "qa",
];

function taskById(plan: ProjectPlan) {
  return new Map(plan.tasks.map((task) => [task.id, task]));
}

export function taskTransitivelyDependsOn(
  plan: ProjectPlan,
  taskId: string,
  dependencyTaskId: string,
): boolean {
  const tasks = taskById(plan);
  const visited = new Set<string>();
  const stack = [...(tasks.get(taskId)?.dependsOn ?? [])];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    if (current === dependencyTaskId) return true;
    visited.add(current);
    stack.push(...(tasks.get(current)?.dependsOn ?? []));
  }

  return false;
}

function downstreamTasks(
  plan: ProjectPlan,
  sourceTaskId: string,
  role: Exclude<AgentRole, "pm">,
) {
  return plan.tasks.filter(
    (task) => task.role === role && taskTransitivelyDependsOn(plan, task.id, sourceTaskId),
  );
}

export function validateProjectPlanReviewTopology(plan: ProjectPlan) {
  validateMarketingDocumentationPlan(plan);

  const repositoryWriters = plan.tasks.filter((task) =>
    REPOSITORY_WRITER_ROLES.includes(task.role),
  );

  if (repositoryWriters.length === 0) {
    return;
  }

  const errors: string[] = [];

  for (const writer of repositoryWriters) {
    const codeReviews = downstreamTasks(plan, writer.id, "code-review");
    if (codeReviews.length === 0) {
      errors.push(`${writer.id}(${writer.role}) 이후 Code Review Task가 없습니다.`);
      continue;
    }

    const reviewers = plan.tasks.filter(
      (task) =>
        task.role === "reviewer"
        && codeReviews.some((codeReview) =>
          taskTransitivelyDependsOn(plan, task.id, codeReview.id),
        ),
    );
    if (reviewers.length === 0) {
      errors.push(`${writer.id}(${writer.role})의 Code Review 이후 Reviewer Task가 없습니다.`);
      continue;
    }

    const qaTasks = plan.tasks.filter(
      (task) =>
        task.role === "qa"
        && reviewers.some((reviewer) =>
          taskTransitivelyDependsOn(plan, task.id, reviewer.id),
        ),
    );
    if (qaTasks.length === 0) {
      errors.push(`${writer.id}(${writer.role})의 Reviewer 이후 QA Task가 없습니다.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `PM Task DAG의 PR 검증 경로가 불완전합니다. ${errors.join(" ")} `
      + "Repository 변경 Task마다 downstream Code Review → Reviewer → QA 경로가 필요합니다. "
      + "Documentation 또는 Data & Marketing Agent가 QA 이후 PR을 만들면 해당 Task 뒤에 별도의 Review/QA 경로가 필요합니다.",
    );
  }
}
