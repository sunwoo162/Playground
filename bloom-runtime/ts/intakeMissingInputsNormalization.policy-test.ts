import { normalizeBlockingMissingInputs } from "./headlessBuilderExecutor";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const noneOnly = normalizeBlockingMissingInputs([" none ", " NONE "]);
assert(noneOnly.length === 0, "the Local Intake sentinel `none` must not block project execution regardless of casing");

const mixed = normalizeBlockingMissingInputs(["none", " OAuth client id "]);
assert(
  mixed.length === 1 && mixed[0] === "OAuth client id",
  "real missing Product Owner input must remain blocking while `none` is discarded",
);

console.log("Project Intake missing-input normalization policy tests passed");
