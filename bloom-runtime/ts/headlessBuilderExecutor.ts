import type {
  BuilderWorkerClaim,
  BuilderWorkerClient,
  BuilderWorkerExecutionResult,
  BuilderWorkerExecutor,
  BuilderOrchestrationSnapshot,
} from "./builderWorkerAdapter";
import { evaluateHarnessPackProjectCompletion } from "./harnessProjectCompletionGate";
import {
  legacyUnboundHarnessPackBinding,
  resolveHarnessPackBinding,
  validateHarnessPackBinding,
  type HarnessPackBinding,
} from "./harnessPackBinding";
import { assertHarnessPackPlan } from "./harnessPackPlanPolicy";
import { evaluateProjectMergeGate } from "./mergeGate";
import {
  prepareOrchestrationPlan,
  refreshOrchestrationReadiness,
  selectAdaptiveOrchestrationWave,
  summarizeTaskRuns,
} from "./orchestrationCore";
import { seniorAgentContext } from "./seniorAgent";
import {
  applyRuntimeCompletionToTaskRun,
  declaredDependencyPullRequestsForTask,
} from "./runtimeTaskCompletion";
import type { RuntimeCompletionObservations } from "./runtimeCompletionAdapter";
import {
  lunaVisualStylePlanningContext,
  lunaVisualStyleTaskContext,
} from "./lunaVisualStyle";
import type {
  AgentTaskVerification,
  ExecutableAgentRole,
  ProjectIntakeAnalysis,
  ProjectPlan,
  ProjectTaskPlan,
  ProjectTaskRun,
  ScaffoldProfile,
  TeamId,
} from "./types";

export const HEADLESS_BUILDER_SNAPSHOT_SCHEMA_VERSION = 2;

type IntakeResult = {
  analysis: ProjectIntakeAnalysis;
  sessionId: string | null;
  eventsPath: string;
  outputPath: string;
};

type PmResult = {
  plan: ProjectPlan;
  sessionId: string | null;
  eventsPath: string;
  outputPath: string;
};

type ProjectRepositoryBootstrap = {
  repository: string;
  workspacePath: string;
  createdRepository: boolean;
  clonedRepository: boolean;
  releaseBranch: string;
  integrationBranch: string;
};

type GreenfieldBootstrapEvidence = {
  profile: ScaffoldProfile;
  commitSha: string | null;
  generatedFiles: string[];
};

type DependencyArtifact = {
  taskId: string;
  role: string;
  summary: string;
  branchName: string | null;
  commitSha: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
};

export type HeadlessAgentTaskRuntimeInput = {
  organization: string;
  projectId: string;
  teamId: TeamId;
  teamName: string;
  role: ExecutableAgentRole;
  agentId: string;
  taskId: string;
  taskSlug: string;
  title: string;
  summary: string;
  acceptanceCriteria: string[];
  userRequest: string;
  productSummary: string;
  architectureSummary: string;
  repositoryFullName: string;
  workspacePath: string;
  dependencies: DependencyArtifact[];
};

type AgentTaskReport = {
  status: "completed" | "blocked";
  summary: string;
  rationaleSummary: string;
  evidence: string[];
  verification: AgentTaskVerification[];
  commitSha: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  reviewedPullRequests: number[];
  blockers: string[];
};

export type HeadlessAgentTaskRunResult = {
  projectId: string;
  taskId: string;
  role: string;
  agentId: string;
  branchName: string | null;
  worktreePath: string;
  threadId: string;
  sessionId: string;
  turnId: string;
  eventsPath: string;
  stderrPath: string;
  report: AgentTaskReport;
  completionObservations?: RuntimeCompletionObservations | null;
};

export type ReconcileInterruptedAgentTaskResult = {
  outcome: "recovered" | "retryable" | "blocked";
  reason: string;
  result: HeadlessAgentTaskRunResult | null;
};

