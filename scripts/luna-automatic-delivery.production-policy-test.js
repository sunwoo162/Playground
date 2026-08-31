const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function readWorkerDeployWorkflow() {
  return fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-bloom-worker.yml'), 'utf8');
}

function readWorkerEntrypoint() {
  return fs.readFileSync(path.join(ROOT, 'bloom-worker/run.js'), 'utf8');
}

test('production provisions independent evaluator and builder workers', () => {
  const config = require(path.join(ROOT, 'ecosystem.config.js'));
  const evaluator = config.apps.find((app) => app.name === 'bloom-evaluator-worker');
  const builder = config.apps.find((app) => app.name === 'bloom-builder-worker');

  assert.ok(evaluator, 'production PM2 config must define bloom-evaluator-worker');
  assert.ok(builder, 'production PM2 config must define bloom-builder-worker');
  assert.equal(evaluator.env.BLOOM_WORKER_MODE, 'evaluator');
  assert.equal(builder.env.BLOOM_WORKER_MODE, 'builder');
  assert.notEqual(evaluator.env.BLOOM_WORKER_ID, builder.env.BLOOM_WORKER_ID);
});

test('worker deployment provisions the builder runtime bridge and verifies both modes', () => {
  const workflow = readWorkerDeployWorkflow();

  assert.match(workflow, /pnpm run build:bloom-runtime-bridge/);
  assert.match(workflow, /bloom-evaluator-worker/);
  assert.match(workflow, /bloom-builder-worker/);
  assert.match(workflow, /started mode=evaluator runtime=local workerId=/);
  assert.match(workflow, /started mode=builder workerId=/);
});

test('worker deployment installs native Linux dependencies before the release runtime build', () => {
  const workflow = readWorkerDeployWorkflow();
  const dependencyStep = workflow.indexOf('- name: Install Tauri Linux dependencies');
  const buildStep = workflow.indexOf('- name: Build headless runtime binary');

  assert.ok(dependencyStep >= 0, 'worker deployment must install the native GTK/WebKit build dependencies');
  assert.ok(buildStep >= 0, 'worker deployment must build the release runtime bridge');
  assert.ok(dependencyStep < buildStep, 'native Linux dependencies must be installed before cargo release build');
  assert.match(workflow, /libwebkit2gtk-4\.1-dev/);
  assert.match(workflow, /libayatana-appindicator3-dev/);
  assert.match(workflow, /librsvg2-dev/);
});

test('production builder bridge exposes authoritative release promotion', () => {
  const entrypoint = readWorkerEntrypoint();

  assert.match(entrypoint, /promoteRelease:\s*\(input\)\s*=>\s*call\(\{\s*command:\s*["']promoteRelease["']/);
});

test('production builder injects the integrated project delivery hook', () => {
  const entrypoint = readWorkerEntrypoint();
  const builderExecutor = entrypoint.match(/const execute = createObservedHeadlessBuilderExecutor\(\{[\s\S]*?\n\s*\}\);/)?.[0] ?? '';

  assert.match(
    entrypoint,
    /const deliverIntegratedProject = createLunaProductionDeliveryHook\(\{/,
    'production builder must construct the machine-owned Luna delivery hook',
  );
  assert.match(
    builderExecutor,
    /\bdeliverIntegratedProject\b\s*(?:,|:)/,
    'production builder must provide the machine-owned Luna delivery hook',
  );
});
