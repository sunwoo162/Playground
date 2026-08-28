# BloomBouquet App Path Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BloomBouquet the single public project launcher at `bloombouquet.https.gsmsv.site`, host Evidence Vault at `/apps/evidence-vault/`, and keep shared Bouquet login initiated only from inside the project.

**Architecture:** Evidence Vault remains an independent Next.js service on loopback port `3011` but becomes path-aware through Next `basePath=/apps/evidence-vault`. The BloomBouquet VM Nginx gateway statically routes `/apps/evidence-vault/` to `127.0.0.1:3011` while `/` continues to `127.0.0.1:3000`; project-local cookies are path-scoped and the existing Bouquet OAuth provider stays at the BloomBouquet origin.

**Tech Stack:** React 19, Next.js 16.3.3, TypeScript, Vitest, PostgreSQL/Drizzle, Node 22, PM2, Nginx, Spring Boot, GitHub Actions, Bloom evaluator worker.

**Spec:** `docs/superpowers/specs/2026-08-28-bloombouquet-app-path-hosting-design.md`

## Global Constraints

- Public launcher origin is exactly `https://bloombouquet.https.gsmsv.site`.
- Evidence Vault public base path is exactly `/apps/evidence-vault` and loopback port remains `3011`.
- BloomBouquet main must not present visitor login or project-management actions.
- Bouquet login starts from inside Evidence Vault and callback is exactly `https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/callback`.
- Evidence Vault `ev_oauth_attempt` cookie path is `/apps/evidence-vault/auth/bouquet`; `ev_session` cookie path is `/apps/evidence-vault`.
- No iframe, arbitrary dynamic proxy destination, direct production DB mutation, or evaluator/internal worker endpoint exposure.
- Existing standalone `evidence-vault.https.gsmsv.site` remains until the path-hosted app, OAuth callback, project session, launcher link, and evaluation Run are proven.
- Existing `requiresAuth=true` Submission flow remains the only OAuth client bootstrap mechanism; use the returned `bouquetClientId`.
- Do not create a duplicate migration Submission if an exact new demo/callback Submission already exists.
- English Git commit messages; PR title/body follow the existing user-defined PR convention.

---

### Task 1: Finish BloomBouquet production server-path migration

**Files:**
- Existing PR: `sunwoo162/Playground#116`
- Existing modified files: `ecosystem.config.js`, `.github/workflows/deploy.yml`, `.github/workflows/deploy-bloom-worker.yml`, `scripts/bloombouquet-server-path.policy-test.js`, `scripts/production-runtime.policy-test.js`
- Server paths: `/home/ubuntu/bloombouquet`, legacy `/home/ubuntu/playground`

**Interfaces:**
- Consumes: PR #116 head `1d81ef5f2ab215158ef0d54c455cedc65df14e59`; production core processes already pre-cut over to `/home/ubuntu/bloombouquet`.
- Produces: `main` and all Bloom PM2 processes, including `bloom-evaluator-llm`, running from `/home/ubuntu/bloombouquet`; no active process references `/home/ubuntu/playground`.

- [ ] **Step 1: Re-verify the exact PR head is green**

Check the Harness for head `1d81ef5f2ab215158ef0d54c455cedc65df14e59`.

Expected: production policy, backend tests, web/worker builds, desktop, Rust/Tauri, Bloom runtime, and invariants all PASS.

- [ ] **Step 2: Update PR #116 with final evidence**

Record exactly:

```text
RED: legacy /home/ubuntu/playground path policy failed
GREEN: Harness #363 full PASS
Ops pre-cutover: playground/backend/bloom-worker paths=new, public postcheck=ok
Security: .env and .env.backend mode=600
```

- [ ] **Step 3: Mark PR #116 ready and merge with expected head SHA**

Expected: merge only if the head is still `1d81ef5f2ab215158ef0d54c455cedc65df14e59`; if it moved, re-review the moved diff and re-run verification.

- [ ] **Step 4: Verify post-merge server and worker deployments**

Require:

```text
https://bloombouquet.https.gsmsv.site/ -> 200 + <title>BloomBouquet</title>
https://bloombouquet.https.gsmsv.site/api/bouquet/auth/me -> 200
http://127.0.0.1:8091/health -> 200
```

- [ ] **Step 5: Verify every Bloom PM2 process uses the new directory**

Read-only check:

