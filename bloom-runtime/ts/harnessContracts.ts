import type { AgentPermission, AgentRole } from "./types";

export const HARNESS_CONTRACT_VERSION = 1 as const;

export type HarnessPermissionMode = "deny" | "read" | "write";
export type HarnessProjectManifest = {
  version: 1;
  project: { type: string };
  commands: Partial<
    Record<"install" | "lint" | "typecheck" | "test" | "build", string>
  >;
  git: { baseBranch: string; branchPrefix: string };
  quality: {
    requireReview: boolean;
    requireTests: boolean;
    requireBuild: boolean;
  };
  permissions: {
    filesystem: HarnessPermissionMode;
    git: HarnessPermissionMode;
    github: HarnessPermissionMode;
    deploy: "deny" | "write";
  };
};

export type HarnessAgentEnvelope = {
  version: 1;
  objective: string;
  role: AgentRole;
  permissions: AgentPermission[];
  acceptanceCriteria: string[];
  requiredEvidence: string[];
};

export type HarnessAgentResult = {
  version: 1;
  status: "done" | "blocked" | "failed";
  summary: string;
  changedFiles: string[];
  commandsExecuted: string[];
  evidenceIds: string[];
  risks: string[];
  unresolvedIssues: string[];
  nextActions: string[];
};

export type HarnessEvidenceKind =
  | "command"
  | "test"
  | "build"
  | "file-change"
  | "review"
  | "github"
  | "deployment";

export type HarnessEvidence = {
  version: 1;
  id: string;
  kind: HarnessEvidenceKind;
  summary: string;
};

export function assertHarnessContractVersion(
  version: number,
): asserts version is 1 {
  if (version !== HARNESS_CONTRACT_VERSION) {
    throw new Error(`Unsupported Bloom Harness contract version: ${version}`);
  }
}
