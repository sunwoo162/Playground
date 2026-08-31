import * as fs from "node:fs";
import * as path from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync(
  path.resolve(__dirname, "../../bloom-runtime/src/project_runtime.rs"),
  "utf8",
);

assert(source.includes("Every repository-writing Task MUST have a transitive downstream Code Review -> Reviewer -> QA path."), "PM prompt must require a review chain for every writer task");
assert(source.includes("Repository-writing roles include design-system, designer, ux-research, frontend, backend, database, security, devops, accessibility, performance, api-integration, test-automation, data-marketing, documentation, and debug-router."), "PM prompt must enumerate repository-writing roles");
assert(source.includes("A shared downstream review chain may cover multiple writer Tasks only if it transitively depends on every covered writer."), "shared review gates must cover each writer transitively");
assert(source.includes("If Data & Marketing or Documentation writes after an earlier QA gate, it needs its own downstream review chain before completion."), "late documentation writers need their own review chain");

console.log("PASS  PM prompt preserves repository writer review topology.");
