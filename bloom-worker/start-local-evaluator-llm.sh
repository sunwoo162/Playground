#!/usr/bin/env bash
set -euo pipefail

MODEL="${BLOOM_LOCAL_EVALUATOR_HF_MODEL:-Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF}"
QUANT="${BLOOM_LOCAL_EVALUATOR_QUANT:-Q4_K_M}"
HOST="${BLOOM_LOCAL_EVALUATOR_HOST:-127.0.0.1}"
PORT="${BLOOM_LOCAL_EVALUATOR_PORT:-8091}"
CONTEXT="${BLOOM_LOCAL_EVALUATOR_CONTEXT:-8192}"
THREADS="${BLOOM_LOCAL_EVALUATOR_THREADS:-3}"

LLAMA_BIN="${BLOOM_LLAMA_BIN:-$(command -v llama || true)}"
if [[ -z "$LLAMA_BIN" ]]; then
  echo "llama executable not found. Run scripts/setup-bloom-evaluator-local-llm.sh first." >&2
  exit 1
fi

exec "$LLAMA_BIN" serve \
  -hf "${MODEL}:${QUANT}" \
  --host "$HOST" \
  --port "$PORT" \
  -c "$CONTEXT" \
  -t "$THREADS" \
  -tb "$THREADS" \
  -np 1
