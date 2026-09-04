import * as assert from "node:assert/strict";

import {
  evaluateRuntimeTaskCompletion,
  type RuntimeCompletionObservations,
  type RuntimeTaskCompletionInput,
} from "./runtimeCompletionAdapter";
import type { ExecutableAgentRole } from "./types";

function completedInput(
  role: ExecutableAgentRole,
  overrides: Partial<RuntimeTaskCompletionInput> = {},
): RuntimeTaskCompletionInput {
  return {
    taskId: `TASK-${role}`,
    role,
    report: {
      status: "completed",
      summary: `${role} completed`,
      blockers: [],
      reviewedPullRequests: [],
    },
    completionObservations: { commands: [], publication: null },
    declaredDependencyPullRequests: [],
    ...overrides,
  };
}

function publication(pr = 31): RuntimeCompletionObservations["publication"] {
  return {
    branchName: "agent/rose/frontend/project-task",
    commitSha: "abc123",
    pullRequestNumber: pr,
    pullRequestUrl: `https://github.com/example/repo/pull/${pr}`,
  };
}

function testWriterNeedsRuntimePublication() {
  const rejected = evaluateRuntimeTaskCompletion(completedInput("frontend"));
  assert.equal(rejected.accepted, false);
  assert.deepEqual(rejected.gate.missingEvidenceKinds, ["file-change"]);

  const accepted = evaluateRuntimeTaskCompletion(completedInput("frontend", {
    completionObservations: { commands: [], publication: publication() },
  }));
  assert.equal(accepted.accepted, true);
  assert.ok(accepted.packet.evidence.some((item: { kind: string }) => item.kind === "file-change"));
  assert.ok(accepted.packet.evidence.some((item: { kind: string }) => item.kind === "github"));
}

function testQaIgnoresAgentVerificationClaims() {
  const rejected = evaluateRuntimeTaskCompletion(completedInput("qa", {
    report: {
      status: "completed",
      summary: "QA says tests passed",
      blockers: [],
      reviewedPullRequests: [],
    },
  }));
  assert.equal(rejected.accepted, false);
  assert.deepEqual(rejected.gate.missingEvidenceKinds, ["test"]);

  const accepted = evaluateRuntimeTaskCompletion(completedInput("qa", {
    completionObservations: {
      publication: null,
      commands: [{ step: 8, command: "pnpm", commandClass: "test", ok: true, exitCode: 0 }],
    },
  }));
  assert.equal(accepted.accepted, true);
  assert.ok(accepted.packet.evidence.some((item: { kind: string }) => item.kind === "test"));
}

function testLatestTestAttemptWins() {
  const failedLatest = evaluateRuntimeTaskCompletion(completedInput("qa", {
    completionObservations: {
      publication: null,
      commands: [
        { step: 2, command: "pnpm", commandClass: "test", ok: true, exitCode: 0 },
        { step: 5, command: "pnpm", commandClass: "test", ok: false, exitCode: 1 },
      ],
    },
  }));
  assert.equal(failedLatest.accepted, false);

  const recovered = evaluateRuntimeTaskCompletion(completedInput("qa", {
    completionObservations: {
      publication: null,
      commands: [
        { step: 2, command: "pnpm", commandClass: "test", ok: true, exitCode: 0 },
        { step: 5, command: "pnpm", commandClass: "test", ok: false, exitCode: 1 },
        { step: 9, command: "pnpm", commandClass: "test", ok: true, exitCode: 0 },
      ],
    },
  }));
  assert.equal(recovered.accepted, true);
}

function testReviewMustTargetDeclaredDependencyPrs() {
  const accepted = evaluateRuntimeTaskCompletion(completedInput("reviewer", {
    report: {
      status: "completed",
      summary: "reviewed upstream",
      blockers: [],
      reviewedPullRequests: [41, 42],
    },
    declaredDependencyPullRequests: [42, 41],
  }));
  assert.equal(accepted.accepted, true);
  assert.ok(accepted.packet.evidence.some((item: { kind: string }) => item.kind === "review"));

  const rejected = evaluateRuntimeTaskCompletion(completedInput("reviewer", {
    report: {
      status: "completed",
      summary: "claimed unrelated review",
      blockers: [],
      reviewedPullRequests: [999],
    },
    declaredDependencyPullRequests: [41, 42],
  }));
  assert.equal(rejected.accepted, false);
  assert.match(rejected.rejectionReason ?? "", /999.*declared dependency/i);
}

function testAutomationRequiresMutationAndTest() {
  const missingTest = evaluateRuntimeTaskCompletion(completedInput("test-automation", {
    completionObservations: { commands: [], publication: publication(51) },
  }));
  assert.equal(missingTest.accepted, false);
  assert.deepEqual(missingTest.gate.missingEvidenceKinds, ["test"]);

  const accepted = evaluateRuntimeTaskCompletion(completedInput("test-automation", {
    completionObservations: {
      publication: publication(51),
      commands: [{ step: 12, command: "pnpm", commandClass: "test", ok: true, exitCode: 0 }],
    },
  }));
  assert.equal(accepted.accepted, true);
  assert.deepEqual(new Set(accepted.packet.requiredEvidence), new Set(["file-change", "test"]));
}

function testCompletedWithoutObservationsFailsClosed() {
  const rejected = evaluateRuntimeTaskCompletion(completedInput("idea", {
    completionObservations: null,
  }));
  assert.equal(rejected.gate.ready, true, "the generic Gate has no role requirement for idea");
  assert.equal(rejected.accepted, false, "runtime policy must still require trusted observations");
  assert.match(rejected.rejectionReason ?? "", /runtime completion observations are missing/i);
}

function testBlockedResultStaysBlocked() {
  const rejected = evaluateRuntimeTaskCompletion(completedInput("idea", {
    report: {
      status: "blocked",
      summary: "cannot finish",
      blockers: ["missing input"],
      reviewedPullRequests: [],
    },
    completionObservations: null,
  }));
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.packet.result.status, "blocked");
  assert.equal(rejected.gate.reason, "result-not-done");
}

function testEvidenceIdsAndSafeCommandsAreDeterministic() {
  const decision = evaluateRuntimeTaskCompletion(completedInput("frontend", {
    taskId: "BLOOM-001",
    completionObservations: {
      publication: publication(77),
      commands: [
        { step: 3, command: "pnpm", commandClass: "lint", ok: true, exitCode: 0 },
        { step: 4, command: "pnpm", commandClass: "build", ok: true, exitCode: 0 },
      ],
    },
  }));
  assert.equal(decision.accepted, true);
  assert.ok(decision.packet.result.evidenceIds.includes("BLOOM-001:command:3"));
  assert.ok(decision.packet.result.evidenceIds.includes("BLOOM-001:build:4"));
  assert.ok(decision.packet.result.evidenceIds.includes("BLOOM-001:file-change:abc123"));
  assert.ok(decision.packet.result.evidenceIds.includes("BLOOM-001:github:pr-77"));
  assert.deepEqual(decision.packet.result.commandsExecuted, ["pnpm:lint", "pnpm:build"]);
}

function main() {
  testWriterNeedsRuntimePublication();
  testQaIgnoresAgentVerificationClaims();
  testLatestTestAttemptWins();
  testReviewMustTargetDeclaredDependencyPrs();
  testAutomationRequiresMutationAndTest();
  testCompletedWithoutObservationsFailsClosed();
  testBlockedResultStaysBlocked();
  testEvidenceIdsAndSafeCommandsAreDeterministic();
  console.log("Bloom Runtime Completion Adapter policy tests passed");
}

main();
