import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  activateStaticRelease,
  installStaticCandidate,
  rollbackStaticRelease,
} from "./lunaStaticRelease";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

async function activeSha(appsRoot: string) {
  const current = path.join(appsRoot, "sample-app", "current");
  const link = await fs.readlink(current);
  return path.basename(link);
}

async function run() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "luna-static-release-"));
  try {
    const appsRoot = path.join(temp, "apps");
    const outputA = path.join(temp, "output-a");
    const outputB = path.join(temp, "output-b");
    await fs.mkdir(outputA, { recursive: true });
    await fs.mkdir(outputB, { recursive: true });
    await fs.writeFile(path.join(outputA, "index.html"), "release-a");
    await fs.writeFile(path.join(outputB, "index.html"), "release-b");

    const candidateA = await installStaticCandidate({
      slug: "sample-app",
      sha: SHA_A,
      outputPath: outputA,
      appsRoot,
    });
    assert(candidateA.releasePath === path.join(appsRoot, "sample-app", "releases", SHA_A), "candidate A installs into immutable SHA release directory");
    assert(await fs.readFile(path.join(candidateA.releasePath, "index.html"), "utf8") === "release-a", "candidate files are copied before activation");

    const first = await activateStaticRelease({ slug: "sample-app", sha: SHA_A, appsRoot });
    assert(first.previousSha === null, "first activation has no previous release");
    assert(await activeSha(appsRoot) === SHA_A, "current symlink points to release A");

    await installStaticCandidate({ slug: "sample-app", sha: SHA_B, outputPath: outputB, appsRoot });
    const second = await activateStaticRelease({ slug: "sample-app", sha: SHA_B, appsRoot });
    assert(second.previousSha === SHA_A, "second activation records previous healthy SHA");
    assert(await activeSha(appsRoot) === SHA_B, "current symlink atomically switches to release B");

    await rollbackStaticRelease({ slug: "sample-app", previousSha: SHA_A, appsRoot });
    assert(await activeSha(appsRoot) === SHA_A, "rollback restores the previous healthy SHA");
    assert(await fs.readFile(path.join(appsRoot, "sample-app", "releases", SHA_B, "index.html"), "utf8") === "release-b", "rollback keeps candidate release directory for evidence/retention");

    const outside = path.join(temp, "outside");
    const badOutput = path.join(temp, "bad-output");
    await fs.mkdir(outside, { recursive: true });
    await fs.mkdir(badOutput, { recursive: true });
    await fs.writeFile(path.join(outside, "secret.txt"), "must-not-copy");
    await fs.symlink(outside, path.join(badOutput, "escape"));

    let rejectedEscape = false;
    try {
      await installStaticCandidate({
        slug: "sample-app",
        sha: "cccccccccccccccccccccccccccccccccccccccc",
        outputPath: badOutput,
        appsRoot,
      });
    } catch (error) {
      rejectedEscape = error instanceof Error && /symlink|outside|escape/i.test(error.message);
    }
    assert(rejectedEscape, "static candidate installation rejects symlinks escaping the build output root");

    console.log("PASS  Luna atomic static release scenarios passed.");
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
