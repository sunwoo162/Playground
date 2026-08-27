const ALLOWED_MODES = new Set(['evaluator', 'builder']);

function resolveBloomWorkerMode(raw) {
  const mode = String(raw ?? '').trim().toLowerCase() || 'evaluator';
  if (!ALLOWED_MODES.has(mode)) {
    throw new Error(`BLOOM_WORKER_MODE는 evaluator 또는 builder여야 합니다: ${mode}`);
  }
  return mode;
}

module.exports = { resolveBloomWorkerMode };
