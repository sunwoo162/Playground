import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadHarnessProjectManifest } from "./harnessProjectManifest";

function makeFixture(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bloom-harness-manifest-"));
}

function writeManifest(root: string, content: string) {
  const directory = path.join(root, ".bloom");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "project.yaml"), content, "utf8");
}

const explicitRoot = makeFixture();
writeManifest(explicitRoot, `version: 1
project:
  type: web
commands:
  test: pnpm test
git:
  baseBranch: develop
  branchPrefix: agent/
quality:
  requireReview: true
  requireTests: true
  requireBuild: true
permissions:
  filesystem: write
  git: write
  github: write
  deploy: deny
`);

const explicit = loadHarnessProjectManifest(explicitRoot);
assert.equal(explicit.source, "explicit");
assert.equal(explicit.manifest.git.baseBranch, "develop");
assert.equal(explicit.manifest.permissions.deploy, "deny");
assert.equal(explicit.manifest.commands.test, "pnpm test");

const inferredRoot = makeFixture();
const inferred = loadHarnessProjectManifest(inferredRoot);
assert.equal(inferred.source, "inferred");
assert.equal(inferred.manifest.git.baseBranch, "main");
assert.equal(inferred.manifest.permissions.filesystem, "deny");
assert.equal(inferred.manifest.permissions.git, "deny");
assert.equal(inferred.manifest.permissions.github, "deny");
assert.equal(inferred.manifest.permissions.deploy, "deny");

const invalidRoot = makeFixture();
writeManifest(invalidRoot, `version: 2
project:
  type: web
`);
assert.throws(
  () => loadHarnessProjectManifest(invalidRoot),
  /Unsupported Bloom Harness contract version: 2/,
);

const invalidPermissionRoot = makeFixture();
writeManifest(invalidPermissionRoot, `version: 1
project:
  type: web
permissions:
  filesystem: execute
`);
assert.throws(
  () => loadHarnessProjectManifest(invalidPermissionRoot),
  /permissions\.filesystem/,
);

for (const root of [
  explicitRoot,
  inferredRoot,
  invalidRoot,
  invalidPermissionRoot,
]) {
  fs.rmSync(root, { recursive: true, force: true });
}


const invalidProjectRoot = makeFixture();
writeManifest(invalidProjectRoot, `version: 1
project:
  type: ""
`);
assert.throws(
  () => loadHarnessProjectManifest(invalidProjectRoot),
  /project\.type/,
);

const invalidCommandRoot = makeFixture();
writeManifest(invalidCommandRoot, `version: 1
project:
  type: web
commands:
  test: 42
`);
assert.throws(
  () => loadHarnessProjectManifest(invalidCommandRoot),
  /commands\.test/,
);

const invalidGitRoot = makeFixture();
writeManifest(invalidGitRoot, `version: 1
project:
  type: web
git:
  baseBranch: ""
`);
assert.throws(
  () => loadHarnessProjectManifest(invalidGitRoot),
  /git\.baseBranch/,
);

for (const root of [invalidProjectRoot, invalidCommandRoot, invalidGitRoot]) {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("PASS  Bloom Harness project manifest scenarios passed.");
