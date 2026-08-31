import { resolveAutomaticDeliveryMainSha } from "./observedHeadlessBuilderExecutor";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const RELEASE_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DEVELOP_MERGE_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function integration() {
  return {
    repositoryFullName: "BloomBouquet/sample-app",
    mergedPullRequests: [
      {
        number: 101,
        url: "https://github.com/BloomBouquet/sample-app/pull/101",
        headBranch: "agent/sample/frontend",
        mergeCommitSha: DEVELOP_MERGE_SHA,
      },
    ],
  };
}

function run() {
  assert(
    resolveAutomaticDeliveryMainSha({
      releaseSha: RELEASE_SHA,
      integration: integration(),
    }) === RELEASE_SHA,
    "automatic delivery must use the promoted main release SHA, never the develop integration merge SHA",
  );

  for (const releaseSha of [null, undefined, DEVELOP_MERGE_SHA.toUpperCase(), "abc123"]) {
    let rejected = false;
    try {
      resolveAutomaticDeliveryMainSha({
        releaseSha,
        integration: integration(),
      });
    } catch {
      rejected = true;
    }
    assert(
      rejected,
      "automatic delivery must fail closed when exact lowercase main release SHA evidence is unavailable",
    );
  }

  console.log("PASS  Luna automatic delivery trusts only the promoted main release SHA.");
}

run();
