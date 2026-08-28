import assert = require("node:assert/strict");

import {
  buildBloomBouquetRegistrationUrl,
  decodeBloomBouquetRegistrationPayload,
} from "./bloomBouquetRegistration";

const evidenceVaultUrl = buildBloomBouquetRegistrationUrl({
  teamId: "lily",
  teamName: "백합",
  projectName: "증빙함",
  projectSlug: "evidence-vault",
  description: "증빙 자료를 안전하게 저장하고 관리하는 서비스",
  repositoryFullName: "BloomBouquet/evidence-vault",
  demoUrl: "https://bloombouquet.https.gsmsv.site/apps/evidence-vault/",
  requiresAuth: true,
});

assert.ok(evidenceVaultUrl);
const parsedUrl = new URL(evidenceVaultUrl);
assert.equal(parsedUrl.origin, "https://bloombouquet.https.gsmsv.site");
assert.equal(parsedUrl.searchParams.get("mode"), "manage");
const encoded = parsedUrl.searchParams.get("luna");
assert.ok(encoded);

const payload = decodeBloomBouquetRegistrationPayload(encoded);
assert.deepEqual(payload, {
  schemaVersion: 1,
  teamId: "lily",
  teamName: "백합",
  projectName: "증빙함",
  projectSlug: "evidence-vault",
  description: "증빙 자료를 안전하게 저장하고 관리하는 서비스",
  version: "1.0.0",
  demoUrl: "https://bloombouquet.https.gsmsv.site/apps/evidence-vault/",
  repositoryUrl: "https://github.com/BloomBouquet/evidence-vault",
  requiresAuth: true,
  authRedirectUri: "https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/callback",
});

assert.equal(buildBloomBouquetRegistrationUrl({
  teamId: "rose",
  teamName: "장미",
  projectName: "No preview",
  projectSlug: "no-preview",
  description: "preview가 없는 프로젝트",
  repositoryFullName: "BloomBouquet/no-preview",
  demoUrl: null,
  requiresAuth: false,
}), null);

assert.throws(() => buildBloomBouquetRegistrationUrl({
  teamId: "unknown" as "lily",
  teamName: "알 수 없음",
  projectName: "Invalid team",
  projectSlug: "invalid-team",
  description: "잘못된 팀",
  repositoryFullName: "BloomBouquet/invalid-team",
  demoUrl: "https://example.com/",
  requiresAuth: false,
}), /지원하지 않는 Luna 팀/);

console.log("bloomBouquetRegistration policy OK");
