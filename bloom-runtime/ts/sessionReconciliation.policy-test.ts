import * as fs from "node:fs";
import * as path from "node:path";

import { classifyInterruptedTaskRecovery } from "./sessionReconciliationPolicy";
import type { ProjectState, ProjectTaskRun } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const run = {
  taskId: "DEV-001",
  role: "frontend",
  agentId: "rose:frontend",
  status: "running",
} as ProjectTaskRun;

const project = {
  id: "PROJECT-1",
  teamId: "rose",
  repositoryFullName: "BloomBouquet/example",
  workspacePath: "C:/workspace/example",
  plan: {
    tasks: [{
      id: "DEV-001",
      title: "Frontend",
      role: "frontend",
      taskSlug: "frontend",
      summary: "Implement frontend",
      dependsOn: [],
      acceptanceCriteria: ["build passes"],
    }],
  },
} as unknown as ProjectState;

const eligible = classifyInterruptedTaskRecovery(project, run);
assert(eligible.action === "reconcile", "running task with complete metadata should reconcile");
assert(
  eligible.action !== "reconcile" || eligible.taskSlug === "frontend",
  "reconciliation should preserve PM task slug",
);

assert(
  classifyInterruptedTaskRecovery(project, { ...run, status: "done" }).action === "ignore",
  "non-running task must not be reconciled",
);
assert(
  classifyInterruptedTaskRecovery({ ...project, plan: null }, run).action === "block",
  "running task without PM plan must be blocked",
);
assert(
  classifyInterruptedTaskRecovery({ ...project, repositoryFullName: null }, run).action === "block",
  "running task without repository metadata must be blocked",
);
assert(
  classifyInterruptedTaskRecovery({ ...project, workspacePath: null }, run).action === "block",
  "running task without workspace metadata must be blocked",
);
assert(
  classifyInterruptedTaskRecovery({
    ...project,
    plan: {
      ...project.plan!,
      tasks: project.plan!.tasks.map((task) => ({ ...task, role: "backend" })),
    },
  }, run).action === "block",
  "role mismatch between persisted run and PM plan must be blocked",
);
assert(
  classifyInterruptedTaskRecovery({
    ...project,
    plan: {
      ...project.plan!,
      tasks: [],
    },
  }, run).action === "block",
  "missing PM task metadata must be blocked",
);
assert(
  classifyInterruptedTaskRecovery({
    ...project,
    plan: {
      ...project.plan!,
      tasks: project.plan!.tasks.map((task) => ({ ...task, taskSlug: "" })),
    },
  }, run).action === "block",
  "empty task slug must not reach the reconciliation runtime",
);

const storeSource = fs.readFileSync(path.resolve("bloom-runtime/ts/store.ts"), "utf8");
assert(
  storeSource.includes("applyRuntimeCompletionToTaskRun"),
  "store completion must use the shared Harness task-completion helper",
);
assert(
  storeSource.includes("declaredDependencyPullRequestsForTask"),
  "store completion must validate review evidence against declared dependency PRs",
);
assert(
  !storeSource.includes('from "./runtime"'),
  "store must not depend on the Tauri runtime module for completion result types",
);

const runtimeSource = fs.readFileSync(path.resolve("bloom-runtime/ts/runtime.ts"), "utf8");
assert(
  runtimeSource.includes("completionObservations"),
  "Tauri Agent task results must expose runtime-owned completion observations",
);

const reconciliationSource = fs.readFileSync(
  path.resolve("bloom-runtime/ts/sessionReconciliation.ts"),
  "utf8",
);
assert(
  reconciliationSource.includes("completeAgentTask(state, result.result)"),
  "startup recovery must pass recovered results through the shared store completion boundary",
);

console.log("sessionReconciliation.policy-test: PASS");
