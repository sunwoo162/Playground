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

HEALTH_URL="http://127.0.0.1:${BLOOM_LOCAL_EVALUATOR_PORT:-8091}/health"
LLAMA_MAX_MEMORY_RESTART_MB=3800
LLAMA_MAX_MEMORY_RESTART_BYTES=$((LLAMA_MAX_MEMORY_RESTART_MB * 1024 * 1024))

current_llm_max_memory_restart_bytes() {
  pm2 jlist 2>/dev/null | node -e '
    const fs = require("fs");
    const apps = JSON.parse(fs.readFileSync(0, "utf8") || "[]");
    const app = apps.find((entry) => entry?.name === "bloom-evaluator-llm");
    const value = app?.pm2_env?.max_memory_restart;
    if (typeof value === "number" && Number.isFinite(value)) process.stdout.write(String(value));
    else if (typeof value === "string" && /^\d+$/.test(value)) process.stdout.write(value);
  ' 2>/dev/null || true
}

if pm2 describe bloom-evaluator-llm >/dev/null 2>&1 \
  && curl --fail --silent --show-error --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
  CURRENT_LLM_MAX_MEMORY_RESTART_BYTES="$(current_llm_max_memory_restart_bytes)"
  if [ "$CURRENT_LLM_MAX_MEMORY_RESTART_BYTES" = "$LLAMA_MAX_MEMORY_RESTART_BYTES" ]; then
    pm2 save >/dev/null
    echo "[bloom-evaluator-local] existing local evaluator model is healthy and configured; keeping it"
    exit 0
  fi
  echo "[bloom-evaluator-local] local evaluator PM2 memory guard drift detected; restarting with ${LLAMA_MAX_MEMORY_RESTART_MB}M"
fi

delete_stale_llm() {
  if ! pm2 describe bloom-evaluator-llm >/dev/null 2>&1; then
    return 0
  fi

  pm2 delete bloom-evaluator-llm >/dev/null 2>&1 &
  local delete_pid=$!
  for _ in $(seq 1 30); do
    if ! kill -0 "$delete_pid" 2>/dev/null; then
      wait "$delete_pid" || true
      delete_pid=""
      break
    fi
    sleep 1
  done

  if ! pm2 describe bloom-evaluator-llm >/dev/null 2>&1; then
    return 0
  fi

  local llm_pid
  llm_pid="$(pm2 pid bloom-evaluator-llm 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ "$llm_pid" =~ ^[0-9]+$ ]] && (( llm_pid > 0 )); then
    echo "[bloom-evaluator-local] forcing stale local evaluator process $llm_pid to stop"
    kill -KILL "$llm_pid" 2>/dev/null || true
  fi

  if [[ -n "$delete_pid" ]]; then
    for _ in $(seq 1 10); do
      if ! kill -0 "$delete_pid" 2>/dev/null; then
        wait "$delete_pid" || true
        delete_pid=""
        break
      fi
      sleep 1
    done
  fi
  if [[ -n "$delete_pid" ]] && kill -0 "$delete_pid" 2>/dev/null; then
    kill -KILL "$delete_pid" 2>/dev/null || true
    wait "$delete_pid" || true
  fi

  if pm2 describe bloom-evaluator-llm >/dev/null 2>&1; then
    timeout --signal=KILL 10s pm2 delete bloom-evaluator-llm >/dev/null 2>&1 || true
  fi
  if pm2 describe bloom-evaluator-llm >/dev/null 2>&1; then
    echo "[bloom-evaluator-local] stale local evaluator process could not be removed within 50 seconds" >&2
    return 1
  fi
}

delete_stale_llm
BLOOM_LLAMA_BIN="$LLAMA_BIN" pm2 start "$ROOT_DIR/bloom-worker/start-local-evaluator-llm.sh" \
  --name bloom-evaluator-llm \
  --interpreter bash \
  --max-memory-restart "${LLAMA_MAX_MEMORY_RESTART_MB}M" \
  --kill-timeout 7200000

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
