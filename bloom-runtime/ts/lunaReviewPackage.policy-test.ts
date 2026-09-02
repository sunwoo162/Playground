import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { buildLunaReviewPackage, writeLunaReviewPackage } from "./lunaReviewPackage";

async function main() {
  const input = {
    projectName: "Pulseboard",
    projectSlug: "pulseboard",
    repositoryFullName: "sunwoo162/pulseboard",
    commitSha: "a".repeat(40),
    publicUrl: "https://bloombouquet.https.gsmsv.site/apps/pulseboard/",
    requiresAuth: false,
  };
  const reviewPackage = buildLunaReviewPackage(input);
  assert.equal(reviewPackage.repository.fullName, input.repositoryFullName);
  assert.equal(reviewPackage.deployment.publicUrl, input.publicUrl);
  assert.equal(reviewPackage.deployment.commitSha, input.commitSha);
  assert.equal((reviewPackage as unknown as Record<string, unknown>).token, undefined);
  assert.equal((reviewPackage as unknown as Record<string, unknown>).secret, undefined);

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "luna-review-package-"));
  try {
    const written = await writeLunaReviewPackage(root, input);
    assert.equal(written.path, path.join(root, ".luna", "review-package.json"));
    const persisted = JSON.parse(await fs.readFile(written.path, "utf8"));
    assert.equal(persisted.repository.fullName, input.repositoryFullName);
    assert.equal(persisted.deployment.commitSha, input.commitSha);
    const serialized = JSON.stringify(persisted).toLowerCase();
    for (const forbidden of ["password", "authorization", "privatekey", "access_token"]) {
      assert.equal(serialized.includes(forbidden), false, `review package must exclude ${forbidden}`);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
  console.log("PASS  Luna review package contains only review-safe deployment metadata.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
