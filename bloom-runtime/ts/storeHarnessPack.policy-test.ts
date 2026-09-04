import * as assert from "node:assert/strict";

import { createInitialProjectTeamsState } from "./catalog";
import {
  beginAgentTasks,
  bindProjectHarnessPack,
  completeAgentTask,
  completeProjectPlanning,
  loadProjectTeamsState,
  startProject,
} from "./store";
import type { ProjectPlan, ProjectState, ProjectTeamsState } from "./types";

function mustStart(request: string) {
  const started = startProject(createInitialProjectTeamsState(), request);
  assert.equal(started.ok, true);
  if (!started.ok) throw new Error("project did not start");
  return started;
}

const started = mustStart("로그인 버그 고쳐");
assert.equal(started.project.harnessPackBinding, null);
const bound = bindProjectHarnessPack(started.state, started.project.id);
assert.equal(bound.binding.status, "bound");
assert.equal(bound.binding.packId, "bug-fix");
assert.equal(bound.state.projects[0]?.harnessPackBinding?.packId, "bug-fix");

const rebound = bindProjectHarnessPack(bound.state, started.project.id, "unknown");
assert.deepEqual(rebound.binding, bound.binding);
const unknownStarted = mustStart("ship feature");
const unknown = bindProjectHarnessPack(
  unknownStarted.state,
  unknownStarted.project.id,
  "unknown",
);
assert.equal(unknown.binding.status, "blocked");
const unknownProject = unknown.state.projects.find(
  (project) => project.id === unknownStarted.project.id,
);
assert.equal(unknownProject?.status, "blocked");
assert.equal(unknownProject?.runtimeFailureSource, "harness");
assert.match(unknownProject?.runtimeMessage ?? "", /unknown|pack/i);

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem(key: string) { return memory.get(key) ?? null; },
      setItem(key: string, value: string) { memory.set(key, value); },
      removeItem(key: string) { memory.delete(key); },
    },
  },
});

const legacyStarted = mustStart("로그인 버그 고쳐");
const legacyState = JSON.parse(JSON.stringify(legacyStarted.state)) as ProjectTeamsState;
for (const project of legacyState.projects) {
  delete (project as ProjectState & { harnessPackBinding?: unknown }).harnessPackBinding;
}
memory.set("luna.project-teams.v1", JSON.stringify(legacyState));
const hydrated = loadProjectTeamsState();
assert.equal(hydrated.projects[0]?.harnessPackBinding?.status, "unbound");
assert.match(hydrated.projects[0]?.harnessPackBinding?.reason ?? "", /legacy/i);
const packPlan: ProjectPlan = {
  projectName: "Pack gate",
  repositoryName: "pack-gate",
  productSummary: "probe",
  architectureSummary: "probe",
  needsAuth: false,
  technologyDecisions: [],
  tasks: [{
    id: "FE-001",
    title: "Fix frontend",
    role: "frontend",
    taskSlug: "fix-frontend",
    summary: "fix",
    dependsOn: [],
    acceptanceCriteria: ["fixed"],
  }],
};

const gateStarted = mustStart("로그인 버그 고쳐");
const gateBound = bindProjectHarnessPack(gateStarted.state, gateStarted.project.id);
let gateState = completeProjectPlanning(gateBound.state, {
  projectId: gateStarted.project.id,
  plan: packPlan,
  repositoryFullName: "example/pack-gate",
  workspacePath: "C:/workspace/pack-gate",
  pmSessionId: "pm-1",
});
gateState = beginAgentTasks(gateState, gateStarted.project.id, ["FE-001"]);
gateState = completeAgentTask(gateState, {
  projectId: gateStarted.project.id,
  taskId: "FE-001",
  role: "frontend",
  agentId: `${gateStarted.project.teamId}:frontend`,
  branchName: "agent/frontend/fix",
  worktreePath: "C:/workspace/pack-gate/.worktrees/fix",
  threadId: "thread-1",
  sessionId: "session-1",
  turnId: "turn-1",
  eventsPath: "C:/tmp/fix.jsonl",
  stderrPath: "C:/tmp/fix.stderr",
  report: {
    status: "completed",
    summary: "fixed",
    rationaleSummary: "runtime verified publication",
    evidence: ["legacy file claim"],
    verification: [],
    commitSha: "abc123",
    pullRequestNumber: 12,
    pullRequestUrl: "https://github.com/example/pack-gate/pull/12",
    reviewedPullRequests: [],
    blockers: [],
  },
  completionObservations: {
    commands: [],
    publication: {
      branchName: "agent/frontend/fix",
      commitSha: "abc123",
      pullRequestNumber: 12,
      pullRequestUrl: "https://github.com/example/pack-gate/pull/12",
    },
  },
});
const gatedProject = gateState.projects.find((project) => project.id === gateStarted.project.id);
assert.equal(gatedProject?.taskRuns[0]?.status, "done");
assert.equal(gatedProject?.status, "blocked");
assert.equal(gatedProject?.runtimeFailureSource, "harness");
assert.match(gatedProject?.runtimeMessage ?? "", /test|review|evidence/i);


