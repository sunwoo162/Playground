import * as assert from "node:assert/strict";

import {
  BUG_FIX_PACK,
  resolveHarnessPack,
} from "./harnessPackRegistry";

const explicit = resolveHarnessPack({
  explicitPack: "bug-fix",
  intent: "anything",
});
assert.equal(explicit.pack.id, "bug-fix");
assert.match(explicit.reason, /explicit/i);

const inferred = resolveHarnessPack({ intent: "Fix login crash" });
assert.equal(inferred.pack.id, "bug-fix");
assert.match(inferred.reason, /intent/i);
assert.deepEqual(BUG_FIX_PACK.requiredEvidence, ["test", "file-change", "review"]);
assert.deepEqual(BUG_FIX_PACK.stages, [
  "reproduce",
  "root-cause",
  "regression-test",
  "fix",
  "review",
  "qa",
]);

assert.throws(
  () => resolveHarnessPack({ explicitPack: "unknown", intent: "fix bug" }),
  /Unknown Bloom Harness pack: unknown/,
);
assert.throws(
  () => resolveHarnessPack({ intent: "write a product proposal" }),
  /No Bloom Harness pack matched intent/,
);

for (const keyword of ["bug", "fix", "error", "crash", "failure", "regression"]) {
  assert.equal(
    resolveHarnessPack({ intent: `Please handle this ${keyword}` }).pack.id,
    "bug-fix",
  );
}

console.log("PASS  Bloom Harness bug-fix pack selection scenarios passed.");
