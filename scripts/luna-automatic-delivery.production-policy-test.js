const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function readWorkerDeployWorkflow() {
  return fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-bloom-worker.yml'), 'utf8');
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
