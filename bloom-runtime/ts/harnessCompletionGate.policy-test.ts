import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  assertHarnessCompletion,
  assertHarnessRunCompletion,
  evaluateHarnessCompletion,
  evaluateHarnessRunCompletion,
} from "./harnessCompletionGate";
import { createHarnessRunArtifactStore } from "./harnessRunArtifacts";

function doneResult(evidenceIds: string[]) {
  return {
    version: 1,
    status: "done",
    summary: "completed",
    changedFiles: ["src/login.ts"],
    commandsExecuted: ["pnpm test"],
    evidenceIds,
    risks: [],
    unresolvedIssues: [],
    nextActions: [],
  };
}

const testEvidence = {
  version: 1,
  id: "test-1",
  kind: "test",
  summary: "regression passed",
};
const fileEvidence = {
  version: 1,
  id: "file-1",
  kind: "file-change",
  summary: "login file changed",
};
const reviewEvidence = {
  version: 1,
  id: "review-1",
  kind: "review",
  summary: "review approved",
};

const ready = evaluateHarnessCompletion({
  requiredEvidence: ["test", "file-change", "review"],
  result: doneResult(["test-1", "file-1", "review-1"]),
  evidence: [testEvidence, fileEvidence, reviewEvidence],
});
assert.equal(ready.ready, true);
assert.deepEqual(ready.missingEvidenceIds, []);
assert.deepEqual(ready.missingEvidenceKinds, []);
assert.equal(assertHarnessCompletion({
  requiredEvidence: ["test", "file-change", "review"],
  result: doneResult(["test-1", "file-1", "review-1"]),
  evidence: [testEvidence, fileEvidence, reviewEvidence],
}).status, "done");
const unreferencedRequired = evaluateHarnessCompletion({
  requiredEvidence: ["review"],
  result: doneResult(["test-1"]),
  evidence: [testEvidence, reviewEvidence],
});
assert.equal(unreferencedRequired.ready, false);
assert.deepEqual(unreferencedRequired.missingEvidenceKinds, ["review"]);

const missingReference = evaluateHarnessCompletion({
  requiredEvidence: ["test"],
  result: doneResult(["test-1", "missing-1"]),
  evidence: [testEvidence],
});
assert.equal(missingReference.ready, false);
assert.deepEqual(missingReference.missingEvidenceIds, ["missing-1"]);

assert.throws(
  () => evaluateHarnessCompletion({
    requiredEvidence: ["test"],
    result: doneResult(["test-1"]),
    evidence: [testEvidence, { ...testEvidence, summary: "duplicate" }],
  }),
  /duplicate.*evidence|evidence.*duplicate/i,
);
const blocked = evaluateHarnessCompletion({
  requiredEvidence: ["test"],
  result: { ...doneResult(["test-1"]), status: "blocked" },
  evidence: [testEvidence],
});
assert.equal(blocked.ready, false);
assert.equal(blocked.reason, "result-not-done");
assert.throws(
  () => assertHarnessCompletion({
    requiredEvidence: ["test"],
    result: { ...doneResult(["test-1"]), status: "failed" },
    evidence: [testEvidence],
  }),
  /not done|completion/i,
);

assert.throws(
  () => evaluateHarnessCompletion({
    requiredEvidence: ["unknown" as "test"],
    result: doneResult(["test-1"]),
    evidence: [testEvidence],
  }),
  /required evidence/i,
);


const runRoot = fs.mkdtempSync(`${os.tmpdir()}${path.sep}bloom-completion-gate-`);
const runStore = createHarnessRunArtifactStore(runRoot, "run-ready");
runStore.writeSnapshot("result", doneResult(["test-1"]));
runStore.appendEvidence({
  version: 1,
  id: "test-1",
  kind: "test",
  summary: "persisted regression passed",
});
const runBundle = runStore.readRun();
const persistedReady = evaluateHarnessRunCompletion(runBundle, ["test"]);
assert.equal(persistedReady.ready, true);
assert.equal(
  assertHarnessRunCompletion(runBundle, ["test"]).status,
  "done",
);
const missingResultStore = createHarnessRunArtifactStore(runRoot, "run-missing-result");
assert.throws(
  () => evaluateHarnessRunCompletion(missingResultStore.readRun(), ["test"]),
  /result snapshot.*missing|missing.*result snapshot/i,
);

const missingEvidenceStore = createHarnessRunArtifactStore(runRoot, "run-missing-evidence");
missingEvidenceStore.writeSnapshot("result", doneResult(["test-1", "ghost-1"]));
missingEvidenceStore.appendEvidence({
  version: 1,
  id: "test-1",
  kind: "test",
  summary: "persisted regression passed",
});
const persistedMissing = evaluateHarnessRunCompletion(
  missingEvidenceStore.readRun(),
  ["test"],
);
assert.equal(persistedMissing.ready, false);
assert.deepEqual(persistedMissing.missingEvidenceIds, ["ghost-1"]);
const unreferencedStore = createHarnessRunArtifactStore(runRoot, "run-unreferenced");
unreferencedStore.writeSnapshot("result", doneResult(["test-1"]));
unreferencedStore.appendEvidence({ version: 1, id: "test-1", kind: "test", summary: "passed" });
unreferencedStore.appendEvidence({ version: 1, id: "review-1", kind: "review", summary: "approved" });
const persistedUnreferenced = evaluateHarnessRunCompletion(
  unreferencedStore.readRun(),
  ["review"],
);
assert.equal(persistedUnreferenced.ready, false);
assert.deepEqual(persistedUnreferenced.missingEvidenceKinds, ["review"]);

fs.rmSync(runRoot, { recursive: true, force: true });
console.log("PASS  Bloom Harness evidence completion gate scenarios passed.");
