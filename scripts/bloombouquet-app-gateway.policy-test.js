const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

test('public showcase is a launcher, not a login surface', () => {
  const source = fs.readFileSync('bloom-web/src/app/BouquetShowcaseApp.tsx', 'utf8');
  assert.doesNotMatch(source, /\?mode=auth/);
  assert.doesNotMatch(source, /꽃다발 로그인/);
  assert.doesNotMatch(source, /\?mode=manage/);
  assert.doesNotMatch(source, /target="_blank"/);
});

test('gateway uses only fixed BloomBouquet project mappings', () => {
  const nginx = fs.readFileSync('deploy/nginx/bloombouquet.conf', 'utf8');
  assert.match(nginx, /location = \/apps\/evidence-vault/);
  assert.match(nginx, /return 308 \/apps\/evidence-vault\//);
  assert.match(nginx, /location \^~ \/apps\/evidence-vault\//);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3011;/);
  assert.match(nginx, /location \/[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:3000;/);
});

test('gateway deployment is manual-only', () => {
  const workflow = fs.readFileSync('.github/workflows/deploy-bloombouquet-app-gateway.yml', 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:/);
  assert.doesNotMatch(workflow, /pull_request:/);
});
