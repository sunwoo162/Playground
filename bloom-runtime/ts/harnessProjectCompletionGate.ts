import {
  HARNESS_CONTRACT_VERSION,
  type HarnessEvidence,
  type HarnessEvidenceKind,
} from "./harnessContracts";
import { evaluateHarnessCompletion } from "./harnessCompletionGate";
import {
  validateHarnessPackBinding,
  type HarnessPackBinding,
} from "./harnessPackBinding";
import { validateHarnessTaskCompletionRecord } from "./harnessTaskEvidence";
import type { ProjectTaskRun } from "./types";

export type HarnessPackProjectCompletionInput = {
  binding: HarnessPackBinding;
  taskRuns: readonly ProjectTaskRun[];
};

export type HarnessPackProjectCompletionResult = {
  ready: boolean;
  reasons: string[];
  referencedEvidence: HarnessEvidence[];
  missingEvidenceIds: string[];
  missingEvidenceKinds: HarnessEvidenceKind[];
};

function terminalResult(
  ready: boolean,
  reasons: string[],
): HarnessPackProjectCompletionResult {
  return {
    ready,
    reasons,
    referencedEvidence: [],
    missingEvidenceIds: [],
    missingEvidenceKinds: [],
  };
}

export function evaluateHarnessPackProjectCompletion(
  input: HarnessPackProjectCompletionInput,
): HarnessPackProjectCompletionResult {
  const binding = validateHarnessPackBinding(input.binding);
  if (binding.status === "unbound") {
    return terminalResult(true, []);
  }
  if (binding.status === "blocked") {
    return terminalResult(false, [binding.reason]);
  }
  if (!binding.pack) {
    return terminalResult(false, ["Bound Bloom Harness pack snapshot is missing."]);
  }

  const evidence: HarnessEvidence[] = [];
  const reasons: string[] = [];
  for (const run of input.taskRuns) {
    if (run.status !== "done") {
      reasons.push(`Task ${run.taskId} is ${run.status}, not done.`);
      continue;
    }
    if (!run.harnessCompletion) {
      reasons.push(`Task ${run.taskId} is done without trusted Harness completion evidence.`);
      continue;
    }
    const record = validateHarnessTaskCompletionRecord(run.harnessCompletion);
    if (!record.accepted) {
      reasons.push(
        `Task ${run.taskId} has rejected Harness completion: ${record.rejectionReason ?? "unknown"}`,
      );
      continue;
    }
    evidence.push(...record.evidence);
  }

  const result = {
    version: HARNESS_CONTRACT_VERSION,
    status: "done" as const,
    summary: `Bloom Harness project pack completion for ${binding.pack.id}.`,
    changedFiles: [],
    commandsExecuted: [],
    evidenceIds: evidence.map((item) => item.id),
    risks: [],
    unresolvedIssues: [],
    nextActions: [],
  };
  const gate = evaluateHarnessCompletion({
    requiredEvidence: binding.pack.requiredEvidence,
    result,
    evidence,
  });

  if (!gate.ready && gate.missingEvidenceKinds.length > 0) {
    reasons.push(
      `Missing pack evidence kinds: ${gate.missingEvidenceKinds.join(", ")}.`,
    );
  }
  return {
    ready: reasons.length === 0 && gate.ready,
    reasons,
    referencedEvidence: gate.referencedEvidence,
    missingEvidenceIds: gate.missingEvidenceIds,
    missingEvidenceKinds: gate.missingEvidenceKinds,
  };
}
