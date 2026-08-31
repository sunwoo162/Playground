import * as fs from "node:fs";
import * as path from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync(
  path.resolve(__dirname, "../../bloom-runtime/src/intake_runtime.rs"),
  "utf8",
);

assert(source.includes("missingInputs MUST contain only"), "intake must reserve missingInputs for true blockers");
assert(source.includes("Non-blocking uncertainty belongs in assumptions"), "intake must route ordinary uncertainty to assumptions");
assert(source.includes("Do not block on internal Bloom/Luna orchestration details"), "intake must not ask Product Owners for system-owned handoff details");
assert(source.includes("Do not re-ask for an assumption or limitation the Product Owner explicitly accepted"), "explicit Product Owner tradeoffs must not be re-opened");

console.log("PASS  Project Intake prompt distinguishes blockers from assumptions.");
