const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function readDeployWorkflow() {
  return fs.readFileSync(path.join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
}

function readBloomWorkerDeployWorkflow() {
  return fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-bloom-worker.yml'), 'utf8');
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

test('JWT recovery or a failed backend health probe forces a backend restart', () => {
  const workflow = readDeployWorkflow();
  assert.match(workflow, /JWT_REGENERATED=false/);
  assert.match(workflow, /JWT_REGENERATED=true/);
  const backendCondition = workflow.match(/if \[ "\$BACKEND_CHANGED"[\s\S]*?; then/)?.[0] ?? '';
  assert.match(backendCondition, /\[ "\$JWT_REGENERATED" = "true" \]/);
  assert.match(backendCondition, /curl -fsS --max-time 3 http:\/\/127\.0\.0\.1:8080\/api\/bouquet\/auth\/me/);
});

test('backend cold-start smoke check allows at least 60 seconds', () => {
  const workflow = readDeployWorkflow();
  const smokeBlock = workflow.match(/ROOT_OK=false[\s\S]*?\n\s*done/)?.[0] ?? '';
  assert.match(smokeBlock, /for attempt in \$\(seq 1 30\); do/);
  assert.match(smokeBlock, /sleep 2/);
});

test('production backend validates schema and uses Flyway instead of Hibernate mutation', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloombouquet-flyway-'));
  const copiedConfig = path.join(tempDir, 'ecosystem.config.cjs');

  try {
    fs.copyFileSync(path.join(ROOT, 'ecosystem.config.js'), copiedConfig);
    fs.writeFileSync(path.join(tempDir, '.env'), 'JWT_SECRET=shared-production-jwt-secret-0123456789abcdef\n');
    fs.writeFileSync(path.join(tempDir, '.env.backend'), 'GITHUB_CLIENT_ID=test-client\nGITHUB_CLIENT_SECRET=test-secret\n');

    delete require.cache[copiedConfig];
    const config = require(copiedConfig);
    const backend = config.apps.find((app) => app.name === 'backend');
    assert.ok(backend, 'backend PM2 app must exist');
    assert.equal(backend.env.HIBERNATE_DDL_AUTO, 'validate');
    assert.equal(backend.env.FLYWAY_ENABLED, 'true');

    const applicationYaml = fs.readFileSync(path.join(ROOT, 'backend/src/main/resources/application.yml'), 'utf8');
    assert.match(applicationYaml, /ddl-auto:\s*\$\{HIBERNATE_DDL_AUTO:update\}/);
    assert.match(applicationYaml, /flyway:[\s\S]*enabled:\s*\$\{FLYWAY_ENABLED:false\}/);
    assert.match(applicationYaml, /baseline-on-migrate:\s*true/);
    assert.match(applicationYaml, /baseline-version:\s*1/);

    const buildGradle = fs.readFileSync(path.join(ROOT, 'backend/build.gradle'), 'utf8');
    assert.match(buildGradle, /org\.flywaydb:flyway-core/);
    assert.match(buildGradle, /org\.flywaydb:flyway-mysql/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('production secret files stay untracked and deploy diagnostics never dump them', () => {
  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);

  const workflow = readDeployWorkflow();
  assert.doesNotMatch(workflow, /\bprintenv\b/);
  assert.doesNotMatch(workflow, /\bpm2\s+env\b/);
  assert.doesNotMatch(workflow, /\bset\s+-x\b/);
  assert.doesNotMatch(workflow, /\bcat\s+[^\n]*\.env(?:\.backend)?\b/);
});

test('production Bloom worker is evaluator-only and verifies the started runtime mode', () => {
  const workflow = readBloomWorkerDeployWorkflow();

  assert.match(workflow, /set_env_value BLOOM_WORKER_MODE evaluator/);
  assert.doesNotMatch(workflow, /Build Bloom runtime bridge/);
  assert.doesNotMatch(workflow, /Copy Bloom runtime bridge to server/);
  assert.doesNotMatch(workflow, /gh auth status/);
  assert.doesNotMatch(workflow, /BLOOM_GITHUB_ORGANIZATION is missing/);
  assert.match(workflow, /started mode=evaluator runtime=local workerId=/);
});

test('production evaluator uses a local model runtime without interactive Codex authentication', () => {
  const workflow = readBloomWorkerDeployWorkflow();

  assert.match(workflow, /set_env_value BLOOM_EVALUATOR_RUNTIME local/);
  assert.match(workflow, /setup-bloom-evaluator-local-llm\.sh/);
  assert.match(workflow, /127\.0\.0\.1:8091\/health/);
  assert.doesNotMatch(workflow, /codex login status/);
  assert.match(workflow, /runtime=local/);
});
