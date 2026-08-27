# BloomBouquet Evaluator Production Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production Bloom worker deployment explicitly evaluator-only, remove Builder-only provisioning dependencies, and fail deployment unless PM2 actually starts the worker in evaluator mode.

**Architecture:** Keep the existing shared `bloom-worker/run.js` runtime modes, but make the production `Deploy Bloom Worker` workflow configure and verify only evaluator mode. The workflow must not build/copy the Rust Builder bridge or require GitHub CLI authentication, GitHub organization, workspace, or team settings when deploying the evaluator. Codex authentication remains required because the senior evaluator runner uses Codex app-server.

**Tech Stack:** GitHub Actions YAML, PM2, Node.js policy tests, Codex CLI

**Spec:** `docs/superpowers/specs/2026-08-27-bloombouquet-evaluator-worker-design.md`

## Global Constraints

- Production Bloom worker mode is `evaluator`.
- Builder-only GitHub/workspace/team/runtime-bridge settings are not evaluator startup requirements.
- Evaluator still requires `BUILDER_WORKER_TOKEN`, `BLOOM_API_BASE_URL`, worker identity, heartbeat/poll settings, and Codex authentication.
- Production startup must verify both a non-zero PM2 PID and the `started mode=evaluator` runtime signal.
- Secret values must not be printed to deployment logs.

---

### Task 1: Lock evaluator-only production deployment policy

**Files:**
- Modify: `scripts/production-runtime.policy-test.js`
- Test: `scripts/production-runtime.policy-test.js`

**Interfaces:**
- Consumes: `.github/workflows/deploy-bloom-worker.yml` as text.
- Produces: regression assertions for evaluator mode, Builder-dependency removal, and evaluator-mode startup verification.

- [ ] **Step 1: Write the failing policy test**

Add a `readBloomWorkerDeployWorkflow()` helper and assertions that the workflow:

```js
assert.match(workflow, /set_env_value BLOOM_WORKER_MODE evaluator/);
assert.doesNotMatch(workflow, /Build Bloom runtime bridge/);
assert.doesNotMatch(workflow, /Copy Bloom runtime bridge to server/);
assert.doesNotMatch(workflow, /gh auth status/);
assert.doesNotMatch(workflow, /BLOOM_GITHUB_ORGANIZATION is missing/);
assert.match(workflow, /started mode=evaluator workerId=/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:production-runtime`

Expected: FAIL because the current workflow still builds/copies the Builder bridge, checks GitHub CLI auth, and does not force/verify evaluator mode.

- [ ] **Step 3: Commit the RED test**

```bash
git add scripts/production-runtime.policy-test.js
git commit -m "test: require evaluator-only production worker"
```

---

### Task 2: Make Deploy Bloom Worker evaluator-only

**Files:**
- Modify: `.github/workflows/deploy-bloom-worker.yml`
- Test: `scripts/production-runtime.policy-test.js`

**Interfaces:**
- Consumes: `BLOOM_WORKER_MODE=evaluator`, existing PM2 `bloom-worker` app, Codex CLI authentication.
- Produces: production deployment that starts only evaluator responsibilities and validates its runtime mode.

- [ ] **Step 1: Remove Builder-only build/provisioning work**

Delete Rust setup, Linux runtime dependencies, runtime bridge build/copy steps, Builder workspace creation, GitHub organization/team defaults, GitHub CLI installation/authentication, and Builder-only required-config checks from the evaluator production workflow.

- [ ] **Step 2: Force evaluator mode in the server `.env`**

Add a controlled helper:

```sh
set_env_value() {
  KEY="$1"
  VALUE="$2"
  FILE=/home/ubuntu/playground/.env
  if grep -q "^${KEY}=" "$FILE"; then
    sed -i "s|^${KEY}=.*$|${KEY}=${VALUE}|" "$FILE"
  else
    printf '%s=%s\n' "$KEY" "$VALUE" >> "$FILE"
  fi
}

set_env_value BLOOM_WORKER_MODE evaluator
```

Keep evaluator defaults for API base URL and worker ID. Do not print the worker token.

- [ ] **Step 3: Keep only evaluator-required preflight**

Require `BUILDER_WORKER_TOKEN` and Codex CLI installation/login. Do not require `gh auth status`, Builder GitHub organization, workspace, team, or runtime bridge.

- [ ] **Step 4: Verify PM2 started in evaluator mode**

After PM2 start and PID validation, inspect recent worker logs without printing them:

```sh
if ! pm2 logs bloom-worker --lines 30 --nostream 2>/dev/null | grep -Fq 'started mode=evaluator workerId='; then
  echo "Bloom evaluator worker did not report evaluator mode"
  pm2 status bloom-worker || true
  exit 1
fi
```

- [ ] **Step 5: Run production policy tests**

Run: `pnpm run test:production-runtime`

Expected: PASS.

- [ ] **Step 6: Run full Harness**

Run through GitHub Actions Harness and require all stages PASS before merge.

- [ ] **Step 7: Commit implementation**

```bash
git add .github/workflows/deploy-bloom-worker.yml
git commit -m "fix: isolate evaluator production deployment"
```

---

### Task 3: PR, merge, and production verification

**Files:**
- No additional product files unless verification reveals a regression.

**Interfaces:**
- Consumes: green Harness and deploy workflow.
- Produces: merged production workflow and a successful `Deploy Bloom Worker` run whose final gate verifies evaluator mode.

- [ ] **Step 1: Review the branch diff for secret leakage and Builder/evaluator responsibility mixing**
- [ ] **Step 2: Open PR using the repository PR template/order**
- [ ] **Step 3: Require Harness PASS**
- [ ] **Step 4: Merge to `main`**
- [ ] **Step 5: Verify `Deploy to Server` and the subsequent `Deploy Bloom Worker` production run both succeed**