```js
const { execFileSync } = require('node:child_process');
const list = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
for (const name of ['playground', 'backend', 'bloom-worker', 'bloom-evaluator-llm']) {
  const app = list.find((entry) => entry.name === name);
  if (!app || app.pm2_env?.status !== 'online') process.exit(1);
  const cwd = app.pm2_env?.pm_cwd ?? '';
  const execPath = app.pm2_env?.pm_exec_path ?? '';
  if (cwd.includes('/home/ubuntu/playground') || execPath.includes('/home/ubuntu/playground')) process.exit(1);
}
```

Expected: exit `0`.

- [ ] **Step 6: Delete only the legacy server directory and re-run smoke**

After Step 5 only:

```bash
rm -rf /home/ubuntu/playground
test ! -e /home/ubuntu/playground
curl -fsS https://bloombouquet.https.gsmsv.site/ | grep -q '<title>BloomBouquet</title>'
curl -fsS http://127.0.0.1:8091/health >/dev/null
```

Expected: all commands succeed.

---

### Task 2: Make Evidence Vault path-aware at `/apps/evidence-vault`

**Files:**
- Modify: `BloomBouquet/evidence-vault/next.config.ts`
- Create: `BloomBouquet/evidence-vault/src/routing/app-path.ts`
- Create: `BloomBouquet/evidence-vault/src/routing/app-path.test.ts`
- Modify: `BloomBouquet/evidence-vault/src/auth/client-session.ts`
- Modify: `BloomBouquet/evidence-vault/src/auth/client-session.test.ts`
- Modify: `BloomBouquet/evidence-vault/src/components/auth/auth-entry-action.tsx`
- Modify: `BloomBouquet/evidence-vault/src/components/auth/auth-entry-action.test.tsx`
- Modify: `BloomBouquet/evidence-vault/src/components/auth/sign-out-button.tsx`
- Modify: `BloomBouquet/evidence-vault/src/components/auth/sign-out-button.test.tsx`
- Modify: `BloomBouquet/evidence-vault/app/(protected)/layout.tsx`

**Interfaces:**
- Produces: `APP_BASE_PATH`, `appPath(path?: string): string`, `appUrl(origin: URL | string, path?: string): URL`.
- Consumers: browser fetch/navigation, auth routes in Task 3, deployment contracts in Task 4.

- [ ] **Step 1: Create branch `feat/evidence-vault-bloombouquet-path` from `develop`**

- [ ] **Step 2: Write failing helper/basePath tests**

Create `src/routing/app-path.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_BASE_PATH, appPath, appUrl } from './app-path';

describe('Evidence Vault public app path', () => {
  it('uses the fixed BloomBouquet project prefix', () => {
    expect(APP_BASE_PATH).toBe('/apps/evidence-vault');
    expect(appPath('/')).toBe('/apps/evidence-vault/');
    expect(appPath('/dashboard')).toBe('/apps/evidence-vault/dashboard');
    expect(appPath('/auth/session?retry=1')).toBe('/apps/evidence-vault/auth/session?retry=1');
  });

  it('builds absolute URLs without escaping the project path', () => {
    expect(appUrl('https://bloombouquet.https.gsmsv.site', '/dashboard').toString())
      .toBe('https://bloombouquet.https.gsmsv.site/apps/evidence-vault/dashboard');
  });

  it('pins Next to the same public base path', () => {
    const source = readFileSync('next.config.ts', 'utf8');
    expect(source).toContain('basePath: "/apps/evidence-vault"');
  });
});
```

- [ ] **Step 3: Run the new test and verify RED**

```bash
pnpm test:run src/routing/app-path.test.ts
```

Expected: FAIL because `src/routing/app-path.ts` does not exist and `next.config.ts` lacks `basePath`.

- [ ] **Step 4: Implement the helper and Next basePath**

`src/routing/app-path.ts`:

```ts
export const APP_BASE_PATH = '/apps/evidence-vault';

export function appPath(path = '/') {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized === '/' ? `${APP_BASE_PATH}/` : `${APP_BASE_PATH}${normalized}`;
}

export function appUrl(origin: URL | string, path = '/') {
  const base = origin instanceof URL ? origin : new URL(origin);
  return new URL(appPath(path), base.origin);
}
```

`next.config.ts`:

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  basePath: '/apps/evidence-vault',
};
```

- [ ] **Step 5: Move raw browser fetch/navigation to `appPath()`**

Required changes:

```ts
// src/auth/client-session.ts
fetchImpl(appPath('/auth/session'), ...)

