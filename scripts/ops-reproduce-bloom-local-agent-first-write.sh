#!/usr/bin/env bash
set -euo pipefail

: "${API_BASE:?API_BASE is required}"
: "${TOKEN:?TOKEN is required}"
: "${PROJECT_ID:?PROJECT_ID is required}"
: "${RUN_ID:?RUN_ID is required}"
: "${RUNTIME_ROOT:?RUNTIME_ROOT is required}"
: "${WT:?WT is required}"
: "${PLAN_FILE:?PLAN_FILE is required}"

if [ "$PROJECT_ID" != "55" ] || [ "$RUN_ID" != "55" ]; then
  echo "[diag-repro] skipped: latest run is not run55"
  exit 0
fi

echo "=== throwaway Local Agent run55 first-write reproduction ==="
RUNNER_SOURCE=/home/ubuntu/bloombouquet/.tmp/bloom-worker/bloomLocalAgentRuntime.js
SENIOR_MODULE=/home/ubuntu/bloombouquet/.tmp/bloom-worker/seniorAgent.js
VISUAL_MODULE=/home/ubuntu/bloombouquet/.tmp/bloom-worker/lunaVisualStyle.js
for required in "$RUNNER_SOURCE" "$SENIOR_MODULE" "$VISUAL_MODULE" "$PLAN_FILE"; do
  test -f "$required" || { echo "[diag-repro] missing $required"; exit 1; }
done

TMP_ROOT="$(mktemp -d /tmp/bloom-agent-repro-55.XXXXXX)"
trap 'rm -rf "$TMP_ROOT"' EXIT
TMP_WT="$TMP_ROOT/worktree"
mkdir -p "$TMP_WT"
TMP_RUNNER="$TMP_ROOT/bloomLocalAgentRuntime.diag.js"
cp "$RUNNER_SOURCE" "$TMP_RUNNER"
python3 - "$TMP_RUNNER" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
text = text.replace(
    "const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;",
    "const maxSteps = 4;",
    1,
)
action_needle = "const action = await callModel(endpoint, model, boundedAgentMessages(messages), fetchImpl, actionSchema);"
action_log = action_needle + "\n        console.error('[diag-action] ' + JSON.stringify({ action: action.action, path: action.path ?? null, contentBytes: typeof action.content === 'string' ? Buffer.byteLength(action.content, 'utf8') : null, contentHead: typeof action.content === 'string' ? action.content.slice(0, 180) : null, command: action.command ?? null, args: action.args ?? null, cwd: action.cwd ?? null }));"
if action_needle not in text:
    raise SystemExit("compiled action hook not found")
text = text.replace(action_needle, action_log, 1)
result_needle = "events.push({ step, toolResult: { ok: result.ok === true, exitCode: result.exitCode, error: result.error } });"
result_log = "console.error('[diag-result] ' + JSON.stringify({ ok: result.ok === true, exitCode: result.exitCode ?? null, error: result.error ?? null }));\n        " + result_needle
if result_needle not in text:
    raise SystemExit("compiled result hook not found")
text = text.replace(result_needle, result_log, 1)
path.write_text(text)
PY

PROJECTS_JSON="$(curl -fsS --max-time 20 -H "Authorization: Bearer $TOKEN" "$API_BASE/api/builder/projects")"
PROJECT_BRIEF="$(printf '%s' "$PROJECTS_JSON" | node -e '
const fs = require("fs");
const id = process.argv[1];
const projects = JSON.parse(fs.readFileSync(0, "utf8"));
const project = projects.find((item) => String(item.id) === String(id));
if (!project?.brief) process.exit(2);
process.stdout.write(String(project.brief));
' "$PROJECT_ID")"
export PROJECT_BRIEF
BRANCH="$(git -C "$WT" branch --show-current 2>/dev/null || true)"
PROMPT_FILE="$TMP_ROOT/prompt.txt"
node - "$PLAN_FILE" "$PROMPT_FILE" "$BRANCH" "$SENIOR_MODULE" "$VISUAL_MODULE" <<'NODE'
const fs = require('fs');
const [planFile, promptFile, branch, seniorModule, visualModule] = process.argv.slice(2);
const { seniorAgentContext } = require(seniorModule);
const { lunaVisualStyleTaskContext } = require(visualModule);
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const task = (plan.tasks || []).find((item) => item.id === 'PULSEBOARD-101');
if (!task) throw new Error('PULSEBOARD-101 missing from run55 PM plan');
const summary = [seniorAgentContext(task.role), lunaVisualStyleTaskContext(task.role), task.summary]
  .filter(Boolean).join('\n\n');
