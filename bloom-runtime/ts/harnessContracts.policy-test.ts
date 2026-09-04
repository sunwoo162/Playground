import * as assert from "node:assert/strict";

import {
  HARNESS_CONTRACT_VERSION,
  assertHarnessContractVersion,
} from "./harnessContracts";

assert.equal(HARNESS_CONTRACT_VERSION, 1);
assert.doesNotThrow(() => assertHarnessContractVersion(1));
assert.throws(
  () => assertHarnessContractVersion(2),
  /Unsupported Bloom Harness contract version: 2/,
);

console.log("PASS  Bloom Harness contract version scenarios passed.");
