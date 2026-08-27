export type BuilderWorkerClaim = {
  runId: number;
  projectId: number;
  workerId: string;
  status: "running";
  leaseExpiresAt: string;
  claimCount: number;
  title: string;
  brief: string;
  platform: string;
  features: string[];
  authRequired: boolean;
  templateId: string | null;
  repositoryFullName: string | null;
  previewUrl: string | null;
};

export type BuilderWorkerRunState = {
  runId: number;
  projectId: number;
  workerId: string;
  status: "running" | "completed" | "failed";
  failureReason: string | null;
  startedAt: string | null;
  heartbeatAt: string | null;
  leaseExpiresAt: string | null;
  finishedAt: string | null;
  claimCount: number;
};

export type BuilderWorkerExecutionResult = {
  repositoryFullName: string | null;
  previewUrl: string | null;
};

export type BuilderWorkerClient = {
  claim(workerId: string): Promise<BuilderWorkerClaim | null>;
  heartbeat(runId: number, workerId: string): Promise<BuilderWorkerRunState>;
  complete(
    runId: number,
    workerId: string,
    result: BuilderWorkerExecutionResult,
  ): Promise<BuilderWorkerRunState>;
  fail(runId: number, workerId: string, failureReason: string): Promise<BuilderWorkerRunState>;
};

export type BuilderWorkerExecutor = (
  claim: BuilderWorkerClaim,
) => Promise<BuilderWorkerExecutionResult>;

export type BuilderWorkerTimer = {
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
};

export type BuilderWorkerCycleOutcome =
  | { status: "idle" }
  | { status: "completed"; claim: BuilderWorkerClaim; state: BuilderWorkerRunState }
  | { status: "failed"; claim: BuilderWorkerClaim; state: BuilderWorkerRunState }
  | { status: "lease-lost"; claim: BuilderWorkerClaim; reason: string }
  | { status: "terminal-report-failed"; claim: BuilderWorkerClaim; reason: string };

export const BUILDER_WORKER_HEARTBEAT_INTERVAL_MS = 30_000;

const DEFAULT_TIMER: BuilderWorkerTimer = {
  setInterval(callback, intervalMs) {
    return globalThis.setInterval(callback, intervalMs);
  },
  clearInterval(handle) {
    globalThis.clearInterval(handle as number);
  },
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function failureReason(error: unknown) {
  const normalized = errorMessage(error).replace(/\s+/g, " ").trim();
  const value = normalized || "Builder worker executor failed without an error message.";
  return value.length <= 1000 ? value : `${value.slice(0, 997)}...`;
}

async function finalLeaseCheck(
  client: BuilderWorkerClient,
  claim: BuilderWorkerClaim,
): Promise<string | null> {
  try {
    await client.heartbeat(claim.runId, claim.workerId);
    return null;
  } catch (error) {
    return `terminal state 전 lease 확인 실패: ${errorMessage(error)}`;
  }
}

export async function runBuilderWorkerOnce(
  client: BuilderWorkerClient,
  workerId: string,
  executor: BuilderWorkerExecutor,
  options: {
    heartbeatIntervalMs?: number;
    timer?: BuilderWorkerTimer;
  } = {},
): Promise<BuilderWorkerCycleOutcome> {
  const claim = await client.claim(workerId);
  if (!claim) {
    return { status: "idle" };
  }

  const intervalMs = options.heartbeatIntervalMs ?? BUILDER_WORKER_HEARTBEAT_INTERVAL_MS;
  if (!Number.isInteger(intervalMs) || intervalMs <= 0 || intervalMs >= 90_000) {
    throw new Error("Builder worker heartbeat interval은 1ms 이상 90초 미만이어야 합니다.");
  }

  const timer = options.timer ?? DEFAULT_TIMER;
  let stopped = false;
  let leaseError: string | null = null;
  let heartbeatChain: Promise<void> = Promise.resolve();

  const scheduleHeartbeat = () => {
    heartbeatChain = heartbeatChain.then(async () => {
      if (stopped || leaseError) return;
      try {
        await client.heartbeat(claim.runId, claim.workerId);
      } catch (error) {
        leaseError = `heartbeat 실패: ${errorMessage(error)}`;
      }
    });
  };

  const timerHandle = timer.setInterval(scheduleHeartbeat, intervalMs);
  let executionResult: BuilderWorkerExecutionResult | null = null;
  let executionError: unknown = null;

  try {
    executionResult = await executor(claim);
  } catch (error) {
    executionError = error;
  } finally {
    stopped = true;
    timer.clearInterval(timerHandle);
    await heartbeatChain;
  }

  if (leaseError) {
    return { status: "lease-lost", claim, reason: leaseError };
  }

  const terminalLeaseError = await finalLeaseCheck(client, claim);
  if (terminalLeaseError) {
    return { status: "lease-lost", claim, reason: terminalLeaseError };
  }

  if (executionError !== null) {
    try {
      const state = await client.fail(claim.runId, claim.workerId, failureReason(executionError));
      return { status: "failed", claim, state };
    } catch (error) {
      return {
        status: "terminal-report-failed",
        claim,
        reason: `worker 실패 상태 보고 실패: ${errorMessage(error)}`,
      };
    }
  }

  if (!executionResult) {
    return {
      status: "terminal-report-failed",
      claim,
      reason: "executor가 성공 결과를 반환하지 않았습니다.",
    };
  }

  try {
    const state = await client.complete(claim.runId, claim.workerId, executionResult);
    return { status: "completed", claim, state };
  } catch (error) {
    return {
      status: "terminal-report-failed",
      claim,
      reason: `worker 완료 상태 보고 실패: ${errorMessage(error)}`,
    };
  }
}