// src/components/auth/auth-entry-action.tsx
const LOGIN_HREF = appPath('/auth/bouquet/start?returnTo=/dashboard');
href={appPath('/dashboard')}

// src/components/auth/sign-out-button.tsx
fetchImpl(appPath('/auth/sign-out'), ...)
navigate(appPath('/'))

// app/(protected)/layout.tsx
redirect(appPath('/?auth_error=session_required'))
```

Update the existing tests to expect the prefixed URLs. Keep `next/link` logical hrefs such as `/dashboard`; Next applies its configured `basePath` to `Link`.

- [ ] **Step 6: Run focused tests and full regression**

```bash
pnpm test:run src/routing/app-path.test.ts src/auth/client-session.test.ts src/components/auth/auth-entry-action.test.tsx src/components/auth/sign-out-button.test.tsx
pnpm test:run
pnpm build
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: add Evidence Vault BloomBouquet base path"
```

---

### Task 3: Scope Evidence Vault OAuth, redirects, and cookies to the project path

**Files:**
- Modify: `BloomBouquet/evidence-vault/src/auth/config.ts`
- Modify: `BloomBouquet/evidence-vault/src/auth/config.test.ts`
- Modify: `BloomBouquet/evidence-vault/app/auth/bouquet/start/route.ts`
- Modify: `BloomBouquet/evidence-vault/app/auth/bouquet/start/route.test.ts`
- Modify: `BloomBouquet/evidence-vault/app/auth/bouquet/callback/route.ts`
- Modify: `BloomBouquet/evidence-vault/app/auth/bouquet/callback/route.test.ts`
- Modify: `BloomBouquet/evidence-vault/app/auth/sign-out/route.ts`
- Modify: `BloomBouquet/evidence-vault/app/auth/sign-out/route.test.ts`

**Interfaces:**
- Consumes: `APP_BASE_PATH`, `appPath`, `appUrl` from Task 2.
- Produces: exact production callback validation, project-scoped attempt/session cookies, project-prefixed redirects.

- [ ] **Step 1: Add RED production URL validation**

Use this valid environment in `src/auth/config.test.ts`:

```ts
const env = {
  NODE_ENV: 'production',
  APP_BASE_URL: 'https://bloombouquet.https.gsmsv.site/apps/evidence-vault/',
  BOUQUET_BASE_URL: 'https://bloombouquet.https.gsmsv.site',
  BOUQUET_CLIENT_ID: 'bouquet-submission-123',
  BOUQUET_REDIRECT_URI: 'https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/callback',
  SESSION_SECRET: 'x'.repeat(48),
};
```

Require `https://bloombouquet.https.gsmsv.site/auth/bouquet/callback` to throw `auth_config_invalid` in production.

- [ ] **Step 2: Add RED cookie/redirect assertions**

Require start cookie:

```text
Path=/apps/evidence-vault/auth/bouquet
```

Require callback success:

```text
Location: https://bloombouquet.https.gsmsv.site/apps/evidence-vault/dashboard
Set-Cookie: ev_session=...; Path=/apps/evidence-vault
```

Require callback failure:

```text
Location: https://bloombouquet.https.gsmsv.site/apps/evidence-vault/?auth_error=oauth_failed
```

Require sign-out clear cookie:

```text
Path=/apps/evidence-vault
```

- [ ] **Step 3: Run focused auth tests and verify RED**

```bash
pnpm test:run src/auth/config.test.ts app/auth/bouquet/start/route.test.ts app/auth/bouquet/callback/route.test.ts app/auth/sign-out/route.test.ts
```

Expected: fail on old callback pathname, redirect URLs, and root-scoped cookie paths.

- [ ] **Step 4: Implement exact production validation**

In `getAuthConfig`:

```ts
if (
  secureCookies && (
    appBaseUrl.pathname !== '/apps/evidence-vault/' ||
    appBaseUrl.search || appBaseUrl.hash ||
    bouquetRedirectUri.origin !== appBaseUrl.origin ||
    bouquetRedirectUri.pathname !== '/apps/evidence-vault/auth/bouquet/callback' ||
    bouquetRedirectUri.search || bouquetRedirectUri.hash
  )
) {
  invalid();
}
```

Keep the existing HTTPS and 32-byte session secret rules.

