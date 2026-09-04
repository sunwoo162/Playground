import * as assert from "node:assert/strict";

import {
  validateHarnessAgentEnvelope,
  validateHarnessAgentResult,
  validateHarnessEvidence,
} from "./harnessValidation";

assert.throws(
  () => validateHarnessAgentEnvelope({ version: 2 }),
  /contract version/,
);
assert.throws(
  () => validateHarnessAgentResult({ version: 1, status: "done", evidenceIds: [] }),
  /summary/,
);
assert.throws(
  () => validateHarnessEvidence({ version: 1, id: "", kind: "test", summary: "ok" }),
  /evidence id/,
);

const envelope = validateHarnessAgentEnvelope({
  version: 1,
  objective: "Fix the login crash",
  role: "frontend",
  permissions: ["repository:read", "repository:write"],
  acceptanceCriteria: ["Regression test passes"],
  requiredEvidence: ["test"],
});
assert.equal(envelope.role, "frontend");

const result = validateHarnessAgentResult({
  version: 1,
  status: "done",
  summary: "Fixed login crash",
  changedFiles: ["src/login.ts"],
  commandsExecuted: ["pnpm test"],
  evidenceIds: ["test-1"],
  risks: [],
  unresolvedIssues: [],
  nextActions: ["Open PR"],
});
assert.equal(result.status, "done");

const evidence = validateHarnessEvidence({
  version: 1,
  id: "test-1",
  kind: "test",
  summary: "Login regression test passed",
});
assert.equal(evidence.kind, "test");

assert.throws(
  () => validateHarnessAgentResult({ version: 1, status: "unknown", summary: "x" }),
  /status/,
);
assert.throws(
  () => validateHarnessEvidence({ version: 1, id: "e-1", kind: "unknown", summary: "x" }),
  /evidence kind/,
);

assert.throws(
  () => validateHarnessAgentEnvelope({
    version: 1,
    objective: "Fix it",
    role: "frontend",
    permissions: [],
    acceptanceCriteria: "not-an-array",
    requiredEvidence: [],
  }),
  /acceptanceCriteria/,
);

console.log("PASS  Bloom Harness agent and evidence validation scenarios passed.");
