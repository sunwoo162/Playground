const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
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

test('production builder wires the compiled local agent runner', () => {
  const ecosystem = fs.readFileSync(path.join(ROOT, 'ecosystem.config.js'), 'utf8');
  const deploy = fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-bloom-worker.yml'), 'utf8');
  const tsconfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'bloom-runtime/tsconfig.worker.json'), 'utf8'));

  assert.match(
    ecosystem,
    /BLOOM_LOCAL_AGENT_RUNNER_PATH:\s*sharedEnv\.BLOOM_LOCAL_AGENT_RUNNER_PATH\s*\|\|\s*path\.join\(root,\s*['"]\.tmp\/bloom-worker\/bloomLocalAgentRuntime\.js['"]\)/,
  );
  assert.match(
    deploy,
    /set_env_value BLOOM_LOCAL_AGENT_RUNNER_PATH \/home\/ubuntu\/bloombouquet\/\.tmp\/bloom-worker\/bloomLocalAgentRuntime\.js/,
  );
  assert.match(
    deploy,
    /test -f \/home\/ubuntu\/bloombouquet\/\.tmp\/bloom-worker\/bloomLocalAgentRuntime\.js/,
  );
  assert.ok(
    tsconfig.include.includes('ts/bloomLocalAgentRuntime.ts'),
    'bloom-runtime/tsconfig.worker.json must compile ts/bloomLocalAgentRuntime.ts for production builder mode',
  );
});

test('production builder forwards a bounded Agent wave limit into the headless executor', () => {
  const source = fs.readFileSync(path.join(ROOT, 'bloom-worker/run.js'), 'utf8');
  const deploy = fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-bloom-worker.yml'), 'utf8');

  assert.match(source, /BLOOM_BUILDER_MAX_PARALLEL_TASKS/);
  assert.match(source, /createObservedHeadlessBuilderExecutor\(\{[\s\S]*maxParallelTasks/);
  assert.match(deploy, /set_env_value BLOOM_BUILDER_MAX_PARALLEL_TASKS 2/);
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

test('builder drain state blocks new claim cycles and clears busy evidence after execution', async () => {
  const drainModulePath = path.join(ROOT, 'bloom-worker/builder-drain-state.js');
  assert.equal(fs.existsSync(drainModulePath), true, 'builder drain state module must exist');

  const { createBuilderDrainState } = require(drainModulePath);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bloom-builder-drain-'));
  const drainFile = path.join(tempRoot, 'drain');
  const busyFile = path.join(tempRoot, 'busy');
  const state = createBuilderDrainState({ drainFile, busyFile });

  assert.equal(await state.isDraining(), false);
  fs.writeFileSync(drainFile, 'deploy\n');
  assert.equal(await state.isDraining(), true);

  fs.rmSync(drainFile);
  await state.withBusy(async () => assert.equal(fs.existsSync(busyFile), true));
  assert.equal(fs.existsSync(busyFile), false);
  await assert.rejects(state.withBusy(async () => { throw new Error('boom'); }), /boom/);
  assert.equal(fs.existsSync(busyFile), false);

  const source = fs.readFileSync(path.join(ROOT, 'bloom-worker/run.js'), 'utf8');
  assert.match(source, /createBuilderDrainState/);
  assert.match(source, /await drainState\.isDraining\(\)/);
  assert.match(source, /await drainState\.withBusy\(/);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
