#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${HOME}/.local/bin"
mkdir -p "$BIN_DIR"

if ! command -v llama >/dev/null 2>&1; then
  echo "[bloom-local] installing llama.cpp launcher"
  curl -LsSf https://llama.app/install.sh | sh
fi

LLAMA_BIN="$(command -v llama || true)"
if [[ -z "$LLAMA_BIN" ]]; then
  echo "[bloom-local] llama install completed but executable is not on PATH" >&2
  exit 1
fi

cat > "$BIN_DIR/codex" <<EOF
#!/usr/bin/env bash
exec node "$ROOT_DIR/bloom-worker/local-codex-shim.js" "\$@"
EOF
chmod +x "$BIN_DIR/codex" "$ROOT_DIR/bloom-worker/start-local-llm.sh" "$ROOT_DIR/bloom-worker/local-codex-shim.js"

export PATH="$BIN_DIR:$PATH"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[bloom-local] pm2 is required by the current production worker deployment" >&2
  exit 1
fi

pm2 delete bloom-local-llm >/dev/null 2>&1 || true
BLOOM_LLAMA_BIN="$LLAMA_BIN" pm2 start "$ROOT_DIR/bloom-worker/start-local-llm.sh" \
  --name bloom-local-llm \
  --interpreter bash
pm2 save >/dev/null

HEALTH_URL="http://127.0.0.1:${BLOOM_LOCAL_LLM_PORT:-8091}/health"
echo "[bloom-local] waiting for model server: $HEALTH_URL"
for _ in $(seq 1 180); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "[bloom-local] local model is ready"
    echo "[bloom-local] engine: Qwen2.5-Coder-1.5B-Instruct Q4_K_M / llama.cpp / parallel=1"
    echo "[bloom-local] compatibility shim: $(command -v codex)"
    exit 0
  fi
  sleep 2
done

echo "[bloom-local] local model did not become healthy within 6 minutes" >&2
pm2 logs bloom-local-llm --lines 80 --nostream || true
exit 1
