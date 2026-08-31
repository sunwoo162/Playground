import * as fs from "node:fs";
import * as path from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync(
  path.resolve(__dirname, "../../bloom-runtime/src/project_runtime.rs"),
  "utf8",
);

assert(source.includes('format!("users/{organization}")'), "preflight must accept GitHub user or organization owners");
assert(!source.includes('format!("orgs/{organization}")'), "preflight must not require the owner to be an organization");
assert(source.includes("GitHub owner"), "bootstrap errors must describe owner semantics, not organization-only semantics");

console.log("PASS  GitHub repository bootstrap accepts user and organization owners.");