type MergeProjectPullRequestsResult = {
  repositoryFullName: string;
  mergedPullRequests: Array<{
    number: number;
    url: string;
    headBranch: string;
    mergeCommitSha: string | null;
  }>;
};

export type ReleasePromotionResult = {
  repositoryFullName: string;
  releaseSha: string;
  releasePullRequestNumber: number | null;
};

export type HeadlessBuilderRuntime = {
  analyzeIntake(input: {
    organization: string;
    workspaceRoot: string;
    intakeId: string;
    request: string;
  }): Promise<IntakeResult>;
  planProject(input: {
    organization: string;
    workspaceRoot: string;
    projectId: string;
    teamId: TeamId;
    teamName: string;
    request: string;
    harnessPackBinding: HarnessPackBinding;
  }): Promise<PmResult>;
  bootstrapRepository(input: {
    organization: string;
    repository: string;
    workspaceRoot: string;
  }): Promise<ProjectRepositoryBootstrap>;
  bootstrapGreenfieldProject?(input: {
    repositoryFullName: string;
    workspacePath: string;
    integrationBranch: string;
    scaffoldProfile: ScaffoldProfile;
  }): Promise<GreenfieldBootstrapEvidence>;
  dispatchTask(input: HeadlessAgentTaskRuntimeInput): Promise<HeadlessAgentTaskRunResult>;
  reconcileTask(input: {
    projectId: string;
    teamId: TeamId;
    role: ExecutableAgentRole;
    agentId: string;
    taskId: string;
    taskSlug: string;
    repositoryFullName: string;
    workspacePath: string;
  }): Promise<ReconcileInterruptedAgentTaskResult>;
  mergePullRequests(input: {
    repositoryFullName: string;
    pullRequestNumbers: number[];
  }): Promise<MergeProjectPullRequestsResult>;
  promoteRelease?(input: {
    repositoryFullName: string;
    integrationBranch: string;
    releaseBranch: string;
  }): Promise<ReleasePromotionResult>;
};

type PersistedPmEvidence = {
  sessionId: string | null;
  eventsPath: string;
  outputPath: string;
};

export type HeadlessBuilderSnapshotPayload = {
  schemaVersion: 2;
  harnessPackBinding: HarnessPackBinding;
  runId: number;
  projectId: number;
  runtimeProjectId: string;
  intakeId: string;
  request: string;
  intake: IntakeResult | null;
  pm: PersistedPmEvidence | null;
  plan: ProjectPlan | null;
  repository: ProjectRepositoryBootstrap | null;
  bootstrap?: GreenfieldBootstrapEvidence | null;
  taskRuns: ProjectTaskRun[];
  integrationPullRequestNumbers: number[];
  integration: MergeProjectPullRequestsResult | null;
  release?: ReleasePromotionResult | null;
  blockedReason: string | null;
};