- [ ] **Step 5: Implement project-scoped cookies and redirects**

Use the helper/constants:

```ts
// login attempt
path: `${APP_BASE_PATH}/auth/bouquet`

// callback session + sign-out clear cookie
path: APP_BASE_PATH

// callback success/failure
NextResponse.redirect(appUrl(config.appBaseUrl, returnTo))
NextResponse.redirect(appUrl(config.appBaseUrl, '/?auth_error=oauth_failed'))
```

Do not prefix provider portal/token/userinfo calls; they continue to use `BOUQUET_BASE_URL` directly.

- [ ] **Step 6: Run focused tests, all unit tests, and build**

```bash
pnpm test:run src/auth/config.test.ts app/auth/bouquet/start/route.test.ts app/auth/bouquet/callback/route.test.ts app/auth/sign-out/route.test.ts
pnpm test:run
pnpm build
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "fix: scope Evidence Vault auth to project path"
```

---

### Task 4: Update Evidence Vault deployment contracts for path hosting

**Files:**
- Modify: `BloomBouquet/evidence-vault/deploy/preview-contract.json`
- Modify: `BloomBouquet/evidence-vault/scripts/start-preview.sh`
- Modify: `BloomBouquet/evidence-vault/scripts/deploy-preview.sh`
- Modify: `BloomBouquet/evidence-vault/src/deployment/preview-contract.test.ts`
- Modify: `BloomBouquet/evidence-vault/src/deployment/server-scripts.test.ts`
- Keep unchanged until Task 8: `BloomBouquet/evidence-vault/deploy/nginx/evidence-vault-preview.conf.template`

**Interfaces:**
- Consumes: base path/auth contract from Tasks 2-3.
- Produces: deployable build with loopback health at `/apps/evidence-vault/api/health` and server-only env contract using the BloomBouquet path URL.

- [ ] **Step 1: Change deployment tests first**

`src/deployment/preview-contract.test.ts` must require:

```json
{
  "publicUrl": "https://bloombouquet.https.gsmsv.site/apps/evidence-vault/",
  "oauthCallback": "https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/callback",
  "providerUrl": "https://bloombouquet.https.gsmsv.site",
  "serverDir": "/home/ubuntu/evidence-vault",
  "processName": "evidence-vault-preview",
  "port": 3011,
  "integrationBranch": "develop",
  "releaseBranch": "main"
}
```

`src/deployment/server-scripts.test.ts` must require:

```text
https://bloombouquet.https.gsmsv.site/apps/evidence-vault/
https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/callback
http://127.0.0.1:3011/apps/evidence-vault/api/health
```

and reject the old standalone app/callback values.

- [ ] **Step 2: Run deployment tests and verify RED**

```bash
pnpm test:run src/deployment/preview-contract.test.ts src/deployment/server-scripts.test.ts
```

Expected: old standalone URL/callback/health contract fails.

- [ ] **Step 3: Implement the exact contract**

Update `deploy/preview-contract.json`, then change `scripts/start-preview.sh` and `scripts/deploy-preview.sh` to require:

```bash
APP_BASE_URL=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/
BOUQUET_BASE_URL=https://bloombouquet.https.gsmsv.site
BOUQUET_REDIRECT_URI=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/callback
HEALTH_URL=http://127.0.0.1:3011/apps/evidence-vault/api/health
```

Do not change DB migration, exact-SHA validation, PM2 process name, port, or forward-only rollback behavior.

- [ ] **Step 4: Verify GREEN**

```bash
pnpm test:run src/deployment/preview-contract.test.ts src/deployment/server-scripts.test.ts
pnpm test:run
pnpm build
```

Expected: all PASS.

- [ ] **Step 5: Open Draft PR**

Title:

```text
feat : 증빙함 BloomBouquet 하위 경로 호스팅 적용
```

