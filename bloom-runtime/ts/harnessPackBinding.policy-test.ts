import * as assert from "node:assert/strict";

import {
  legacyUnboundHarnessPackBinding,
  resolveHarnessPackBinding,
  validateHarnessPackBinding,
} from "./harnessPackBinding";

const explicit = resolveHarnessPackBinding({
  intent: "ship feature",
  explicitPack: "bug-fix",
});
assert.equal(explicit.status, "bound");
assert.equal(explicit.source, "explicit");
assert.equal(explicit.pack?.id, "bug-fix");

for (const intent of [
  "Fix login crash",
  "로그인 버그 고쳐",
  "결제 오류",
  "회귀 문제 고치자",
]) {
  const inferred = resolveHarnessPackBinding({ intent });
  assert.equal(inferred.status, "bound", intent);
  assert.equal(inferred.source, "intent", intent);
}
const unbound = resolveHarnessPackBinding({ intent: "Add profile page" });
assert.equal(unbound.status, "unbound");
assert.equal(unbound.source, "none");
assert.equal(unbound.pack, null);
assert.equal(resolveHarnessPackBinding({ intent: "화면 수정" }).status, "unbound");

const unknown = resolveHarnessPackBinding({ intent: "x", explicitPack: "unknown" });
assert.equal(unknown.status, "blocked");
assert.equal(unknown.source, "explicit");
assert.equal(unknown.pack, null);
assert.match(unknown.reason, /unknown/i);

const legacy = legacyUnboundHarnessPackBinding("legacy");
assert.equal(legacy.status, "unbound");
assert.equal(legacy.source, "none");
assert.equal(legacy.reason, "legacy");

assert.throws(
  () => validateHarnessPackBinding({ version: 2 }),
  /version|Unsupported/i,
);

const copy = resolveHarnessPackBinding({ intent: "fix crash" });
assert.equal(copy.status, "bound");
if (copy.status === "bound" && copy.pack) {
  copy.pack.requiredRoles.push("frontend");
  assert.equal(resolveHarnessPackBinding({ intent: "fix crash" }).pack?.requiredRoles.includes("frontend"), false);
}

console.log("PASS  Bloom Harness live pack binding scenarios passed.");
