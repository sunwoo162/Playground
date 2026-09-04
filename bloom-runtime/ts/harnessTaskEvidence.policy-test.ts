import * as assert from "node:assert/strict";

import type { HarnessEvidence } from "./harnessContracts";
import { validateHarnessTaskCompletionRecord } from "./harnessTaskEvidence";

const fileEvidence: HarnessEvidence = {
  version: 1,
  id: "file-1",
  kind: "file-change",
  summary: "file changed",
};

const sourceEvidence = [fileEvidence];
const valid = validateHarnessTaskCompletionRecord({
  version: 1,
  accepted: true,
  evidence: sourceEvidence,
  requiredEvidence: ["file-change"],
  rejectionReason: null,
});
assert.equal(valid.accepted, true);
assert.deepEqual(valid.evidence, [fileEvidence]);
assert.notEqual(valid.evidence, sourceEvidence);

assert.throws(
  () => validateHarnessTaskCompletionRecord({
    version: 1,
    accepted: true,
    evidence: [fileEvidence, fileEvidence],
    requiredEvidence: [],
    rejectionReason: null,
  }),
  /duplicate/i,
);
assert.throws(
  () => validateHarnessTaskCompletionRecord({
    version: 1,
    accepted: true,
    evidence: [{ ...fileEvidence, kind: "fake" }],
    requiredEvidence: [],
    rejectionReason: null,
  }),
  /evidence kind|invalid/i,
);

assert.throws(
  () => validateHarnessTaskCompletionRecord({
    version: 1,
    accepted: false,
    evidence: [],
    requiredEvidence: [],
    rejectionReason: null,
  }),
  /rejection reason/i,
);

assert.throws(
  () => validateHarnessTaskCompletionRecord({
    version: 1,
    accepted: true,
    evidence: [],
    requiredEvidence: [],
    rejectionReason: "should be null",
  }),
  /accepted|rejection reason/i,
);

assert.throws(
  () => validateHarnessTaskCompletionRecord({
    version: 1,
    accepted: true,
    evidence: [],
    requiredEvidence: ["file-change"],
    rejectionReason: null,
  }),
  /missing required evidence/i,
);

console.log("PASS  Bloom Harness task evidence record scenarios passed.");
