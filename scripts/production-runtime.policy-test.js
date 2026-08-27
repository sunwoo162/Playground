const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
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

test('production JWT bootstrap replaces an invalid shared secret without printing it', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloombouquet-jwt-bootstrap-'));
  const envPath = path.join(tempDir, '.env');

  try {
    fs.writeFileSync(envPath, 'JWT_SECRET=playground-jwt-secret-2024\nPORT=3000\n');
    const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/ensure-production-jwt.js'), envPath], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const updated = fs.readFileSync(envPath, 'utf8');
    const secret = updated.match(/^JWT_SECRET=(.+)$/m)?.[1] ?? '';
    assert.ok(secret.length >= 32, 'generated JWT secret must be at least 32 characters');
    assert.ok(!secret.includes('playground-jwt-secret-2024'), 'default JWT secret must be replaced');
    assert.equal(updated.includes('PORT=3000'), true, 'other env entries must be preserved');
    assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false, 'JWT secret must never be printed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