export type HeadlessBuilderExecutorOptions = {
  organization: string;
  workspaceRoot: string;
  teamId: TeamId;
  teamName: string;
  runtime: HeadlessBuilderRuntime;
  maxParallelTasks?: number;
  now?: () => string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function buildClaimRequest(claim: BuilderWorkerClaim) {
  const features = claim.features.map((feature) => feature.trim()).filter(Boolean);
  return [
    `Project title: ${claim.title.trim()}`,
    claim.brief.trim(),
    `Target platform: ${claim.platform.trim() || "web"}`,
    features.length > 0 ? `Requested features: ${features.join(", ")}` : "Requested features: none specified",
    `Authentication required by Product Owner: ${claim.authRequired ? "yes" : "no"}`,
    claim.templateId ? `Selected template: ${claim.templateId}` : "Selected template: none",
  ].filter(Boolean).join("\n");
}

function freshPayload(claim: BuilderWorkerClaim): HeadlessBuilderSnapshotPayload {
  const request = buildClaimRequest(claim);
  return {
    schemaVersion: HEADLESS_BUILDER_SNAPSHOT_SCHEMA_VERSION,
    harnessPackBinding: resolveHarnessPackBinding({ intent: claim.brief.trim(), explicitPack: claim.harnessPackId ?? undefined }),
    runId: claim.runId, projectId: claim.projectId,
    runtimeProjectId: `builder-${claim.projectId}`, intakeId: `builder-run-${claim.runId}`,
    request, intake: null, pm: null, plan: null, repository: null, bootstrap: null,
    taskRuns: [], integrationPullRequestNumbers: [], integration: null, release: null, blockedReason: null,
  };
}

function parseSnapshot(
  claim: BuilderWorkerClaim,
  snapshot: BuilderOrchestrationSnapshot,
): { payload: HeadlessBuilderSnapshotPayload; migratedLegacy: boolean } {
  if (snapshot.schemaVersion !== 1 && snapshot.schemaVersion !== HEADLESS_BUILDER_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`지원하지 않는 Builder orchestration snapshot schema입니다: ${snapshot.schemaVersion}`);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(snapshot.payloadJson); }
  catch (error) { throw new Error(`Builder orchestration snapshot JSON 파싱 실패: ${errorMessage(error)}`); }
  if (!parsed || typeof parsed !== "object") throw new Error("Builder orchestration snapshot payload가 객체가 아닙니다.");
  const payload = parsed as Partial<Omit<HeadlessBuilderSnapshotPayload, "schemaVersion" | "harnessPackBinding">> & { schemaVersion?: number; harnessPackBinding?: unknown };
  if ((payload.schemaVersion !== 1 && payload.schemaVersion !== HEADLESS_BUILDER_SNAPSHOT_SCHEMA_VERSION)
    || payload.runId !== claim.runId || payload.projectId !== claim.projectId
    || typeof payload.runtimeProjectId !== "string" || typeof payload.intakeId !== "string"
    || typeof payload.request !== "string" || !Array.isArray(payload.taskRuns)
    || !Array.isArray(payload.integrationPullRequestNumbers)) {
    throw new Error("Builder orchestration snapshot identity 또는 필수 필드가 손상되었습니다.");
  }
  if (snapshot.schemaVersion !== payload.schemaVersion) {
    throw new Error(`Builder orchestration snapshot schema mismatch: outer=${snapshot.schemaVersion}, payload=${String(payload.schemaVersion)}.`);
  }
  const migratedLegacy = snapshot.schemaVersion === 1 || payload.schemaVersion === 1;
  const harnessPackBinding = migratedLegacy
    ? legacyUnboundHarnessPackBinding("Legacy Builder snapshot predates live pack binding.")
    : validateHarnessPackBinding(payload.harnessPackBinding);
  return { payload: { ...payload, schemaVersion: HEADLESS_BUILDER_SNAPSHOT_SCHEMA_VERSION, harnessPackBinding,
    bootstrap: payload.bootstrap ?? null, release: payload.release ?? null } as HeadlessBuilderSnapshotPayload, migratedLegacy };
}

const NON_BLOCKING_MISSING_INPUT_SENTINELS = new Set([
  "none",
  "n/a",
  "not applicable",
  "없음",
]);

const COPIED_BLOCKER_CATALOG = [
  "required credential/secret for a mandatory external service",
  "legal/ownership authorization",
  "irreversible destructive target",
  "required external endpoint/dataset that the platform cannot provision",
];

function copiedBlockerCatalog(item: string): boolean {
  const normalized = item.toLowerCase();
  return COPIED_BLOCKER_CATALOG.every((fragment) => normalized.includes(fragment));
}

export function normalizeBlockingMissingInputs(items: string[]): string[] {
  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !NON_BLOCKING_MISSING_INPUT_SENTINELS.has(item.toLowerCase()) && !copiedBlockerCatalog(item));
}

