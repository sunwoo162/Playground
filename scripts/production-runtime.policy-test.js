const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function readDeployWorkflow() {
  return fs.readFileSync(path.join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
}

test('backend uses the shared JWT secret even when backend env contains a stale override', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloombouquet-ecosystem-'));
  const copiedConfig = path.join(tempDir, 'ecosystem.config.cjs');
  const sharedSecret = 'shared-production-jwt-secret-0123456789abcdef';

  try {
    fs.copyFileSync(path.join(ROOT, 'ecosystem.config.js'), copiedConfig);
    fs.writeFileSync(path.join(tempDir, '.env'), `JWT_SECRET=${sharedSecret}\nBUILDER_WORKER_TOKEN=worker-token\n`);
    fs.writeFileSync(path.join(tempDir, '.env.backend'), 'JWT_SECRET=stale-short-secret\nGITHUB_CLIENT_ID=test-client\n');

    delete require.cache[copiedConfig];
    const config = require(copiedConfig);
    const backend = config.apps.find((app) => app.name === 'backend');

    assert.ok(backend, 'backend PM2 app must exist');
    assert.equal(backend.env.JWT_SECRET, sharedSecret);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('production diagnostics never print PM2 environment details', () => {
  const workflow = readDeployWorkflow();
  assert.doesNotMatch(workflow, /^\s*pm2 describe backend \|\| true\s*$/m);
});

test('PM2 ecosystem config changes trigger a backend restart', () => {
  const workflow = readDeployWorkflow();
  const detectionBlock = workflow.match(/- name: Detect backend changes[\s\S]*?- name: Set up JDK 17/)?.[0] ?? '';
  assert.ok(detectionBlock.includes('ecosystem\\.config\\.js'), 'backend change detection must include ecosystem.config.js');
});

test('production deploy repairs an invalid shared JWT secret before PM2 startup', () => {
  const workflow = readDeployWorkflow();
  assert.match(workflow, /ensure_shared_jwt_secret\(\)/);
  assert.match(workflow, /randomBytes\(48\)/);
  assert.match(workflow, /playground-jwt-secret-2024/);
  assert.match(workflow, /SHARED_JWT_SECRET="\$JWT_SECRET"/);
});

test('backend-specific env cannot override the shared JWT secret at PM2 startup', () => {
  const workflow = readDeployWorkflow();
  const backendBlock = workflow.match(/if \[ "\$BACKEND_CHANGED"[\s\S]*?pm2 start ecosystem\.config\.js --only backend/)?.[0] ?? '';
  assert.match(backendBlock, /\. \/home\/ubuntu\/playground\/\.env\.backend/);
  assert.match(backendBlock, /export JWT_SECRET="\$SHARED_JWT_SECRET"/);
});
