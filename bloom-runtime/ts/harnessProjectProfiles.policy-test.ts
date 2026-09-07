import * as assert from "node:assert/strict";

import {
  resolveHarnessProjectProfile,
  type HarnessProjectProfileId,
} from "./harnessProjectProfiles";

const cases: Array<[string, HarnessProjectProfileId]> = [
  ["web-frontend", "web-frontend"],
  ["next.js", "web-frontend"],
  ["backend-service", "backend-service"],
  ["spring-boot", "backend-service"],
  ["full-stack", "fullstack-web"],
  ["nextjs-fullstack", "fullstack-web"],
  ["react native", "react-native"],
  ["expo", "react-native"],
  ["wpf", "desktop-native"],
  ["tauri", "desktop-native"],
];
for (const [input, expected] of cases) {
  assert.equal(resolveHarnessProjectProfile(input).id, expected);
}

const unknown = resolveHarnessProjectProfile("react");
assert.equal(unknown.id, "unknown");
assert.equal(unknown.preview, "none");
assert.equal(unknown.deployment, "unknown");

const web = resolveHarnessProjectProfile("NEXT.JS");
assert.equal(web.preview, "browser");
assert.equal(web.deployment, "web");
assert.deepEqual(web.commandCapabilities, ["install", "lint", "typecheck", "test", "build"]);

const backend = resolveHarnessProjectProfile(" spring-boot ");
assert.equal(backend.preview, "service");
assert.equal(backend.deployment, "service");

const mobile = resolveHarnessProjectProfile("expo");
assert.equal(mobile.preview, "device");
assert.equal(mobile.deployment, "mobile");

const desktop = resolveHarnessProjectProfile("wpf");
assert.equal(desktop.preview, "desktop");
assert.equal(desktop.deployment, "desktop");

console.log("PASS  Harness project profile resolution scenarios passed.");
