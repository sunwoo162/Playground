const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('Bloom worker defaults to evaluator mode and requires explicit builder opt-in', () => {
  const { resolveBloomWorkerMode } = require('./runtime-mode.js');

  assert.equal(resolveBloomWorkerMode(undefined), 'evaluator');
  assert.equal(resolveBloomWorkerMode(''), 'evaluator');
  assert.equal(resolveBloomWorkerMode(' evaluator '), 'evaluator');
  assert.equal(resolveBloomWorkerMode('builder'), 'builder');
  assert.throws(
    () => resolveBloomWorkerMode('writer'),
    /BLOOM_WORKER_MODE/,
  );
});

test('Bloom worker entrypoint wires evaluator runtime and gates builder behind mode', () => {
  const source = fs.readFileSync(path.join(ROOT, 'bloom-worker/run.js'), 'utf8');

  assert.match(source, /createBloomBouquetEvaluatorHttpClient/);
  assert.match(source, /runBloomBouquetEvaluatorOnce/);
  assert.doesNotMatch(source, /createCodexSeniorEvaluatorRunner/);
  assert.match(source, /createLocalSeniorEvaluatorRunner/);
  assert.match(source, /BLOOM_EVALUATOR_RUNTIME/);
  assert.match(source, /createLocalSeniorEvaluatorRunner\(\)/);
  assert.match(source, /resolveBloomWorkerMode/);
  assert.match(source, /mode === ['"]builder['"]/);
});

test('evaluator mode passes worker identity and heartbeat policy into the lease-aware cycle', () => {
  const source = fs.readFileSync(path.join(ROOT, 'bloom-worker/run.js'), 'utf8');

  assert.match(source, /runBloomBouquetEvaluatorOnce\(client,\s*workerId,\s*runner,\s*\{[\s\S]*heartbeatIntervalMs/);
  assert.match(source, /started mode=evaluator runtime=\$\{evaluatorRuntime\} workerId=\$\{workerId\}/);
});

test('production PM2 config explicitly pins Bloom worker to evaluator mode', () => {
  const ecosystem = fs.readFileSync(path.join(ROOT, 'ecosystem.config.js'), 'utf8');

  assert.match(ecosystem, /BLOOM_WORKER_MODE:\s*sharedEnv\.BLOOM_WORKER_MODE\s*\|\|\s*['"]evaluator['"]/);
});

test('Bloom worker compiler emits the Live E2E module required by the entrypoint', () => {
  const source = fs.readFileSync(path.join(ROOT, 'bloom-worker/run.js'), 'utf8');
  const tsconfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'bloom-runtime/tsconfig.worker.json'), 'utf8'));

  assert.match(source, /\.\.\/\.tmp\/bloom-worker\/e2eSmoke\.js/);
  assert.ok(
    tsconfig.include.includes('ts/e2eSmoke.ts'),
    'bloom-runtime/tsconfig.worker.json must compile ts/e2eSmoke.ts for bloom-worker/run.js',
  );
});
