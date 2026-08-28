# Beriday BloomBouquet Subpath Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve Beriday at `https://bloombouquet.https.gsmsv.site/apps/beriday/` as an isolated BloomBouquet child app.

**Architecture:** Beriday builds with Vite base `/apps/beriday/` and resolves runtime data below that base. Playground deploys Beriday to a dedicated PM2 static server on port 3012 and Nginx proxies the fixed `/apps/beriday/` path to it while preserving all existing BloomBouquet routes.

**Tech Stack:** React, Vite, TypeScript, Vitest, Node.js 22, PM2, Nginx, GitHub Actions, SSH.

**Spec:** `docs/superpowers/specs/2026-08-28-beriday-bloombouquet-subpath-design.md`

## Global Constraints
- Public path is exactly `/apps/beriday/`.
- Beriday upstream port is exactly `3012`.
- Existing BloomBouquet root `3000` and Evidence Vault `3011` mappings remain unchanged.
- Runtime data remains fail-closed and shard paths remain manifest-owned.
- Deployment workflows are manual-only unless an existing repository workflow already intentionally deploys on main push.
- Git commits use English messages.

---

### Task 1: Make Beriday subpath-safe

**Files:**
- Modify: `BloomBouquet/beriday/vite.config.ts`
- Modify: `BloomBouquet/beriday/src/data/runtime/officialRuntimeLoader.ts`
- Modify: `BloomBouquet/beriday/tests/ui/OfficialRuntimeLoader.test.ts`
- Create: `BloomBouquet/beriday/tests/unit/subpathBuildContract.test.mjs`

**Interfaces:**
- Consumes: Vite `base`, existing `createOfficialRuntimeLoader()`.
- Produces: production asset URLs and runtime manifest URL rooted at `/apps/beriday/`.

- [ ] **Step 1: Write failing tests**
  - Assert production Vite config contains `base: '/apps/beriday/'`.
  - Assert the default runtime manifest URL derives from the app base and is not hard-coded to `/data/runtime/manifest.json`.
  - Keep explicit `manifestUrl` overrides working in loader unit tests.
- [ ] **Step 2: Verify RED**
  - Run `npm run test:domain` and `npm test` on the branch; expect only the new subpath contract assertions to fail.
- [ ] **Step 3: Implement minimal changes**
  - Set Vite base to `/apps/beriday/`.
  - Build the default manifest URL from `import.meta.env.BASE_URL` plus `data/runtime/manifest.json` without changing explicit override behavior.
- [ ] **Step 4: Verify GREEN**
  - Run production data verification, runtime data verification, domain/UI tests, typecheck, and production build.
  - Inspect `dist/index.html` and confirm generated JS/CSS URLs start with `/apps/beriday/`.
- [ ] **Step 5: Commit**
  - Commit message: `feat: support BloomBouquet subpath deployment`.

### Task 2: Add fixed Beriday gateway mapping and policy coverage

**Files:**
- Modify: `sunwoo162/Playground/deploy/nginx/bloombouquet.conf`
- Modify: `sunwoo162/Playground/scripts/bloombouquet-app-gateway.policy-test.js`

**Interfaces:**
- Consumes: local upstream `http://127.0.0.1:3012/`.
- Produces: public `/apps/beriday/` route.

- [ ] **Step 1: Write failing policy assertions**
  - Require exact redirect `/apps/beriday` -> `/apps/beriday/`.
  - Require `location ^~ /apps/beriday/` and `proxy_pass http://127.0.0.1:3012/;`.
  - Require exactly three fixed `X-Forwarded-Proto https` headers after adding Beriday.
- [ ] **Step 2: Verify RED**
  - Run `node --test scripts/bloombouquet-app-gateway.policy-test.js`; expect Beriday mapping assertions to fail.
- [ ] **Step 3: Implement Nginx mapping**
  - Add the redirect and fixed proxy block before the root location.
  - Preserve root and Evidence Vault blocks byte-for-byte except where the policy count necessarily changes.
- [ ] **Step 4: Verify GREEN**
  - Re-run the gateway policy test.
