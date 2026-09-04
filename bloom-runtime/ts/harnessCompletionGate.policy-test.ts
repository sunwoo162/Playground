import * as assert from "node:assert/strict";

import {
  assertHarnessCompletion,
  evaluateHarnessCompletion,
} from "./harnessCompletionGate";

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

console.log("PASS  Bloom Harness evidence completion gate scenarios passed.");
