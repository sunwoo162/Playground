import type {
  ExecutableAgentRole,
  ProjectPlan,
  ProjectTaskRun,
  TeamId,
} from "./types";

export const AGENT_ROLE_CAPACITY: Partial<Record<ExecutableAgentRole, number>> = {
  frontend: 3,
  backend: 3,
  "code-review": 2,
  qa: 2,
  documentation: 2,
};

export function agentRoleCapacity(role: ExecutableAgentRole) {
  return AGENT_ROLE_CAPACITY[role] ?? 1;
}

export function agentIdForRoleInstance(
  teamId: TeamId,
  role: ExecutableAgentRole,
  instance: number,
) {
  const capacity = agentRoleCapacity(role);
  const boundedInstance = Math.min(Math.max(Math.trunc(instance), 1), capacity);
  return `${teamId}:${role}${boundedInstance > 1 ? `-${boundedInstance}` : ""}`;
}

function teamIdFromAgentId(agentId: string): TeamId | null {
  const separator = agentId.indexOf(":");
  if (separator <= 0) return null;
  const value = agentId.slice(0, separator);
  if (["rose", "lily", "tulip", "sunflower", "cherry-blossom"].includes(value)) {
    return value as TeamId;
  }
  return null;
}

function hasExecutionEvidence(run: ProjectTaskRun) {
  return run.attempts > 0
    || run.startedAt !== null
    || run.completedAt !== null
    || run.branchName !== null
    || run.worktreePath !== null
    || run.sessionId !== null
    || run.commitSha !== null
    || run.pullRequestNumber !== null;
}

/**
 * Deterministically spreads unstarted tasks across the independent Agent identities
 * available for their role. Existing execution evidence is never reassigned, which
 * keeps crash recovery and historical branch/session ownership stable.
 */
export function assignTaskRunsToAgentPool(
  plan: ProjectPlan,
  taskRuns: ProjectTaskRun[],
): ProjectTaskRun[] {
  if (taskRuns.length === 0) return taskRuns;

  const teamId = taskRuns
    .map((run) => teamIdFromAgentId(run.agentId))
    .find((value): value is TeamId => value !== null);
  if (!teamId) return taskRuns;

  const runByTaskId = new Map(taskRuns.map((run) => [run.taskId, run]));
  const roleOrdinals = new Map<ExecutableAgentRole, number>();
  const runningAgentIds = new Set(
    taskRuns.filter((run) => run.status === "running").map((run) => run.agentId),
  );
  const assignments = new Map<string, string>();

  for (const task of plan.tasks) {
    const run = runByTaskId.get(task.id);
    if (!run) continue;

    const ordinal = (roleOrdinals.get(task.role) ?? 0) + 1;
    roleOrdinals.set(task.role, ordinal);

    if (hasExecutionEvidence(run)) {
      assignments.set(task.id, run.agentId);
      continue;
    }

    const capacity = agentRoleCapacity(task.role);
    const preferredInstance = ((ordinal - 1) % capacity) + 1;
    let agentId = agentIdForRoleInstance(teamId, task.role, preferredInstance);

    if (runningAgentIds.has(agentId) && capacity > 1) {
      for (let offset = 1; offset < capacity; offset += 1) {
        const candidateInstance = ((preferredInstance - 1 + offset) % capacity) + 1;
        const candidate = agentIdForRoleInstance(teamId, task.role, candidateInstance);
        if (!runningAgentIds.has(candidate)) {
          agentId = candidate;
          break;
        }
      }
    }

    assignments.set(task.id, agentId);
  }

  return taskRuns.map((run) => {
    const agentId = assignments.get(run.taskId);
    if (!agentId || agentId === run.agentId || hasExecutionEvidence(run)) return run;
    return { ...run, agentId };
  });
}
