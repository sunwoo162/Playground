import * as fs from "node:fs";
import * as path from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync(
  path.resolve(__dirname, "../../bloom-runtime/src/project_runtime.rs"),
  "utf8",
);

assert(!source.includes('"--add-readme".to_string()'), "bootstrap must not depend on gh --add-readme");
assert(source.includes('git_args(&workspace, &["checkout", "--orphan", "main"])'), "empty repositories must create an unborn main branch");
assert(source.includes('&["commit", "--allow-empty", "-m", "chore : initialize repository"]'), "empty repositories must receive a deterministic bootstrap commit");
assert(source.includes('git_args(&workspace, &["push", "-u", "origin", "main"])'), "bootstrap main must be pushed to origin");

console.log("PASS  GitHub bootstrap initializes empty repositories without gh --add-readme.");
