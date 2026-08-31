import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { installServerCandidateRelease } from "./lunaServerRelease";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "luna-server-release-"));
  try {
    const source = path.join(temp, "workspace");
    const appsRoot = path.join(temp, "apps");
    await fs.mkdir(path.join(source, ".git"), { recursive: true });
    await fs.mkdir(path.join(source, "dist"), { recursive: true });
    await fs.writeFile(path.join(source, "package.json"), "{\"name\":\"example\"}\n", "utf8");
    await fs.writeFile(path.join(source, "dist", "server.js"), "console.log('ok');\n", "utf8");
    await fs.writeFile(path.join(source, ".git", "config"), "secret git metadata\n", "utf8");

    const sha = "0123456789abcdef0123456789abcdef01234567";
    const first = await installServerCandidateRelease({
      slug: "example-app",
      runtimeId: "web",
      sha,
      sourcePath: source,
      appsRoot,
    });
    assert(
      first.releasePath === path.join(appsRoot, "example-app", "releases", sha, "web"),
      "server candidate must use immutable slug/SHA/runtime release identity",
    );
    assert(
      (await fs.readFile(path.join(first.releasePath, "dist", "server.js"), "utf8")).includes("ok"),
      "server release must contain the built runtime workspace",
    );
    let gitCopied = true;
    try {
      await fs.stat(path.join(first.releasePath, ".git"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") gitCopied = false;
      else throw error;
    }
    assert(!gitCopied, "server release must not copy repository control metadata");

    await fs.writeFile(path.join(source, "dist", "server.js"), "console.log('changed');\n", "utf8");
    const retry = await installServerCandidateRelease({
      slug: "example-app",
      runtimeId: "web",
      sha,
      sourcePath: source,
      appsRoot,
    });
    assert(retry.releasePath === first.releasePath, "same SHA retries must reuse the same immutable release");
    assert(
      (await fs.readFile(path.join(retry.releasePath, "dist", "server.js"), "utf8")).includes("ok"),
      "same SHA retries must not mutate an installed release",
    );

    let invalidShaRejected = false;
    try {
      await installServerCandidateRelease({
        slug: "example-app",
        runtimeId: "web",
        sha: "short-sha",
        sourcePath: source,
        appsRoot,
      });
    } catch (error) {
      invalidShaRejected = error instanceof Error && /40-character|SHA/i.test(error.message);
    }
    assert(invalidShaRejected, "server release must reject non-authoritative SHAs");

    console.log("PASS  Luna immutable server release scenarios passed.");
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