Use the exact required PR body section order.

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor: update Evidence Vault path hosting contract"
```

---

### Task 5: Turn BloomBouquet public main into a launcher and add a manual static gateway deploy

**Files:**
- Modify: `sunwoo162/Playground/bloom-web/src/app/BouquetShowcaseApp.tsx`
- Create: `sunwoo162/Playground/deploy/nginx/bloombouquet.conf`
- Create: `sunwoo162/Playground/scripts/bloombouquet-app-gateway.policy-test.js`
- Modify: `sunwoo162/Playground/package.json`
- Create: `sunwoo162/Playground/.github/workflows/deploy-bloombouquet-app-gateway.yml`

**Interfaces:**
- Consumes: Evidence Vault fixed upstream `127.0.0.1:3011`, path `/apps/evidence-vault`.
- Produces: public launcher without visitor auth controls plus an operator-only gateway workflow; normal `main` deploy does not automatically flip the project route before Evidence Vault is ready.

- [ ] **Step 1: Branch from the post-PR-#116 `main`**

Branch:

```text
feat/bloombouquet-project-launcher-gateway
```

- [ ] **Step 2: Add RED launcher/gateway policy**

Create `scripts/bloombouquet-app-gateway.policy-test.js`:

```js
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

test('public showcase is a launcher, not a login surface', () => {
  const source = fs.readFileSync('bloom-web/src/app/BouquetShowcaseApp.tsx', 'utf8');
  assert.doesNotMatch(source, /\?mode=auth/);
  assert.doesNotMatch(source, /꽃다발 로그인/);
  assert.doesNotMatch(source, /\?mode=manage/);
  assert.doesNotMatch(source, /target="_blank"/);
});

