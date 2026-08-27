# BloomBouquet Production Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy Playground public portal and hosted `/apps/*` products with BloomBouquet at `https://playground.https.gsmsv.site/` while preserving the existing server, backend, database, Bloom runtime, and shared 꽃다발 SSO.

**Architecture:** `bloom-web` becomes the only root web source and builds directly into `dist/`; Express continues to serve `dist/` and proxy backend APIs. All legacy hosted app directories except `apps/desktop` are deleted, `/apps/*` static routes are removed, and CI/deployment are simplified to verify the BloomBouquet root shell plus the retained runtime/backend stack.

**Tech Stack:** React 19, TypeScript, Vite 6, Express, Spring Boot 3/Java 17, MySQL, pnpm 10.33, GitHub Actions, PM2, Nginx.

**Spec:** `docs/superpowers/specs/2026-08-27-bloom-bouquet-production-cutover-design.md`

## Global Constraints

- Production hostname remains `https://playground.https.gsmsv.site/`.
- Server location and PM2/Nginx topology remain unchanged.
- Shared 꽃다발 authentication remains the only authentication contract for auth-required published projects.
- Preserve `backend/`, `bloom-web/`, `bloom-runtime/`, `bloom-worker/`, `apps/desktop/`, `server/`, and production process configuration.
- Delete `playground-web/` and every top-level `apps/*` product except `apps/desktop`.
- Do not perform destructive database migration in this cutover.
- Commit messages are English.

---

### Task 1: Replace legacy Harness invariants with BloomBouquet cutover invariants

**Files:**
- Modify: `scripts/harness-check.js`
- Modify: `.github/workflows/harness.yml`

**Interfaces:**
- Consumes: root repository filesystem, `package.json`, `server/index.js`, `bloom-web/index.html`.
- Produces: a deterministic `pnpm run harness` gate that rejects reintroduction of the old Playground portal/apps and verifies the BloomBouquet root build contract.

- [ ] **Step 1: Rewrite `scripts/harness-check.js` to assert the new product boundary**

The script must fail unless all of the following hold:

```js
assert(!exists('playground-web'), 'legacy playground-web must be removed');
assert(appDirectories.every((name) => name === 'desktop'), 'only apps/desktop may remain');
assert(pkg.scripts['build:bloom-web'].includes('--outDir ../dist'), 'BloomBouquet must build to root dist');
assert(!pkg.scripts['build:apps'], 'legacy build:apps must be removed');
assert(!serverSource.includes("'/apps/"), 'legacy /apps routes must be removed');
assert(bloomIndex.includes('<title>BloomBouquet</title>'), 'BloomBouquet title must identify root shell');
```

- [ ] **Step 2: Update `.github/workflows/harness.yml`**

Remove `Build deployed playground web`; keep Bloom web, backend tests, desktop build, Bloom policy tests, worker build, Rust checks, and final invariants. Rename the Bloom web step to `Build BloomBouquet root web`.

- [ ] **Step 3: Commit the Harness contract**

```bash
git add scripts/harness-check.js .github/workflows/harness.yml
git commit -m "test: define BloomBouquet production cutover invariants"
```

Expected before Tasks 2-3: Harness fails because legacy source/routes/build scripts still exist.

### Task 2: Cut the root build and Express serving contract over to BloomBouquet

**Files:**
- Modify: `package.json`
- Modify: `bloom-web/vite.config.ts`
- Modify: `bloom-web/index.html`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: existing BloomBouquet React app and existing Node API/proxy routes.
- Produces: `pnpm run build:bloom-web` → `dist/index.html`, root-relative assets, and Express root SPA serving with no `/apps/*` product mounts.

- [ ] **Step 1: Simplify root scripts**

Set the relevant scripts to:

```json
{
  "dev": "concurrently \"pnpm run dev:server\" \"pnpm run dev:bloom-web\"",
  "dev:server": "node server/index.js",
  "dev:client": "pnpm run dev:bloom-web",
  "dev:bloom-web": "vite bloom-web",
  "build": "pnpm run build:bloom-web",
  "build:bloom-web": "pnpm exec tsc -p bloom-web/tsconfig.json --noEmit && vite build bloom-web --outDir ../dist --emptyOutDir",
  "build:web": "pnpm run build:bloom-web",
  "build:all": "pnpm run build:bloom-web",
  "verify": "pnpm run build:bloom-web && pnpm run harness"
}
```

Keep Bloom runtime/worker/bridge/start scripts and install scripts. Remove `dev:playground-web`, `build:playground-web`, and `build:apps`.

- [ ] **Step 2: Force BloomBouquet Vite assets to root**

Add `base: '/'` to `bloom-web/vite.config.ts` so the production merge cannot inherit the historical `/bloom/` asset base.

- [ ] **Step 3: Rename the public shell metadata**

Use `<title>BloomBouquet</title>` and update the description to identify the project gallery, 꽃다발 SSO, and senior-Agent evaluation product instead of the old autonomous builder.