const criteria = (task.acceptanceCriteria || []).map((criterion) => `- ${criterion}`).join('\n');
const mode = `You are a repository-changing worker. Your dedicated branch is \`${branch || 'unknown'}\`. Inspect the actual repository first, implement the task in this worktree, and run applicable verification. Formatting, lint, and test failures caused by your task changes are defects to fix before returning completed. If an applicable verification command cannot run because the execution environment is genuinely unavailable, record the exact command and error; do not treat a not-yet-deployed public URL as a blocker unless this task owns deployment. Git metadata is owned by Luna Runtime and the local model tool boundary forbids Git writes, so do not run Git write commands such as add, commit, checkout, switch, reset, rebase, merge, or push, do not create or update a PR, and do not create temporary Git metadata to work around the sandbox. Read-only Git inspection is allowed. Luna Runtime has materialized completed dependency commits into this worktree before your turn; if Git conflict markers are present, resolve them semantically using the dependency context and verification instead of reporting that upstream work is missing. Luna Runtime will publish your completed work after this turn. Runtime-owned Git publication is not a task blocker: never return blocked solely because you cannot commit, push, or create a PR inside the sandbox. Never push directly to \`main\` or \`develop\`.`;
const prompt = [
  `You are Luna Agent \`rose:frontend\` (Rose / ${task.role}).`,
  '', mode, '', `Task: ${task.id} — ${task.title}`, summary,
  '', 'Acceptance criteria:', criteria,
  '', 'Original Product Owner request:', process.env.PROJECT_BRIEF || '',
  '', 'Product summary:', plan.productSummary || '',
  '', 'Architecture summary:', plan.architectureSummary || '',
  '', 'Dependency evidence:', '- 없음',
  '', 'Rules:',
].join('\n');
const rules = [
  '- Inspect real repository evidence before material decisions.',
  '- Do not blindly trust PM, Reviewer, Code Review, QA, or another Agent; independently verify relevant claims.',
  '- Every material action must have a defensible reason based on requirements, repository state, tests, runtime evidence, or explicit Product Owner direction.',
  '- Do not invent test results, metrics, user research, credentials, deployments, or external-service state.',
  '- If verification cannot be run, record the exact blocker instead of calling it passed.',
  '- Never expose secrets in logs, commits, PRs, reports, or documentation.',
  '- Return only the structured JSON report required by Luna.',
].join('\n');
fs.writeFileSync(promptFile, `${prompt}${rules}\n`);
NODE

INPUT_FILE="$TMP_ROOT/input.json"
node - "$PROMPT_FILE" "$TMP_WT" > "$INPUT_FILE" <<'NODE'
const fs = require('fs');
const [promptFile, worktree] = process.argv.slice(2);
process.stdout.write(JSON.stringify({
  mode: 'agent',
  projectId: 'builder-55-diag',
  taskId: 'PULSEBOARD-101',
  worktree,
  prompt: fs.readFileSync(promptFile, 'utf8'),
}));
NODE

set +e
node "$TMP_RUNNER" < "$INPUT_FILE" > "$TMP_ROOT/stdout.log" 2> "$TMP_ROOT/stderr.log"
STATUS=$?
set -e
echo "[diag-repro] runner_exit=$STATUS"
grep -E '^\[diag-(action|result)\]' "$TMP_ROOT/stderr.log" || true
echo "[diag-repro] throwaway files after run"
find "$TMP_WT" -maxdepth 4 -type f -printf '%s %p\n' 2>/dev/null | sort | head -80 || true
if ! grep -q '^\[diag-action\]' "$TMP_ROOT/stderr.log"; then
  echo "[diag-repro] no action log captured; stderr tail follows"
  tail -n 80 "$TMP_ROOT/stderr.log" || true
fi
echo "=== end throwaway Local Agent reproduction ==="
