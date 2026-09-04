import * as fs from "node:fs";
import * as path from "node:path";

export type HarnessRunSnapshotName =
  | "request"
  | "manifest"
  | "pack"
  | "plan"
  | "dag"
  | "review"
  | "qa"
  | "result";

const SNAPSHOT_FILES: Record<HarnessRunSnapshotName, string> = {
  request: "request.json",
  manifest: "manifest.snapshot.json",
  pack: "pack.snapshot.json",
  plan: "plan.json",
  dag: "dag.json",
  review: "review.json",
  qa: "qa.json",
  result: "result.json",
};

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function assertRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId) || runId === "." || runId === "..") {
    throw new Error(`Bloom Harness run id is invalid: ${runId}`);
  }
}

function serializeJson(value: unknown, label: string): string {
  try {
    const serialized = JSON.stringify(value, null, 2);
    if (serialized === undefined) {
      throw new Error(`${label} is not JSON-serializable`);
    }
    return `${serialized}\n`;
  } catch (error) {
    if (error instanceof Error && error.message.includes("not JSON-serializable")) {
      throw error;
    }
    throw new Error(`Bloom Harness ${label} could not be serialized as JSON.`);
  }
}

function writeOnce(filePath: string, content: string): void {
  try {
    fs.writeFileSync(filePath, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Bloom Harness artifact already exists: ${filePath}`);
    }
    throw error;
  }
}
export type HarnessRunArtifactStore = {
  runId: string;
  runDir: string;
  writeSnapshot(name: HarnessRunSnapshotName, value: unknown): void;
  writeRetrospective(markdown: string): void;
};

export function createHarnessRunArtifactStore(
  repoRoot: string,
  runId: string,
): HarnessRunArtifactStore {
  assertRunId(runId);

  const runsRoot = path.resolve(repoRoot, ".bloom", "runs");
  const runDir = path.resolve(runsRoot, runId);
  if (!runDir.startsWith(`${runsRoot}${path.sep}`)) {
    throw new Error(`Bloom Harness run id escapes runs root: ${runId}`);
  }
  fs.mkdirSync(runDir, { recursive: true });

  return {
    runId,
    runDir,
    writeSnapshot(name, value) {
      const filePath = path.join(runDir, SNAPSHOT_FILES[name]);
      writeOnce(filePath, serializeJson(value, `${name} snapshot`));
    },
    writeRetrospective(markdown) {
      writeOnce(path.join(runDir, "retrospective.md"), markdown);
    },
  };
}
