import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  deriveLunaReleaseVersion,
  readLunaPackageVersion,
} from "./lunaReleaseIdentity";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => unknown, pattern: RegExp, message: string) {
  let error: unknown = null;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof Error, message);
  assert(pattern.test(error.message), `${message}: ${error.message}`);
}

async function run() {
  const semantic = deriveLunaReleaseVersion({
    gitSha: "0123456789abcdef0123456789abcdef01234567",
    packageVersion: "1.2.3",
  });
  assert(semantic === "1.2.3+0123456789ab", "semantic package version must be combined with the first 12 Git SHA characters");

  const prerelease = deriveLunaReleaseVersion({
    gitSha: "abcdef0123456789abcdef0123456789abcdef01",
    packageVersion: "2.0.0-beta.1",
  });
  assert(prerelease === "2.0.0-beta.1+abcdef012345", "semantic-like prerelease versions must remain stable and Git-bound");

  const gitOnly = deriveLunaReleaseVersion({
    gitSha: "fedcba9876543210fedcba9876543210fedcba98",
  });
  assert(gitOnly === "git-fedcba987654", "missing package metadata must fall back to a deterministic Git version");

  const invalidPackageVersion = deriveLunaReleaseVersion({
    gitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    packageVersion: "latest; reload nginx",
  });
  assert(invalidPackageVersion === "git-aaaaaaaaaaaa", "untrusted or malformed package versions must fall back to Git identity");

  assertThrows(
    () => deriveLunaReleaseVersion({ gitSha: "abc123" }),
    /sha|git/i,
    "short Git SHA values must be rejected",
  );
  assertThrows(
    () => deriveLunaReleaseVersion({ gitSha: "ABCDEF0123456789ABCDEF0123456789ABCDEF01" }),
    /sha|git/i,
    "release identity requires exact lowercase committed Git evidence",
  );

  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "luna-release-identity-"));
  try {
    await fs.writeFile(
      path.join(workspace, "package.json"),
      JSON.stringify({ name: "sample-app", version: "3.4.5" }),
      "utf8",
    );
    assert(
      await readLunaPackageVersion(workspace) === "3.4.5",
      "package version must be read from the deployed workspace package.json",
    );

    await fs.writeFile(
      path.join(workspace, "package.json"),
      JSON.stringify({ name: "sample-app", version: "workspace:*" }),
      "utf8",
    );
    assert(
      await readLunaPackageVersion(workspace) === undefined,
      "non semantic-like package metadata must not influence release identity",
    );

    await fs.rm(path.join(workspace, "package.json"));
    assert(
      await readLunaPackageVersion(workspace) === undefined,
      "projects without root package metadata must use Git-only release identity",
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }

  console.log("PASS  Luna deterministic release identity scenarios passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
