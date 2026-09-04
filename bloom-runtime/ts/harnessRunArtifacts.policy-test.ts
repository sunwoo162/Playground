import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { createHarnessRunArtifactStore } from "./harnessRunArtifacts";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bloom-run-artifacts-"));
}

const root = makeRoot();
const store = createHarnessRunArtifactStore(root, "run-001");

store.writeSnapshot("request", { objective: "Fix login" });
const requestPath = path.join(root, ".bloom", "runs", "run-001", "request.json");
assert.deepEqual(JSON.parse(fs.readFileSync(requestPath, "utf8")), {
  objective: "Fix login",
});
assert.equal(fs.readFileSync(requestPath, "utf8").endsWith("\n"), true);
assert.throws(
  () => store.writeSnapshot("request", { objective: "replace" }),
  /already exists/,
);
store.writeSnapshot("manifest", { version: 1 });
store.writeSnapshot("pack", { id: "bug-fix" });
store.writeSnapshot("plan", { tasks: [] });
store.writeSnapshot("dag", { edges: [] });
store.writeSnapshot("review", { status: "approved" });
store.writeSnapshot("qa", { status: "passed" });
store.writeSnapshot("result", { status: "done" });
store.writeRetrospective("# Retrospective\n\nNo regressions.\n");
assert.throws(() => store.writeRetrospective("replace"), /already exists/);

for (const invalidRunId of ["../escape", "..", ".", "run/escape", "run\\escape", "", " run-001"]) {
  assert.throws(
    () => createHarnessRunArtifactStore(root, invalidRunId),
    /run id/i,
  );
}

const symlinkRoot = makeRoot();
const externalRoot = makeRoot();
fs.symlinkSync(
  externalRoot,
  path.join(symlinkRoot, ".bloom"),
  process.platform === "win32" ? "junction" : "dir",
);
assert.throws(
  () => createHarnessRunArtifactStore(symlinkRoot, "run-symlink"),
  /symbolic link|symlink|runs root/i,
);
fs.rmSync(symlinkRoot, { recursive: true, force: true });
fs.rmSync(externalRoot, { recursive: true, force: true });

if (process.platform !== "win32") {
  const fileLinkStore = createHarnessRunArtifactStore(root, "run-file-link");
  const externalEvents = path.join(makeRoot(), "outside-events.jsonl");
  fs.writeFileSync(externalEvents, "sentinel\n", "utf8");
  fs.symlinkSync(externalEvents, path.join(fileLinkStore.runDir, "events.jsonl"), "file");
  assert.throws(
    () => fileLinkStore.appendEvent({ type: "escape", at: "2026-09-04T00:00:00Z" }),
    /symbolic link|symlink/i,
  );
  assert.equal(fs.readFileSync(externalEvents, "utf8"), "sentinel\n");
  fs.rmSync(path.dirname(externalEvents), { recursive: true, force: true });
}

store.appendEvent({ type: "run.started", at: "2026-09-04T00:00:00Z" });
store.appendEvent({ type: "plan.created", at: "2026-09-04T00:00:01Z" });
const eventsPath = path.join(root, ".bloom", "runs", "run-001", "events.jsonl");
const eventLines = fs.readFileSync(eventsPath, "utf8").trim().split("\n");
assert.equal(eventLines.length, 2);
assert.equal(JSON.parse(eventLines[0]).type, "run.started");
assert.equal(JSON.parse(eventLines[1]).type, "plan.created");
store.appendEvidence({
  version: 1,
  id: "test-1",
  kind: "test",
  summary: "passed",
});
const evidencePath = path.join(root, ".bloom", "runs", "run-001", "evidence.json");
store.appendEvidence({
  version: 1,
  id: "review-1",
  kind: "review",
  summary: "approved",
});
assert.deepEqual(JSON.parse(fs.readFileSync(evidencePath, "utf8")), [
  { version: 1, id: "test-1", kind: "test", summary: "passed" },
  { version: 1, id: "review-1", kind: "review", summary: "approved" },
]);
assert.throws(
  () => store.appendEvidence({ version: 1, id: "test-1", kind: "test", summary: "replace" }),
  /evidence id already exists/,
);
assert.throws(
  () => store.appendEvidence({ version: 1, id: "bad", kind: "unknown" as "test", summary: "x" }),
  /evidence kind/,
);

const restored = store.readRun();
assert.equal(restored.runId, "run-001");
assert.deepEqual(restored.snapshots.request, { objective: "Fix login" });
assert.equal(restored.events[0]?.type, "run.started");
assert.equal(restored.evidence[0]?.id, "test-1");
assert.match(restored.retrospective ?? "", /Retrospective/);

const emptyStore = createHarnessRunArtifactStore(root, "run-empty");
const empty = emptyStore.readRun();
assert.deepEqual(empty.snapshots, {});
assert.deepEqual(empty.events, []);
assert.deepEqual(empty.evidence, []);
assert.equal(empty.retrospective, undefined);

const corruptStore = createHarnessRunArtifactStore(root, "run-corrupt");
fs.writeFileSync(path.join(corruptStore.runDir, "request.json"), "{bad json", "utf8");
assert.throws(() => corruptStore.readRun(), /request\.json/);

fs.rmSync(root, { recursive: true, force: true });
console.log("PASS  Bloom Harness run artifact scenarios passed.");