- [ ] **Step 4: Remove all legacy `/apps/*` middleware and static routes from `server/index.js`**

Keep API/auth/proxy handlers intact. Keep only:

```js
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});
```

for the public static/SPA section.

- [ ] **Step 5: Build and inspect**

Run:

```bash
pnpm run build:bloom-web
test -f dist/index.html
grep -q '<title>BloomBouquet</title>' dist/index.html
```

Expected: PASS.

- [ ] **Step 6: Commit root cutover**

```bash
git add package.json bloom-web/vite.config.ts bloom-web/index.html server/index.js
git commit -m "feat: serve BloomBouquet as the public root"
```

### Task 3: Delete legacy Playground products and reset product documentation

**Files:**
- Delete: `playground-web/**`
- Delete: every top-level `apps/*/**` except `apps/desktop/**`
- Modify: `docs/app-registry.json`
- Modify: `docs/PRODUCT_REDEFINITION_2026-08-06.md`
- Modify: `docs/HARNESS_ENGINEERING.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: current repository tree.
- Produces: one active public web product (`bloom-web`) plus retained runtime desktop tooling (`apps/desktop`).

- [ ] **Step 1: Delete the legacy source tree**

Derive the current direct children of `apps/` and remove every child except `desktop`; remove `playground-web/` in the same deletion commit. Do not delete `apps/desktop`, `bloom-runtime`, or `bloom-worker`.

- [ ] **Step 2: Reset the app registry to the new baseline**

`docs/app-registry.json` must no longer advertise any removed `/apps/*` product. Record BloomBouquet as the active public product and `apps/desktop` as retained internal tooling.

- [ ] **Step 3: Update product/harness docs and README**

Remove instructions that describe the old Playground portal or legacy `/apps/<id>` deployment model. Document the root BloomBouquet URL, shared 꽃다발 SSO, versioned evaluation reports, and retained runtime tooling.

- [ ] **Step 4: Run the new invariant test**

```bash
pnpm run harness
```

Expected: PASS after Task 2 and all deletions.

- [ ] **Step 5: Commit deletion**

```bash
git add -A
git commit -m "refactor: remove legacy Playground products"
```

### Task 4: Simplify production deployment and add a root smoke check

**Files:**
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `pnpm run build:bloom-web`, existing SSH secrets, PM2 `playground` process, backend process, Nginx.
- Produces: deployment that builds only BloomBouquet for the root and refuses success unless the local production HTTP shell identifies BloomBouquet.

- [ ] **Step 1: Use the current `main` deployment safety behavior as the baseline**

Preserve root `.env` loading, backend `.env.backend` override, backend recovery when the process is down, `--update-env`, PID verification, `pm2 save`, and Nginx reload.

- [ ] **Step 2: Replace legacy frontend build commands**

The CI build step becomes:

```bash
pnpm run build:bloom-web
test -f dist/index.html
grep -q '<title>BloomBouquet</title>' dist/index.html
```

The server SSH build section uses the same commands and removes all legacy per-app builds/assertions.

- [ ] **Step 3: Add post-restart local smoke verification**

After starting the Node process, retry the local root request before continuing:

```bash
for attempt in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:3000/ | grep -q '<title>BloomBouquet</title>'; then
    ROOT_OK=true
    break
  fi
  sleep 2
done
[ "${ROOT_OK:-false}" = "true" ] || record_failure "BloomBouquet root smoke check failed"
```

- [ ] **Step 4: Commit deployment cutover**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: deploy BloomBouquet as the Playground root"
```

### Task 5: Full verification, PR, main deployment, and live check

**Files:**
- No new implementation files unless verification reveals a defect.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: verified production cutover.

- [ ] **Step 1: Run repository verification**

```bash
pnpm install --frozen-lockfile
pnpm run build:bloom-web
bash backend/gradlew -p backend test --no-daemon
pnpm --dir apps/desktop run build
pnpm run test:bloom-runtime
pnpm run build:bloom-worker
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo check --manifest-path bloom-runtime/Cargo.toml
pnpm run harness
```

Expected: all PASS.

- [ ] **Step 2: Open the production cutover PR using the repository PR template**

Title:

```text
feat : BloomBouquet 공개 서비스 전환
```

Base: `main`.

- [ ] **Step 3: Wait for the PR Harness and fix any failure on the same branch**

Expected: all Harness steps PASS.

- [ ] **Step 4: Merge to `main` only after Harness PASS**

Use expected head SHA to avoid merging a moved branch.

- [ ] **Step 5: Verify Deploy to Server**

Expected: build/deploy workflow succeeds, PM2 `playground` restarts, backend remains/restarts correctly, root smoke check succeeds.

- [ ] **Step 6: Verify the public domain**

Request `https://playground.https.gsmsv.site/` and confirm the returned shell is BloomBouquet, not the legacy Playground portal.
