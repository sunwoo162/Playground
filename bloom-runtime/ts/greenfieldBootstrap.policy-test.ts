import * as fs from "node:fs";
import * as path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const projectRuntime = fs.readFileSync(path.resolve(__dirname, "../../bloom-runtime/src/project_runtime.rs"), "utf8");
const headlessRuntime = fs.readFileSync(path.resolve(__dirname, "../../bloom-runtime/src/headless_runtime.rs"), "utf8");
const worker = fs.readFileSync(path.resolve(__dirname, "../../bloom-worker/run.js"), "utf8");

assert(projectRuntime.includes('"scaffoldProfile"'), "PM schema must expose a strict scaffoldProfile field");
const schemaMatch = projectRuntime.match(/const PM_PLAN_SCHEMA: &str = r#"([\s\S]*?)"#;/);
assert(Boolean(schemaMatch?.[1]), "PM schema must remain extractable JSON");
const pmSchema = JSON.parse(schemaMatch![1]) as { required?: string[] };
assert(pmSchema.required?.includes("scaffoldProfile"), "PM schema must require scaffoldProfile for new plans");
assert(projectRuntime.includes('"react-api-sqlite-monorepo-v1"'), "PM schema/runtime must declare the supported React/API/SQLite profile");
assert(projectRuntime.includes("bootstrap_greenfield_project"), "project runtime must expose deterministic greenfield bootstrap");
assert(headlessRuntime.includes('bootstrapGreenfieldProject'), "headless bridge must route the greenfield bootstrap command");
assert(worker.includes('command: "bootstrapGreenfieldProject"'), "worker bridge must invoke the greenfield bootstrap command");

for (const file of [".gitignore", "AGENTS.md", "package.json", "pnpm-workspace.yaml", "frontend/package.json", "frontend/src/main.tsx", "api/package.json", "api/src/server.ts", "api/src/db.ts"]) {
  assert(projectRuntime.includes(file), `greenfield profile must seed ${file}`);
}

assert(projectRuntime.includes("chore : bootstrap react api sqlite monorepo"), "bootstrap must create one deterministic baseline commit");
assert(projectRuntime.includes('["push", "origin", integration_branch.as_str()]'), "bootstrap commit must be pushed to the integration branch");
console.log("PASS  Greenfield bootstrap Runtime contract is wired end to end.");