function initialTaskRun(task: ProjectTaskPlan, teamId: TeamId): ProjectTaskRun {
  return {
    taskId: task.id,
    role: task.role,
    agentId: `${teamId}:${task.role}`,
    status: "pending",
    attempts: 0,
    branchName: null,
    worktreePath: null,
    threadId: null,
    sessionId: null,
    turnId: null,
    eventsPath: null,
    stderrPath: null,
    commitSha: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    reviewedPullRequests: [],
    summary: null,
    rationaleSummary: null,
    evidence: [],
    harnessCompletion: null,
    verification: [],
    blockers: [],
    lastError: null,
    startedAt: null,
    completedAt: null,
  };
}

function dependencySummary(run: ProjectTaskRun, fallbackSummary: string) {
  const base = run.summary ?? fallbackSummary;
  if (run.reviewedPullRequests.length === 0) return base;
  return `${base} | upstream reviewed PRs: ${run.reviewedPullRequests.map((number) => `#${number}`).join(", ")}`;
}

function buildTaskInput(
  payload: HeadlessBuilderSnapshotPayload,
  run: ProjectTaskRun,
  options: HeadlessBuilderExecutorOptions,
): HeadlessAgentTaskRuntimeInput {
  const plan = payload.plan;
  const repository = payload.repository;
  if (!plan || !repository) {
    throw new Error("Headless task 실행 전에 PM plan과 repository가 필요합니다.");
  }

  const task = plan.tasks.find((item) => item.id === run.taskId);
  if (!task) throw new Error(`PM Task를 찾을 수 없습니다: ${run.taskId}`);

  const dependencies = task.dependsOn.map((dependencyId) => {
    const dependencyRun = payload.taskRuns.find((item) => item.taskId === dependencyId);
    const dependencyTask = plan.tasks.find((item) => item.id === dependencyId);
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
  const visualContext = lunaVisualStyleTaskContext(task.role);

  return {
    organization: options.organization,
    projectId: payload.runtimeProjectId,
    teamId: options.teamId,
    teamName: options.teamName,
    role: task.role,
    agentId: run.agentId,
    taskId: task.id,
    taskSlug: task.taskSlug,
    title: task.title,
    summary: [seniorAgentContext(task.role), visualContext, task.summary]
      .filter(Boolean)
      .join("\n\n"),
    acceptanceCriteria: task.acceptanceCriteria,
    userRequest: payload.request,
    productSummary: plan.productSummary,
    architectureSummary: plan.architectureSummary,
    repositoryFullName: repository.repository,
    workspacePath: repository.workspacePath,
    dependencies,
  };
}

function applyTaskResult(
  plan: ProjectPlan,
  taskRuns: readonly ProjectTaskRun[],
  run: ProjectTaskRun,
  result: HeadlessAgentTaskRunResult,
  completedAt: string,
): ProjectTaskRun {
  return applyRuntimeCompletionToTaskRun({
    run,
    result,
    declaredDependencyPullRequests: declaredDependencyPullRequestsForTask(
      plan,
      taskRuns,
      run.taskId,
    ),
    completedAt,
  });
}
function blockedTask(run: ProjectTaskRun, reason: string, completedAt: string): ProjectTaskRun {
  return {
    ...run,
    status: "blocked",
    blockers: Array.from(new Set([...run.blockers, reason])),
    lastError: reason,
    completedAt,
  };
}

function retryInterruptedTask(run: ProjectTaskRun, reason: string): ProjectTaskRun {
  return {
    ...run,
    status: "pending",
    branchName: null,
    worktreePath: null,
    threadId: null,
    sessionId: null,
    turnId: null,
    eventsPath: null,
    stderrPath: null,
    commitSha: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    reviewedPullRequests: [],
    summary: null,
    rationaleSummary: null,
    evidence: [],
    harnessCompletion: null,
    verification: [],
    blockers: [],
    lastError: reason,
    startedAt: null,
    completedAt: null,
  };
}

function ensureTaskRunsMatchPlan(payload: HeadlessBuilderSnapshotPayload, teamId: TeamId) {
  if (!payload.plan) return;
  if (payload.taskRuns.length === 0) {
    payload.taskRuns = refreshOrchestrationReadiness(
      payload.plan,
      payload.plan.tasks.map((task) => initialTaskRun(task, teamId)),
    );
    return;
  }

  const planIds = new Set(payload.plan.tasks.map((task) => task.id));
  const runIds = new Set(payload.taskRuns.map((run) => run.taskId));
  if (planIds.size !== runIds.size
    || [...planIds].some((taskId) => !runIds.has(taskId))) {
    throw new Error("Builder snapshot taskRuns가 저장된 PM Task DAG와 일치하지 않습니다.");
  }
}

export function createHeadlessBuilderExecutor(
  options: HeadlessBuilderExecutorOptions,
): BuilderWorkerExecutor {
  const organization = options.organization.trim();
  const workspaceRoot = options.workspaceRoot.trim();
  const teamName = options.teamName.trim();
  const maxParallelTasks = options.maxParallelTasks ?? 6;
  if (!Number.isInteger(maxParallelTasks) || maxParallelTasks < 1 || maxParallelTasks > 6) {
    throw new Error("Headless Builder maxParallelTasks must be an integer between 1 and 6.");
  }
  if (!organization) throw new Error("Headless Builder GitHub organization이 필요합니다.");
  if (!workspaceRoot) throw new Error("Headless Builder workspace root가 필요합니다.");
  if (!teamName) throw new Error("Headless Builder team name이 필요합니다.");
  const now = options.now ?? (() => new Date().toISOString());

  return async (
    claim: BuilderWorkerClaim,
    client: BuilderWorkerClient,
  ): Promise<BuilderWorkerExecutionResult> => {
    const persisted = claim.orchestrationSnapshot
      ?? await client.loadSnapshot(claim.runId, claim.workerId);
    let snapshotVersion = persisted?.version ?? 0;
    const parsedSnapshot = persisted ? parseSnapshot(claim, persisted) : null;
    const payload = parsedSnapshot?.payload ?? freshPayload(claim);
    const migratedLegacy = parsedSnapshot?.migratedLegacy ?? false;

    const persist = async (phase: string) => {
      const saved = await client.saveSnapshot(claim.runId, claim.workerId, {
        expectedVersion: snapshotVersion,
        schemaVersion: HEADLESS_BUILDER_SNAPSHOT_SCHEMA_VERSION,
        phase,
        payloadJson: JSON.stringify(payload),
      });
      snapshotVersion = saved.version;
    };

    const failBlocked = async (reason: string) => {
      payload.blockedReason = reason;
      await persist("blocked");
      throw new Error(reason);
    };

    if (!persisted) {
      if (payload.harnessPackBinding.status === "blocked") {
        await failBlocked(`Bloom Harness pack binding rejected: ${payload.harnessPackBinding.reason}`);
      }
      await persist("binding");
    } else if (migratedLegacy) {
      await persist("binding");
    }

    if (!payload.intake) {
      const intake = await options.runtime.analyzeIntake({
        organization,
        workspaceRoot,
        intakeId: payload.intakeId,
        request: payload.request,
      });
      payload.intake = intake;
      const missingInputs = normalizeBlockingMissingInputs(intake.analysis.missingInputs);
      if (missingInputs.length > 0) {
        await failBlocked(`Project Intake 추가 확인 필요: ${missingInputs.join(" / ")}`);
      }
      await persist("planning");
    }

    if (!payload.plan) {
      const visualPlanningContext = lunaVisualStylePlanningContext(
        payload.intake?.analysis.userFacing ?? false,
      );
      const planningRequest = visualPlanningContext
        ? [payload.request, visualPlanningContext].join("\n\n")
        : payload.request;
      const pm = await options.runtime.planProject({
        organization,
        workspaceRoot,
        projectId: payload.runtimeProjectId,
        teamId: options.teamId,
        teamName,
        request: planningRequest,
        harnessPackBinding: payload.harnessPackBinding,
      });
      const rawPlan = claim.authRequired && !pm.plan.needsAuth
        ? { ...pm.plan, needsAuth: true }
        : pm.plan;
      assertHarnessPackPlan(payload.harnessPackBinding, rawPlan);
      payload.plan = prepareOrchestrationPlan(rawPlan);
      assertHarnessPackPlan(payload.harnessPackBinding, payload.plan);
      payload.pm = {
        sessionId: pm.sessionId,
        eventsPath: pm.eventsPath,
        outputPath: pm.outputPath,
      };
      payload.blockedReason = null;
      await persist("repository");
    }

    if (!payload.repository) {
      payload.repository = await options.runtime.bootstrapRepository({ organization, repository: payload.plan.repositoryName, workspaceRoot });
    }
    if (!payload.bootstrap && payload.taskRuns.length === 0) {
      const scaffoldProfile = payload.plan.scaffoldProfile ?? "none";
      if (!options.runtime.bootstrapGreenfieldProject) {
        if (scaffoldProfile !== "none") throw new Error(`Greenfield bootstrap Runtime is required for scaffold profile: ${scaffoldProfile}`);
        payload.bootstrap = { profile: "none", commitSha: null, generatedFiles: [] };
      } else {
        payload.bootstrap = await options.runtime.bootstrapGreenfieldProject({ repositoryFullName: payload.repository.repository, workspacePath: payload.repository.workspacePath, integrationBranch: payload.repository.integrationBranch, scaffoldProfile });
      }
      await persist("bootstrap");
    }
    if (payload.taskRuns.length === 0) {
      ensureTaskRunsMatchPlan(payload, options.teamId);
      await persist("building");
    } else { ensureTaskRunsMatchPlan(payload, options.teamId); }

    const running = payload.taskRuns.filter((run) => run.status === "running");
    if (running.length > 0) {
      for (const interrupted of running) {
        const task = payload.plan.tasks.find((item) => item.id === interrupted.taskId);
        if (!task) throw new Error(`복구 대상 PM Task를 찾을 수 없습니다: ${interrupted.taskId}`);
        const reconciliation = await options.runtime.reconcileTask({
          projectId: payload.runtimeProjectId,
          teamId: options.teamId,
          role: interrupted.role,
          agentId: interrupted.agentId,
          taskId: interrupted.taskId,
          taskSlug: task.taskSlug,
          repositoryFullName: payload.repository.repository,
          workspacePath: payload.repository.workspacePath,
        });
        const index = payload.taskRuns.findIndex((run) => run.taskId === interrupted.taskId);
        if (reconciliation.outcome === "recovered" && reconciliation.result) {
          payload.taskRuns[index] = applyTaskResult(payload.plan, payload.taskRuns, interrupted, reconciliation.result, now());
        } else if (reconciliation.outcome === "retryable") {
          payload.taskRuns[index] = retryInterruptedTask(
            interrupted,
            `Interrupted task is safe to retry without terminal evidence: ${reconciliation.reason}`,
          );
        } else {
          payload.taskRuns[index] = blockedTask(
            interrupted,
            `중단 Task evidence 복구 실패: ${reconciliation.reason}`,
            now(),
          );
        }
      }
      payload.taskRuns = refreshOrchestrationReadiness(payload.plan, payload.taskRuns);
      const recoveredSummary = summarizeTaskRuns(payload.taskRuns);
      await persist(recoveredSummary.hasBlocked ? "blocked" : "building");
      if (recoveredSummary.hasBlocked) {
        throw new Error("중단된 Agent Task를 repository/session evidence로 안전하게 복구하지 못했습니다.");
      }
    }

    while (true) {
      payload.taskRuns = refreshOrchestrationReadiness(payload.plan, payload.taskRuns);
      const summary = summarizeTaskRuns(payload.taskRuns);
      if (summary.allDone) break;
      if (summary.hasBlocked) {
        await failBlocked("하나 이상의 Agent Task가 blocked 상태라 orchestration을 계속할 수 없습니다.");
      }

      const wave = selectAdaptiveOrchestrationWave(payload.plan, payload.taskRuns, maxParallelTasks);
      if (wave.length === 0) {
        await failBlocked("실행 가능한 Agent Task가 없지만 Task DAG가 완료되지 않았습니다.");
      }

      const startedAt = now();
      const waveTaskIds = new Set(wave.map((run) => run.taskId));
      payload.taskRuns = payload.taskRuns.map((run) => waveTaskIds.has(run.taskId)
        ? { ...run, status: "running" as const, attempts: run.attempts + 1, startedAt, lastError: null }
        : run);
      await persist("building");

      const activeRuns = wave.map((selected) => {
        const current = payload.taskRuns.find((run) => run.taskId === selected.taskId);
        if (!current) throw new Error(`실행할 Task Run을 찾을 수 없습니다: ${selected.taskId}`);
        return current;
      });
      const settled = await Promise.allSettled(
        activeRuns.map((run) => options.runtime.dispatchTask(buildTaskInput(payload, run, options))),
      );

      for (let index = 0; index < activeRuns.length; index += 1) {
        const run = activeRuns[index];
        const result = settled[index];
        const taskIndex = payload.taskRuns.findIndex((item) => item.taskId === run.taskId);
        if (result.status === "fulfilled") {
          payload.taskRuns[taskIndex] = applyTaskResult(payload.plan, payload.taskRuns, run, result.value, now());
        } else {
          payload.taskRuns[taskIndex] = blockedTask(
            run,
            `Agent Runtime 실행 실패: ${errorMessage(result.reason)}`,
            now(),
          );
        }
      }

      payload.taskRuns = refreshOrchestrationReadiness(payload.plan, payload.taskRuns);
      const waveSummary = summarizeTaskRuns(payload.taskRuns);
      await persist(waveSummary.hasBlocked ? "blocked" : "building");
      if (waveSummary.hasBlocked) {
        throw new Error("Agent task wave 중 blocked 또는 Runtime 실패가 발생했습니다.");
      }
    }

    const packGate = evaluateHarnessPackProjectCompletion({
      binding: payload.harnessPackBinding,
      taskRuns: payload.taskRuns,
    });
    if (!packGate.ready) {
      await failBlocked(`Bloom Harness pack completion rejected: ${packGate.reasons.join(" · ")}`);
    }

    const gate = evaluateProjectMergeGate({
      plan: payload.plan,
      taskRuns: payload.taskRuns,
    });
    if (!gate.ready) {
      await failBlocked(`PR integration gate 실패: ${gate.reasons.join(" · ")}`);
    }

    if (!payload.integration) {
      payload.integrationPullRequestNumbers = gate.pullRequestNumbers;
      await persist("integration");
      payload.integration = await options.runtime.mergePullRequests({
        repositoryFullName: payload.repository.repository,
        pullRequestNumbers: payload.integrationPullRequestNumbers,
      });
      payload.blockedReason = null;
      await persist("release");
    }

    if (!payload.release) {
      const promoteRelease = options.runtime.promoteRelease;
      if (!promoteRelease) {
        await failBlocked("Release promotion Runtime이 연결되지 않았습니다.");
        throw new Error("Release promotion Runtime is unreachable after failBlocked.");
      }
      payload.release = await promoteRelease({
        repositoryFullName: payload.repository.repository,
        integrationBranch: payload.repository.integrationBranch,
        releaseBranch: payload.repository.releaseBranch,
      });
      payload.blockedReason = null;
      await persist("completed");
    }

    return {
      repositoryFullName: payload.repository.repository,
      previewUrl: claim.previewUrl,
      releaseSha: payload.release.releaseSha,
      workspacePath: payload.repository.workspacePath,
    };
  };
}