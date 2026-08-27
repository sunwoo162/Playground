import type { AgentRole, ProjectTaskRun, TeamId } from "./types";

export const AGENT_ROLE_INSTANCE_COUNTS = {
  idea: 1,
  pm: 1,
  "ux-research": 1,
  "design-system": 1,
  designer: 1,
  frontend: 3,
  backend: 3,
  database: 1,
  "api-integration": 1,
  security: 1,
  performance: 1,
  devops: 1,
  accessibility: 1,
  "test-automation": 1,
  "data-marketing": 1,
  "code-review": 2,
  reviewer: 1,
  qa: 2,
  documentation: 2,
  "debug-router": 1,
  "user-a": 1,
  "user-b": 1,
  "process-evaluator": 1,
} as const satisfies Record<AgentRole, number>;

export const BLOOM_TEAM_AGENT_COUNT = Object.values(AGENT_ROLE_INSTANCE_COUNTS)
  .reduce((total, count) => total + count, 0);

export function agentIdsForRole(teamId: TeamId, role: AgentRole): string[] {
  const count = AGENT_ROLE_INSTANCE_COUNTS[role];
  return Array.from({ length: count }, (_, index) =>
    index === 0 ? `${teamId}:${role}` : `${teamId}:${role}-${index + 1}`,
  );
}

function teamIdFromAgentId(agentId: string): TeamId | null {
  const separator = agentId.indexOf(":");
  if (separator <= 0) return null;
  return agentId.slice(0, separator) as TeamId;
}

function isUntouchedRun(run: ProjectTaskRun) {
  return run.attempts === 0
    && (run.status === "pending" || run.status === "ready")
    && run.branchName === null
    && run.worktreePath === null
    && run.sessionId === null
    && run.commitSha === null
    && run.pullRequestNumber === null;
}

export function assignTaskRunAgentsPreservingStarted(taskRuns: ProjectTaskRun[]): ProjectTaskRun[] {
  if (taskRuns.length === 0) return taskRuns;

  const teamId = teamIdFromAgentId(taskRuns[0].agentId);
  if (!teamId) return taskRuns;

  const roleOffsets = new Map<AgentRole, number>();
  return taskRuns.map((run) => {
    const pool = agentIdsForRole(teamId, run.role);
    const offset = roleOffsets.get(run.role) ?? 0;
    roleOffsets.set(run.role, offset + 1);

    if (!isUntouchedRun(run)) return run;
    const agentId = pool[offset % pool.length];
    return agentId === run.agentId ? run : { ...run, agentId };
  });
}

export function assignInitialTaskRunAgents(taskRuns: ProjectTaskRun[]): ProjectTaskRun[] {
  if (!taskRuns.every(isUntouchedRun)) return taskRuns;
  return assignTaskRunAgentsPreservingStarted(taskRuns);
}
