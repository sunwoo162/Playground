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

function readLocalEvaluatorSetupScript() {
  return fs.readFileSync(path.join(ROOT, 'scripts/setup-bloom-evaluator-local-llm.sh'), 'utf8');
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
  assert.match(backendBlock, /\. \/home\/ubuntu\/bloombouquet\/\.env\.backend/);
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

test('Luna delivery registry production schema is managed by Flyway', () => {
  const migrationPath = path.join(
    ROOT,
    'backend/src/main/resources/db/migration/V4__luna_delivery_registry.sql',
  );
  assert.equal(fs.existsSync(migrationPath), true, 'Luna delivery registry requires a Flyway migration');

  const migration = fs.readFileSync(migrationPath, 'utf8');
  assert.match(migration, /CREATE TABLE luna_delivery_projects/i);
  assert.match(migration, /CREATE TABLE luna_delivery_runtimes/i);
  assert.match(migration, /UNIQUE[^\n]*slug|UNIQUE KEY[^\n]*slug/i);
  assert.match(migration, /FOREIGN KEY\s*\(project_id\)\s*REFERENCES\s+luna_delivery_projects\s*\(id\)/i);
  assert.match(migration, /idx_luna_delivery_project_state/i);
  assert.match(migration, /idx_luna_delivery_project_adoption/i);
});

test('production secret files stay untracked, private, and deploy diagnostics never dump them', () => {
  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);

  const workflow = readDeployWorkflow();
  assert.match(workflow, /chmod 600 "\$SHARED_ENV_FILE"/);
  assert.match(workflow, /chmod 600 "\$BACKEND_ENV_FILE"/);
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

test('production Bloom worker serializes remote provision runs before touching the checkout', () => {
  const workflow = readBloomWorkerDeployWorkflow();
  const lockFd = workflow.indexOf('exec 9>"$DEPLOY_LOCK_FILE"');
  const lockWait = workflow.indexOf('flock --wait 1800 9');
  const fetchMain = workflow.indexOf('git fetch origin main');

  assert.notEqual(lockFd, -1, 'remote provision must hold a server-side deployment lock');
  assert.notEqual(lockWait, -1, 'remote provision must wait for an earlier SSH deploy to finish');
  assert.notEqual(fetchMain, -1, 'remote provision must still refresh main');
  assert.ok(lockFd < fetchMain && lockWait < fetchMain, 'deployment lock must be acquired before touching the shared checkout');
});
test('production evaluator uses a local model runtime without interactive Codex authentication', () => {
  const workflow = readBloomWorkerDeployWorkflow();

  assert.match(workflow, /set_env_value BLOOM_EVALUATOR_RUNTIME local/);
  assert.match(workflow, /setup-bloom-evaluator-local-llm\.sh/);
  assert.match(workflow, /127\.0\.0\.1:8091\/health/);
  assert.doesNotMatch(workflow, /codex login status/);
  assert.match(workflow, /runtime=local/);
});

test('production local evaluator pins the llama installer to a reviewed upstream commit', () => {
  const setup = readLocalEvaluatorSetupScript();
  assert.match(setup, /4ee224e8b16ad6c48be85609e74dd8b1e8d740ae/);
  assert.match(setup, /raw\.githubusercontent\.com\/ggml-org\/llama-install\.sh\/\$\{LLAMA_INSTALLER_COMMIT\}\/install\.sh/);
  assert.doesNotMatch(setup, /https:\/\/llama\.app\/install\.sh/);
});

test('production deploy proves the local evaluator can complete a real JSON inference', () => {
  const workflow = readBloomWorkerDeployWorkflow();
  assert.match(workflow, /createLocalEvaluatorTransport/);
  assert.match(workflow, /production-inference-smoke/);
  assert.match(workflow, /Return exactly one JSON object with/);
  assert.match(workflow, /Bloom local evaluator inference smoke OK/);
  assert.match(workflow, /value\.ok !== true/);
});

test('production Bloom builder provisions GitHub CLI authentication from a protected deploy secret', () => {
  const workflow = readBloomWorkerDeployWorkflow();

  assert.match(workflow, /BLOOM_GITHUB_TOKEN:\s*\$\{\{\s*secrets\.BLOOM_GITHUB_TOKEN\s*\}\}/);
  assert.match(workflow, /envs:\s*BLOOM_GITHUB_TOKEN/);
  assert.match(workflow, /gh auth login --hostname github\.com --with-token/);
  assert.doesNotMatch(workflow, /--git-protocol/);
  assert.match(workflow, /gh auth setup-git/);
  assert.match(workflow, /GitHub CLI authentication is required for Bloom builder mode/);
});


test('production Bloom builder provisions a shared Luna delivery token before startup', () => {
  const workflow = readBloomWorkerDeployWorkflow();

  assert.match(workflow, /LUNA_DELIVERY_TOKEN/);
  assert.match(workflow, /openssl rand -hex 32/);
  assert.match(workflow, /grep -Eq '\^LUNA_DELIVERY_TOKEN=\.\+\$'/);
  assert.match(workflow, /pm2 reload ecosystem\.config\.js --only backend --update-env/);
});


test('production Bloom runtime bridge is built for the Ubuntu 22.04 server ABI and executed before worker startup', () => {
  const workflow = readBloomWorkerDeployWorkflow();

  assert.match(workflow, /runs-on:\s*ubuntu-22\.04/);
  assert.match(workflow, /Bloom Runtime bridge execution smoke OK/);
  assert.match(workflow, /bloom-runtime-bridge/);
});


test('production provisions the Luna apps root for shared durable runtime data', () => {
  const workflow = readBloomWorkerDeployWorkflow();

  assert.match(workflow, /\/srv\/bloombouquet\/apps/);
  assert.match(workflow, /bloombouquet/);
  assert.match(workflow, /2775/);
});

test('production provisions the Luna system service account before using shared runtime storage', () => {
  const workflow = readBloomWorkerDeployWorkflow();

  assert.match(workflow, /getent group bloombouquet/);
  assert.match(workflow, /groupadd --system bloombouquet/);
  assert.match(workflow, /id -u bloombouquet/);
  assert.match(workflow, /useradd --system --gid bloombouquet/);
});
