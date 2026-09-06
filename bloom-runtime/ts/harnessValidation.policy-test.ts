import * as assert from "node:assert/strict";

import {
  validateHarnessAgentEnvelope,
  validateHarnessAgentResult,
  validateHarnessEvidence,
  validateHarnessExecutionIdentity,
} from "./harnessValidation";

function identity() {
  return {
    projectId: "jobdam",
    taskId: "TASK-52",
    runId: "run-102",
    agentId: "frontend-1",
  };
}

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
  identity: identity(),
  objective: "Fix the login crash",
  role: "frontend",
  permissions: ["repository:read", "repository:write"],
  acceptanceCriteria: ["Regression test passes"],
  requiredEvidence: ["test"],
});
assert.equal(envelope.role, "frontend");
assert.deepEqual(envelope.identity, identity());

const result = validateHarnessAgentResult({
  version: 1,
  identity: identity(),
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
assert.deepEqual(result.identity, identity());

const evidence = validateHarnessEvidence({
  version: 1,
  identity: identity(),
  id: "test-1",
  kind: "test",
  summary: "Login regression test passed",
});
assert.equal(evidence.kind, "test");
assert.deepEqual(evidence.identity, identity());

const validatedIdentity = validateHarnessExecutionIdentity(identity());
assert.deepEqual(validatedIdentity, identity());
for (const invalid of [
  { ...identity(), projectId: "" },
  { ...identity(), taskId: " bad" },
  { ...identity(), runId: "run/escape" },
  { ...identity(), agentId: "agent\\escape" },
]) {
  assert.throws(
    () => validateHarnessExecutionIdentity(invalid),
    /identity|identifier|projectId|taskId|runId|agentId/i,
  );
}
assert.equal(
  validateHarnessExecutionIdentity({ ...identity(), agentId: null }).agentId,
  null,
);

const legacyEvidence = validateHarnessEvidence({
  version: 1,
  id: "legacy-1",
  kind: "test",
  summary: "legacy evidence remains readable",
});
assert.equal(legacyEvidence.identity, undefined);

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

assert.throws(
  () => validateHarnessAgentEnvelope({
    version: 1,
    objective: "Escalate privileges",
    role: "root",
    permissions: ["repository:read"],
    acceptanceCriteria: [],
    requiredEvidence: ["test"],
  }),
  /role/,
);
assert.throws(
  () => validateHarnessAgentEnvelope({
    version: 1,
    objective: "Fix it",
    role: "frontend",
    permissions: ["repository:read", "root:write"],
    acceptanceCriteria: [],
    requiredEvidence: ["test"],
  }),
  /permissions/,
);
assert.throws(
  () => validateHarnessAgentEnvelope({
    version: 1,
    objective: "Fix it",
    role: "frontend",
    permissions: ["repository:read"],
    acceptanceCriteria: [],
    requiredEvidence: ["made-up-evidence"],
  }),
  /requiredEvidence/,
);

assert.throws(
  () => validateHarnessEvidence({
    version: 1,
    identity: { ...identity(), runId: "run/escape" },
    id: "bad-identity",
    kind: "test",
    summary: "bad identity",
  }),
  /runId|identity|identifier/i,
);

console.log("PASS  Bloom Harness agent, identity, and evidence validation scenarios passed.");
