import {
  HARNESS_CONTRACT_VERSION,
  type HarnessAgentResult,
  type HarnessEvidence,
  type HarnessEvidenceKind,
} from "./harnessContracts";
import {
  evaluateHarnessCompletion,
  type HarnessCompletionGateResult,
} from "./harnessCompletionGate";
import { REPOSITORY_WRITER_ROLES } from "./planTopology";
import type { ExecutableAgentRole } from "./types";

export type RuntimeCommandClass =
  | "test"
  | "build"
  | "lint"
  | "typecheck"
  | "install"
  | "other";

export type RuntimeCommandObservation = {
  step: number;
  command: string;
  commandClass: RuntimeCommandClass;
  ok: boolean;
  exitCode: number | null;
};
export type RuntimePublicationObservation = {
  branchName: string;
  commitSha: string;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
};

export type RuntimeCompletionObservations = {
  commands: RuntimeCommandObservation[];
  publication: RuntimePublicationObservation | null;
};

export type LegacyRuntimeCompletionReport = {
  status: "completed" | "blocked";
  summary: string;
  blockers: string[];
  reviewedPullRequests: number[];
};

export type RuntimeTaskCompletionInput = {
  taskId: string;
  role: ExecutableAgentRole;
  report: LegacyRuntimeCompletionReport;
  completionObservations?: RuntimeCompletionObservations | null;
  declaredDependencyPullRequests: readonly number[];
};
export type RuntimeHarnessCompletionPacket = {
  result: HarnessAgentResult;
  evidence: HarnessEvidence[];
  requiredEvidence: HarnessEvidenceKind[];
};

export type RuntimeTaskCompletionDecision = {
  accepted: boolean;
  packet: RuntimeHarnessCompletionPacket;
  gate: HarnessCompletionGateResult;
  rejectionReason: string | null;
};

const COMMAND_CLASSES = new Set<RuntimeCommandClass>([
  "test", "build", "lint", "typecheck", "install", "other",
]);

function validateCommandObservation(
  observation: RuntimeCommandObservation,
): RuntimeCommandObservation {
  if (!Number.isInteger(observation.step) || observation.step < 1) {
    throw new Error("Bloom runtime command observation step must be a positive integer.");
  }
  if (typeof observation.command !== "string" || !observation.command.trim()) {
    throw new Error("Bloom runtime command observation command is required.");
  }
  if (!COMMAND_CLASSES.has(observation.commandClass)) {
    throw new Error(`Bloom runtime command class is invalid: ${String(observation.commandClass)}`);
  }
  if (typeof observation.ok !== "boolean") {
    throw new Error("Bloom runtime command observation ok must be boolean.");
  }
  if (observation.exitCode !== null
      && (!Number.isInteger(observation.exitCode) || !Number.isSafeInteger(observation.exitCode))) {
    throw new Error("Bloom runtime command observation exitCode must be an integer or null.");
  }
  return observation;
}

function validateObservations(
  observations: RuntimeCompletionObservations,
): RuntimeCompletionObservations {
  if (!Array.isArray(observations.commands)) {
    throw new Error("Bloom runtime completion commands must be an array.");
  }
  const commands = observations.commands.map(validateCommandObservation);
  const steps = new Set<number>();
  for (const command of commands) {
    if (steps.has(command.step)) {
      throw new Error(`Bloom runtime completion contains duplicate command step: ${command.step}`);
    }
    steps.add(command.step);
  }

  const publication = observations.publication;
  if (publication !== null) {
    if (!publication.branchName?.trim() || !publication.commitSha?.trim()) {
      throw new Error("Bloom runtime publication branch and commit are required.");
    }    const hasPrNumber = publication.pullRequestNumber !== null;
    const hasPrUrl = publication.pullRequestUrl !== null;
    if (hasPrNumber !== hasPrUrl) {
      throw new Error("Bloom runtime publication PR number/url must appear together.");
    }
    if (hasPrNumber
        && (!Number.isInteger(publication.pullRequestNumber)
          || (publication.pullRequestNumber ?? 0) < 1
          || !publication.pullRequestUrl?.trim())) {
      throw new Error("Bloom runtime publication PR metadata is invalid.");
    }
  }
  return { commands: [...commands].sort((a, b) => a.step - b.step), publication };
}

function requiredEvidenceForRole(role: ExecutableAgentRole): HarnessEvidenceKind[] {
  const required: HarnessEvidenceKind[] = [];
  if (REPOSITORY_WRITER_ROLES.includes(role)) required.push("file-change");
  if (role === "code-review" || role === "reviewer") required.push("review");
  if (role === "qa" || role === "test-automation") required.push("test");
  return [...new Set(required)];
}

function evidence(
  id: string,
  kind: HarnessEvidenceKind,
  summary: string,
): HarnessEvidence {
  return { version: HARNESS_CONTRACT_VERSION, id, kind, summary };
}

function latestCommand(
  commands: readonly RuntimeCommandObservation[],
  commandClass: RuntimeCommandClass,
) {
  return [...commands].filter((item) => item.commandClass === commandClass)
    .sort((a, b) => b.step - a.step)[0];
}
function gateRejectionReason(gate: HarnessCompletionGateResult): string {
  if (gate.reason === "result-not-done") {
    return `Bloom Harness completion rejected: result status is ${gate.result.status}, not done.`;
  }
  if (gate.reason === "missing-evidence-ids") {
    return `Bloom Harness completion rejected: missing referenced evidence ids: ${gate.missingEvidenceIds.join(", ")}.`;
  }
  if (gate.reason === "missing-evidence-kinds") {
    return `Bloom Harness completion rejected: missing required evidence kinds: ${gate.missingEvidenceKinds.join(", ")}.`;
  }
  return "Bloom Harness completion rejected by runtime policy.";
}

