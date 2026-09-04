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

fs.rmSync(root, { recursive: true, force: true });
console.log("PASS  Bloom Harness run artifact scenarios passed.");
