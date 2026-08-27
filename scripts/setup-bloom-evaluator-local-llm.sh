#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${HOME}/.local/bin"
LLAMA_INSTALLER_COMMIT="4ee224e8b16ad6c48be85609e74dd8b1e8d740ae"
LLAMA_INSTALLER_URL="https://raw.githubusercontent.com/ggml-org/llama-install.sh/${LLAMA_INSTALLER_COMMIT}/install.sh"
mkdir -p "$BIN_DIR"
export PATH="$BIN_DIR:${HOME}/.llama/bin:$PATH"

if ! command -v curl >/dev/null 2>&1; then
  echo "[bloom-evaluator-local] curl is required" >&2
  exit 1
fi

if ! command -v llama >/dev/null 2>&1; then
  echo "[bloom-evaluator-local] installing llama.cpp launcher from pinned installer ${LLAMA_INSTALLER_COMMIT}"
  INSTALLER_PATH="$(mktemp)"
  trap 'rm -f "$INSTALLER_PATH"' EXIT
  curl --fail --show-error --silent --location "$LLAMA_INSTALLER_URL" --output "$INSTALLER_PATH"
  sh "$INSTALLER_PATH"
  rm -f "$INSTALLER_PATH"
  trap - EXIT
  hash -r
fi

LLAMA_BIN="$(command -v llama || true)"
if [[ -z "$LLAMA_BIN" ]]; then
  echo "[bloom-evaluator-local] llama install completed but executable is not on PATH" >&2
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[bloom-evaluator-local] pm2 is required" >&2
  exit 1
fi

chmod +x "$ROOT_DIR/bloom-worker/start-local-evaluator-llm.sh"

pm2 delete bloom-evaluator-llm >/dev/null 2>&1 || true
BLOOM_LLAMA_BIN="$LLAMA_BIN" pm2 start "$ROOT_DIR/bloom-worker/start-local-evaluator-llm.sh" \
  --name bloom-evaluator-llm \
  --interpreter bash \
  --max-memory-restart 2600M

HEALTH_URL="http://127.0.0.1:${BLOOM_LOCAL_EVALUATOR_PORT:-8091}/health"
echo "[bloom-evaluator-local] waiting for local model health"
for _ in $(seq 1 450); do
  if curl --fail --silent --show-error --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    pm2 save >/dev/null
    echo "[bloom-evaluator-local] local evaluator model ready"
    exit 0
  fi
  sleep 2
done

echo "[bloom-evaluator-local] local evaluator model did not become healthy within 15 minutes" >&2
pm2 status bloom-evaluator-llm || true
exit 1