function normalizeReviewTargets(
  input: RuntimeTaskCompletionInput,
): { evidence: HarnessEvidence | null; error: string | null } {
  if (input.role !== "code-review" && input.role !== "reviewer") {
    return { evidence: null, error: null };
  }
  const reviewed = [...new Set(input.report.reviewedPullRequests)].sort((a, b) => a - b);
  const dependencies = new Set(input.declaredDependencyPullRequests);
  const invalid = reviewed.find((number) => !dependencies.has(number));
  if (invalid !== undefined) {
    return {
      evidence: null,
      error: `Bloom Harness completion rejected: reviewed PR #${invalid} is not a declared dependency.`,
    };
  }
  if (reviewed.length === 0) return { evidence: null, error: null };
  return {
    evidence: evidence(
      `${input.taskId}:review:${reviewed.join("-")}`,
      "review",
      `Runtime validated review targets: ${reviewed.map((number) => `#${number}`).join(", ")}`,
    ),
    error: null,
  };
}

function buildRuntimeEvidence(
  input: RuntimeTaskCompletionInput,
  observations: RuntimeCompletionObservations,
): { evidence: HarnessEvidence[]; policyError: string | null } {
  const items: HarnessEvidence[] = [];
  for (const command of observations.commands) {
    if (command.ok && command.exitCode === 0) {
      items.push(evidence(
        `${input.taskId}:command:${command.step}`,
        "command",
        `Runtime command ${command.command}:${command.commandClass} passed at step ${command.step}.`,
      ));
    }
  }

  for (const kind of ["test", "build"] as const) {
    const latest = latestCommand(observations.commands, kind);
    if (latest?.ok && latest.exitCode === 0) {
      items.push(evidence(
        `${input.taskId}:${kind}:${latest.step}`,
        kind,
        `Latest runtime-observed ${kind} passed at step ${latest.step}.`,
      ));
    }
  }

  const isWriter = REPOSITORY_WRITER_ROLES.includes(input.role);
  if (!isWriter && observations.publication) {
    return { evidence: items, policyError: "Bloom Harness completion rejected: non-writer task contains publication observations." };
  }
  if (isWriter && observations.publication) {
    items.push(evidence(
      `${input.taskId}:file-change:${observations.publication.commitSha}`,
      "file-change",
      `Runtime verified branch ${observations.publication.branchName} at ${observations.publication.commitSha}.`,
    ));
  }
  if (isWriter && observations.publication?.pullRequestNumber !== null
      && observations.publication?.pullRequestNumber !== undefined) {
    items.push(evidence(
      `${input.taskId}:github:pr-${observations.publication.pullRequestNumber}`,
      "github",
      `Runtime verified pull request #${observations.publication.pullRequestNumber}.`,
    ));
  }

  const review = normalizeReviewTargets(input);
  if (review.error) return { evidence: items, policyError: review.error };
  if (review.evidence) items.push(review.evidence);
  return { evidence: items, policyError: null };
}

function validateInput(input: RuntimeTaskCompletionInput) {
  if (!input.taskId?.trim()) throw new Error("Bloom runtime completion taskId is required.");
  if (input.report.status !== "completed" && input.report.status !== "blocked") {
    throw new Error("Bloom runtime completion report status is invalid.");
  }
  if (!input.report.summary?.trim()) throw new Error("Bloom runtime completion summary is required.");
  if (!Array.isArray(input.report.blockers)
      || input.report.blockers.some((item) => typeof item !== "string")) {
    throw new Error("Bloom runtime completion blockers must be strings.");
  }
  if (!Array.isArray(input.report.reviewedPullRequests)
      || input.report.reviewedPullRequests.some(
        (item) => !Number.isInteger(item) || item < 1,
      )) {
    throw new Error("Bloom runtime reviewed pull requests must be positive integers.");
  }
  if (!Array.isArray(input.declaredDependencyPullRequests)
      || input.declaredDependencyPullRequests.some(
        (item) => !Number.isInteger(item) || item < 1,
      )) {
    throw new Error("Bloom runtime dependency pull requests must be positive integers.");
  }
}

export function evaluateRuntimeTaskCompletion(
  input: RuntimeTaskCompletionInput,
): RuntimeTaskCompletionDecision {
  validateInput(input);
  const missingObservations = input.report.status === "completed"
    && !input.completionObservations;
  const observations = input.completionObservations
    ? validateObservations(input.completionObservations)
    : { commands: [], publication: null };
  const built = buildRuntimeEvidence(input, observations);
  const requiredEvidence = requiredEvidenceForRole(input.role);
  const result: HarnessAgentResult = {
    version: HARNESS_CONTRACT_VERSION,
    status: input.report.status === "completed" ? "done" : "blocked",
    summary: input.report.summary,
    changedFiles: [],
    commandsExecuted: observations.commands.map(
      (item) => `${item.command}:${item.commandClass}`,
    ),
    evidenceIds: built.evidence.map((item) => item.id),
    risks: [],
    unresolvedIssues: [...input.report.blockers],
    nextActions: [],
  };
  const packet: RuntimeHarnessCompletionPacket = {
    result,
    evidence: built.evidence,
    requiredEvidence,
  };
  const gate = evaluateHarnessCompletion({
    requiredEvidence,
    result,
    evidence: built.evidence,
  });
  const policyError = missingObservations
    ? "Bloom Harness completion rejected: runtime completion observations are missing."
    : built.policyError;
  const accepted = policyError === null && gate.ready;
  return {
    accepted,
    packet,
    gate,
    rejectionReason: accepted ? null : policyError ?? gateRejectionReason(gate),
  };
}