const successPlan: ProjectPlan = {
  ...packPlan,
  tasks: [
    packPlan.tasks[0],
    {
      id: "REV-001",
      title: "Review",
      role: "reviewer",
      taskSlug: "review",
      summary: "review",
      dependsOn: ["FE-001"],
      acceptanceCriteria: ["reviewed"],
    },
    {
      id: "QA-001",
      title: "QA",
      role: "qa",
      taskSlug: "qa",
      summary: "qa",
      dependsOn: ["REV-001"],
      acceptanceCriteria: ["tested"],
    },
  ],
};
const successStarted = mustStart("로그인 버그 고쳐");
const successBound = bindProjectHarnessPack(successStarted.state, successStarted.project.id);
let successState = completeProjectPlanning(successBound.state, {
  projectId: successStarted.project.id,
  plan: successPlan,
  repositoryFullName: "example/pack-success",
  workspacePath: "C:/workspace/pack-success",
  pmSessionId: "pm-success",
});
successState = {
  ...successState,
  projects: successState.projects.map((project) => project.id !== successStarted.project.id
    ? project
    : {
        ...project,
        taskRuns: project.taskRuns.map((run) => {
          if (run.taskId === "FE-001") return {
            ...run,
            status: "done" as const,
            branchName: "agent/frontend/fix",
            commitSha: "abc123",
            pullRequestNumber: 12,
            pullRequestUrl: "https://github.com/example/pack-success/pull/12",
            harnessCompletion: {
              version: 1 as const,
              accepted: true,
              evidence: [{ version: 1 as const, id: "file-1", kind: "file-change" as const, summary: "file changed" }],
              requiredEvidence: ["file-change" as const],
              rejectionReason: null,
            },
            completedAt: "2026-09-04T00:01:00Z",
          };
          if (run.taskId === "REV-001") return {
            ...run,
            status: "done" as const,
            harnessCompletion: {
              version: 1 as const,
              accepted: true,
              evidence: [{ version: 1 as const, id: "review-1", kind: "review" as const, summary: "reviewed" }],
              requiredEvidence: ["review" as const],
              rejectionReason: null,
            },
            completedAt: "2026-09-04T00:02:00Z",
          };
          return { ...run, status: "running" as const, startedAt: "2026-09-04T00:03:00Z" };
        }),
      }),
};
successState = completeAgentTask(successState, {
  projectId: successStarted.project.id,
  taskId: "QA-001",
  role: "qa",
  agentId: `${successStarted.project.teamId}:qa`,
  branchName: null,
  worktreePath: "C:/workspace/pack-success/.worktrees/qa",
  threadId: "thread-qa",
  sessionId: "session-qa",
  turnId: "turn-qa",
  eventsPath: "C:/tmp/qa.jsonl",
  stderrPath: "C:/tmp/qa.stderr",
  report: {
    status: "completed",
    summary: "qa passed",
    rationaleSummary: "runtime test observed",
    evidence: ["legacy test claim"],
    verification: [{ name: "test", status: "passed", details: "claimed" }],
    commitSha: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    reviewedPullRequests: [],
    blockers: [],
  },
  completionObservations: {
    commands: [{ step: 1, command: "pnpm", commandClass: "test", ok: true, exitCode: 0 }],
    publication: null,
  },
});
const successProject = successState.projects.find((project) => project.id === successStarted.project.id);
assert.equal(successProject?.taskRuns.find((run) => run.taskId === "QA-001")?.status, "done");
assert.equal(successProject?.status, "review");
assert.equal(successProject?.runtimeFailureSource, null);

console.log("store harness pack policy tests passed");
