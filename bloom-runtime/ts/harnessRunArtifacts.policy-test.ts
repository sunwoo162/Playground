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

assert.equal(
  fs.readFileSync(path.join(root, ".bloom", "runs", "run-001", "retrospective.md"), "utf8"),
  "# Retrospective\n\nNo regressions.\n",
);
assert.throws(() => store.writeRetrospective("replace"), /already exists/);
for (const invalidRunId of ["../escape", "..", ".", "run/escape", "run\\escape", "", " run-001"]) {
  assert.throws(
    () => createHarnessRunArtifactStore(root, invalidRunId),
    /run id/i,
  );
}

fs.rmSync(root, { recursive: true, force: true });
console.log("PASS  Bloom Harness run snapshot scenarios passed.");
