export interface LocalGitHubStatus {
  projectRoot: string;
  git: { installed: boolean; version: string };
  gh: { installed: boolean; version: string; installCommand: string };
  repository: {
    isRepo: boolean;
    branch: string;
    remoteOrigin: string;
    hasOrigin: boolean;
    lastCommit: string;
    branchSummary: string;
    changedFiles: string[];
    changedCount: number;
    clean: boolean;
  };
}
