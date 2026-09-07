import * as assert from "node:assert/strict";

import {
  BUG_FIX_PACK,
  CODE_REVIEW_PACK,
  DEPLOYMENT_PACK,
  DOCUMENTATION_PACK,
  FEATURE_DEVELOPMENT_PACK,
  findHarnessPackById,
  inferHarnessPack,
  resolveHarnessPack,
} from "./harnessPackRegistry";

for (const pack of [
  BUG_FIX_PACK,
  FEATURE_DEVELOPMENT_PACK,
  CODE_REVIEW_PACK,
  DOCUMENTATION_PACK,
  DEPLOYMENT_PACK,
]) {
  assert.equal(findHarnessPackById(pack.id)?.id, pack.id);
}
assert.equal(findHarnessPackById("unknown"), null);

assert.equal(inferHarnessPack("로그인 오류")?.pack.id, "bug-fix");
assert.equal(inferHarnessPack("Production 배포해")?.pack.id, "deployment");
assert.equal(inferHarnessPack("Build and release automatically")?.pack.id, "feature-development");
assert.equal(inferHarnessPack("PR 코드 리뷰해")?.pack.id, "code-review");
assert.equal(inferHarnessPack("README 문서 정리해")?.pack.id, "documentation");
assert.equal(inferHarnessPack("사용자 프로필 기능 추가해")?.pack.id, "feature-development");

const explicit = resolveHarnessPack({
  explicitPack: "documentation",
  intent: "fix a crash",
});
assert.equal(explicit.pack.id, "documentation");
assert.match(explicit.reason, /explicit/i);

const inferred = resolveHarnessPack({ intent: "Fix login crash" });
assert.equal(inferred.pack.id, "bug-fix");
assert.match(inferred.reason, /intent/i);

assert.deepEqual(BUG_FIX_PACK.requiredEvidence, ["test", "file-change", "review"]);
assert.deepEqual(FEATURE_DEVELOPMENT_PACK.requiredEvidence, ["file-change", "test", "review"]);
assert.deepEqual(CODE_REVIEW_PACK.requiredEvidence, ["review"]);
assert.deepEqual(DOCUMENTATION_PACK.requiredEvidence, ["file-change", "review"]);
assert.deepEqual(DEPLOYMENT_PACK.requiredEvidence, ["build", "deployment", "test"]);

assert.deepEqual(DEPLOYMENT_PACK.requiredRoles, ["devops", "qa"]);
assert.deepEqual(CODE_REVIEW_PACK.requiredRoles, ["code-review", "reviewer"]);
assert.deepEqual(DOCUMENTATION_PACK.requiredRoles, ["documentation", "reviewer"]);

assert.equal(resolveHarnessPack({ intent: "fix and deploy login crash" }).pack.id, "bug-fix");
assert.equal(resolveHarnessPack({ intent: "deploy README docs" }).pack.id, "deployment");
assert.equal(resolveHarnessPack({ intent: "code review README documentation" }).pack.id, "code-review");

assert.throws(
  () => resolveHarnessPack({ explicitPack: "unknown", intent: "fix bug" }),
  /Unknown Bloom Harness pack: unknown/,
);
assert.throws(
  () => resolveHarnessPack({ intent: "summarize project status" }),
  /No Bloom Harness pack matched intent/,
);

for (const keyword of ["bug", "fix", "error", "crash", "failure", "regression"]) {
  assert.equal(
    resolveHarnessPack({ intent: `Please handle this ${keyword}` }).pack.id,
    "bug-fix",
  );
}

console.log("PASS  Bloom Harness built-in pack selection scenarios passed.");