- [ ] **Step 5: Commit**
  - Commit message: `feat: route Beriday through BloomBouquet gateway`.

### Task 3: Add manual Beriday app deployment workflow

**Files:**
- Create: `sunwoo162/Playground/.github/workflows/deploy-beriday.yml`
- Modify: `sunwoo162/Playground/scripts/bloombouquet-app-gateway.policy-test.js`

**Interfaces:**
- Consumes: existing `SSH_PASSWORD`, GitHub public repository `BloomBouquet/beriday`, PM2.
- Produces: local Beriday service on port 3012.

- [ ] **Step 1: Write failing workflow policy assertions**
  - Require `workflow_dispatch` and reject `push`/`pull_request` triggers.
  - Require repository directory `/home/ubuntu/bloombouquet/apps/beriday`.
  - Require `git reset --hard origin/main`, `npm ci`, `npm run build`, `pm2 serve dist 3012 --spa --name beriday`, and local root/manifest smoke checks.
- [ ] **Step 2: Verify RED**
  - Run the policy test; expect missing workflow assertions to fail.
- [ ] **Step 3: Implement workflow**
  - SSH to the current BloomBouquet server.
  - Clone the repository when absent; otherwise fetch/reset to `origin/main`.
  - Build into a temporary release directory first, then replace the deployed working tree only after build success.
  - Restart only `beriday`, validate PM2 PID, root HTML, and runtime manifest, then `pm2 save`.
- [ ] **Step 4: Verify GREEN**
  - Re-run policy tests and Playground repository verification relevant to workflows/config.
- [ ] **Step 5: Commit**
  - Commit message: `feat: add Beriday server deployment workflow`.

### Task 4: Extend gateway deployment health gates

**Files:**
- Modify: `sunwoo162/Playground/.github/workflows/deploy-bloombouquet-app-gateway.yml`
- Modify: `sunwoo162/Playground/scripts/bloombouquet-app-gateway.policy-test.js`

**Interfaces:**
- Consumes: local port 3012 and public `/apps/beriday/`.
- Produces: rollback-protected gateway activation only when all child apps are ready.

- [ ] **Step 1: Write failing assertions**
  - Require local Beriday root and manifest probes.
  - Require public Beriday root and manifest probes.
- [ ] **Step 2: Verify RED**
  - Run gateway policy test and confirm only new health assertions fail.
- [ ] **Step 3: Implement probes**
  - Add local/public Beriday URLs to existing probe functions.
  - Keep the current backup, `nginx -t`, reload, and rollback trap unchanged.
- [ ] **Step 4: Verify GREEN**
  - Run policy test and any Playground harness/CI that includes deployment policy checks.
- [ ] **Step 5: Commit**
  - Commit message: `test: require Beriday gateway health checks`.

### Task 5: PR, merge, deploy, and public verification

**Files:**
- No new source files.

**Interfaces:**
- Consumes: merged Beriday main and merged Playground main.
- Produces: verified public deployment.

- [ ] **Step 1: Open Beriday PR** using the repository PR template rules and require fresh CI success.
- [ ] **Step 2: Merge Beriday PR** only after the head SHA is unchanged and checks are green; verify fresh main CI.
- [ ] **Step 3: Open Playground PR** with the fixed PR title/body format and require fresh checks/policy tests.
- [ ] **Step 4: Merge Playground PR** only after checks are green; verify the main push deployment does not regress BloomBouquet root.
- [ ] **Step 5: Run the manual Beriday deployment workflow** and confirm port 3012 root/manifest readiness.
- [ ] **Step 6: Run the manual BloomBouquet gateway deploy workflow** in deploy mode and require Nginx validation plus rollback-protected public checks.
- [ ] **Step 7: Verify public routes**
  - `https://bloombouquet.https.gsmsv.site/` remains BloomBouquet.
  - `https://bloombouquet.https.gsmsv.site/apps/evidence-vault/` remains reachable.
  - `https://bloombouquet.https.gsmsv.site/apps/beriday/` returns Beriday.
  - `https://bloombouquet.https.gsmsv.site/apps/beriday/data/runtime/manifest.json` returns runtime schema v1.