test('gateway uses only fixed BloomBouquet project mappings', () => {
  const nginx = fs.readFileSync('deploy/nginx/bloombouquet.conf', 'utf8');
  assert.match(nginx, /location = \/apps\/evidence-vault/);
  assert.match(nginx, /return 308 \/apps\/evidence-vault\//);
  assert.match(nginx, /location \^~ \/apps\/evidence-vault\//);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3011;/);
  assert.match(nginx, /location \/[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:3000;/);
});

test('gateway deployment is manual-only', () => {
  const workflow = fs.readFileSync('.github/workflows/deploy-bloombouquet-app-gateway.yml', 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:/);
  assert.doesNotMatch(workflow, /pull_request:/);
});
```

Add this test to `test:production-runtime`.

- [ ] **Step 3: Run production policy and verify RED**

```bash
pnpm run test:production-runtime
```

Expected: public auth/manage CTAs still present and gateway files missing.

- [ ] **Step 4: Update `BouquetShowcaseApp` to launcher behavior**

Remove public login/manage actions. Keep only non-clickable explanatory copy if desired:

```tsx
<section className="bouquet-auth-note" aria-label="Project authentication policy">
  <span className="bouquet-auth-mark">✿</span>
  <div className="bouquet-auth-copy">
    <strong>로그인은 각 프로젝트에서 시작합니다</strong>
    <p>필요한 프로젝트만 꽃다발 공통 인증을 사용합니다.</p>
  </div>
</section>
```

Make project open same-tab:

```tsx
{submission?.demoUrl && <a href={submission.demoUrl}>프로젝트 열기 →</a>}
```

Do not delete `?mode=manage` implementation from `BloomApp`; only stop promoting it publicly.

- [ ] **Step 5: Add committed gateway config**

Create `deploy/nginx/bloombouquet.conf`:

```nginx
server {
    listen 80;
    server_name bloombouquet.https.gsmsv.site;

    location = /apps/evidence-vault {
        return 308 /apps/evidence-vault/;
    }

    location ^~ /apps/evidence-vault/ {
        proxy_pass http://127.0.0.1:3011;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

- [ ] **Step 6: Add operator-only `deploy-bloombouquet-app-gateway.yml`**

Workflow contract:

```yaml
name: Deploy BloomBouquet App Gateway
on:
  workflow_dispatch:
    inputs:
      mode:
        description: probe or deploy
        required: true
        type: choice
        options: [probe, deploy]
permissions:
  contents: read
```

`probe` must only read current Nginx/app state. `deploy` must:

1. require `SSH_PASSWORD`;
2. verify `127.0.0.1:3000` Bloom root and `127.0.0.1:3011/apps/evidence-vault/api/health` before mutation;
3. resolve exactly one enabled config containing `server_name bloombouquet.https.gsmsv.site`;
4. resolve its real target with `readlink -f`;
5. back it up;
6. install committed `deploy/nginx/bloombouquet.conf`;
7. run `sudo nginx -t`;
8. restore backup if validation fails;
9. reload Nginx only after validation;
10. verify public `/` and `/apps/evidence-vault/api/health`.

Pin the SSH action to the already-reviewed commit `029f5b4aeeeb58fdfe1410a5d17f967dacf36262`.

- [ ] **Step 7: Run policy/build/Harness and commit**

```bash
pnpm run test:production-runtime
pnpm run build:bloom-web
```

Then require full Harness PASS in the PR.

Commit:

```bash
git commit -m "feat: add BloomBouquet project app gateway"
```

---

### Task 6: Review and merge code without prematurely flipping production auth

**Files / PRs:**
- Evidence Vault PR from Tasks 2-4
- BloomBouquet PR from Task 5

**Interfaces:**
- Produces: merged code ready for coordinated cutover; Evidence Vault server env remains on the old standalone contract until Task 7.

- [ ] **Step 1: Review Evidence Vault PR**

Merge blockers:

```text
root-scoped ev_session or ev_oauth_attempt
raw browser /auth/* path escaping basePath
callback success/failure escaping /apps/evidence-vault
server-to-server Bouquet calls incorrectly prefixed
old standalone app/callback deployment contract
```

- [ ] **Step 2: Review BloomBouquet PR**

Merge blockers:

```text
public login/manage CTA still visible
dynamic/arbitrary proxy destination
project prefix stripped before Next
root no longer targets 3000
normal main push auto-flips gateway before coordinated cutover
```

- [ ] **Step 3: Require exact-head CI**

Evidence Vault: PostgreSQL migration, all Vitest tests, production build, Preview verify PASS.

BloomBouquet: full Harness PASS.

- [ ] **Step 4: Merge both PRs**

Evidence Vault `develop` push remains verify-only; do not dispatch its deploy yet.

BloomBouquet gateway workflow remains manual-only; do not dispatch `mode=deploy` yet.

---

### Task 7: Bootstrap the OAuth client and perform coordinated production cutover

**Systems:**
- BloomBouquet owner management flow
- PM2 `bloom-worker`, `evidence-vault-preview`
- `/home/ubuntu/evidence-vault/.env.production`
- manual `Deploy BloomBouquet App Gateway` workflow

**Interfaces:**
- Consumes: merged path-aware Evidence Vault and merged static gateway config.
- Produces: one canonical path-hosted Submission, its `bouquetClientId`, working OAuth/session, and a queued Run ready for evaluator processing.

- [ ] **Step 1: Confirm no unrelated evaluation is RUNNING**

If any unrelated Run is active, wait for it to finish; never interrupt it.

- [ ] **Step 2: Stop only `bloom-worker` for the bootstrap window**

Verify it no longer claims Runs while Bloom web/backend and evaluator LLM stay online.

- [ ] **Step 3: Search owner project/submissions for an exact migration Submission**

Exact contract:

```text
demoUrl=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/
authRedirectUri=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/callback
requiresAuth=true
frontendRepositoryUrl=https://github.com/BloomBouquet/evidence-vault
backendRepositoryUrl=https://github.com/BloomBouquet/evidence-vault
```

If it exists, reuse `bouquetClientId` and its Run. Otherwise continue.

- [ ] **Step 4: Create the migration Submission through normal authenticated owner flow**

Request body:

```json
{
  "version": "0.2.0-path-preview",
  "demoUrl": "https://bloombouquet.https.gsmsv.site/apps/evidence-vault/",
  "frontendRepositoryUrl": "https://github.com/BloomBouquet/evidence-vault",
  "backendRepositoryUrl": "https://github.com/BloomBouquet/evidence-vault",
  "requiresAuth": true,
  "authRedirectUri": "https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/callback"
}
```

Require response fields:

```text
bouquetClientId != null/blank
bouquetRedirectUri == expected callback
evaluationRunId != null
evaluationStatus == QUEUED
```

If no authenticated owner session is available to the executor, this is the explicit owner-action gate: ask the user to perform only this normal management submission and never request credentials/cookie contents.

- [ ] **Step 5: Back up and atomically update Evidence Vault server-only env**

Replace only:

```text
APP_BASE_URL=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/
BOUQUET_BASE_URL=https://bloombouquet.https.gsmsv.site
BOUQUET_CLIENT_ID=<returned client id>
BOUQUET_REDIRECT_URI=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/callback
```

Do not print secret values. Keep file mode `600` and retain a protected rollback copy until E2E is proven.

- [ ] **Step 6: Deploy exact merged Evidence Vault `develop` SHA**

```bash
scripts/deploy-preview.sh <40-character-develop-sha>
```

Require:

```text
pnpm install PASS
pnpm db:migrate PASS
pnpm build PASS
PM2 evidence-vault-preview online
http://127.0.0.1:3011/apps/evidence-vault/api/health -> 200
```

On failure restore previous SHA/env/process; do not create another Submission.

- [ ] **Step 7: Dispatch `Deploy BloomBouquet App Gateway` with `mode=deploy`**

If the connector cannot dispatch workflow events, run the normal GitHub Actions UI/`gh workflow run` owner action; do not create a backdoor endpoint.

Require Nginx validation + public root/path health PASS.

- [ ] **Step 8: Verify public page, health, and one Next asset**

```bash
curl -fsS https://bloombouquet.https.gsmsv.site/apps/evidence-vault/ | grep -q '증빙함'
curl -fsS https://bloombouquet.https.gsmsv.site/apps/evidence-vault/api/health | grep -q '"service":"evidence-vault"'
```

Extract one asset URL from HTML; require it to begin `/apps/evidence-vault/_next/` and return HTTP `200`.

- [ ] **Step 9: Verify OAuth start contract**

Request:

```text
GET https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/start?returnTo=/dashboard
```

Require `Location` origin `https://bloombouquet.https.gsmsv.site`, `mode=auth`, the expected client ID, the new callback URI, PKCE state/challenge, and no project-session token.

- [ ] **Step 10: Complete one real OAuth E2E from inside Evidence Vault**

Expected callback destination:

```text
https://bloombouquet.https.gsmsv.site/apps/evidence-vault/dashboard
```

Then require `/apps/evidence-vault/auth/session` to report the authenticated user. Browser cookie must be HttpOnly/Secure and Path `/apps/evidence-vault`; no token goes to local/session storage.

- [ ] **Step 11: Resume evaluator only after Steps 8-10 pass**

Start `bloom-worker` from `/home/ubuntu/bloombouquet`, verify worker health, then observe:

```text
QUEUED -> RUNNING -> COMPLETED
```

Require final score/stars/summary and persisted independent role evaluations.

---

### Task 8: Verify launcher, remove standalone Evidence Vault domain, and document the reusable pattern

**Systems / Files:**
- BloomBouquet public project data and launcher
- GSM-SV HTTPS domain configuration
- Evidence Vault legacy Nginx host file after domain removal
- Operational docs in the relevant repo

**Interfaces:**
- Consumes: completed path-hosted Submission and successful OAuth/evaluation E2E.
- Produces: one external BloomBouquet domain hosting launcher + Evidence Vault path; standalone Evidence Vault domain removed.

- [ ] **Step 1: Verify launcher uses the canonical latest Submission URL**

Public project data must show:

```text
https://bloombouquet.https.gsmsv.site/apps/evidence-vault/
```

Project click must stay in the same tab and browser Back must return to the launcher.

- [ ] **Step 2: Run the final pre-delete matrix**

Require all:

```text
BloomBouquet / -> 200 + BloomBouquet title
/apps/evidence-vault/ -> 200 + Evidence Vault marker
/apps/evidence-vault/api/health -> 200
OAuth start -> Bouquet provider
OAuth callback -> /apps/evidence-vault/dashboard
auth/session -> authenticated after login
migration evaluation -> COMPLETED
```

- [ ] **Step 3: Delete only `evidence-vault.https.gsmsv.site` in GSM-SV**

If no authenticated GSM-SV browser is connected, this is the final manual owner action. Keep `bloombouquet.https.gsmsv.site`.

- [ ] **Step 4: Re-run canonical path smoke after domain deletion**

All BloomBouquet/Evidence Vault path checks must remain green.

- [ ] **Step 5: Remove obsolete standalone Evidence Vault Nginx host config**

Only after Step 4. Run `sudo nginx -t` before reload; do not touch the BloomBouquet gateway server block.

- [ ] **Step 6: Document the future-project contract**

Document:

```text
unique slug
unique loopback port
basePath=/apps/<slug>
path-scoped project cookies
one static operator-controlled Nginx mapping
project-internal Bouquet login
canonical Submission demoUrl under BloomBouquet origin
```

Commit:

```bash
git commit -m "docs: document BloomBouquet project app hosting"
```

- [ ] **Step 7: Fresh final verification before claiming completion**

Inspect public root/path, OAuth session, PM2, Nginx, and evaluation result again after all cleanup. Do not claim complete unless every completion criterion from the spec is observed.
