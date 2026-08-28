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
- Existing `requiresAuth=true` Submission flow remains the only OAuth client bootstrap mechanism; its returned `bouquetClientId` must be used.
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

Run/check: Harness run for PR #116 head `1d81ef5f2ab215158ef0d54c455cedc65df14e59`.

Expected: build, production runtime policy, backend protocol tests, desktop build, Bloom worker/runtime tests, Rust/Tauri checks, and harness invariants all PASS.

- [ ] **Step 2: Update PR #116 body with final RED/GREEN and server pre-cutover evidence**

Use the exact required sections. Record:

```text
RED: legacy /home/ubuntu/playground path policy failed
GREEN: Harness #363 full PASS
Ops pre-cutover: core playground/backend/bloom-worker paths=new, public postcheck=ok
Security: .env and .env.backend mode=600
```

- [ ] **Step 3: Mark PR #116 ready and merge to `main` with expected head SHA**

Expected: merge succeeds only if head is still `1d81ef5f...`; otherwise re-review moved head before merging.

- [ ] **Step 4: Verify both post-merge workflows**

Check `Deploy to Server` and `Deploy Bloom Worker` for the merge SHA.

Expected server markers:

```text
https://bloombouquet.https.gsmsv.site/ -> 200 + <title>BloomBouquet</title>
/api/bouquet/auth/me -> 200
bloom-worker health -> 200
```

- [ ] **Step 5: Verify every Bloom PM2 process uses the new directory before deletion**

Read-only server check:

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

- [ ] **Step 6: Delete only the legacy server directory and re-run public/worker smoke**

Server action after Step 5 only:

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
- Modify: `BloomBouquet/evidence-vault/src/components/auth/auth-entry-action.tsx`
- Modify: `BloomBouquet/evidence-vault/src/components/auth/sign-out-button.tsx`
- Modify: `BloomBouquet/evidence-vault/app/(protected)/layout.tsx`
- Test: existing component/session/protected-layout tests plus new path helper test

**Interfaces:**
- Produces: `APP_BASE_PATH`, `appPath(path: string): string`, and `appUrl(origin: URL | string, path: string): URL`.
- Consumers: browser fetch/navigation, auth routes in Task 3, deployment contracts in Task 4.

- [ ] **Step 1: Create a feature branch from `develop`**

Branch:

```text
feat/evidence-vault-bloombouquet-path
```

- [ ] **Step 2: Write failing path-helper and basePath tests**

Create `src/routing/app-path.test.ts`:

```ts
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
});
```

Also extend the existing deployment/path contract test to read `next.config.ts` and require:

```ts
expect(source).toContain('basePath: "/apps/evidence-vault"');
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
pnpm test:run src/routing/app-path.test.ts
```

Expected: FAIL because `src/routing/app-path.ts` does not exist.

- [ ] **Step 4: Implement the minimal reusable path helper and Next basePath**

Create `src/routing/app-path.ts`:

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

Update `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  basePath: '/apps/evidence-vault',
};
```

- [ ] **Step 5: Move raw browser fetch/navigation to `appPath()`**

Required replacements:

```ts
// src/auth/client-session.ts
fetchImpl(appPath('/auth/session'), ...)

// src/components/auth/auth-entry-action.tsx
const LOGIN_HREF = appPath('/auth/bouquet/start?returnTo=/dashboard');
// authenticated raw anchor
href={appPath('/dashboard')}

// src/components/auth/sign-out-button.tsx
fetchImpl(appPath('/auth/sign-out'), ...)
navigate(appPath('/'))

// app/(protected)/layout.tsx
redirect(appPath('/?auth_error=session_required'))
```

Keep `next/link` logical hrefs such as `/dashboard`; Next applies `basePath` to its own `Link` component.

- [ ] **Step 6: Run focused tests, then the full Evidence Vault suite/build**

Run:

```bash
pnpm test:run src/routing/app-path.test.ts src/auth/client-session.test.ts src/components/auth/sign-out-button.test.tsx
pnpm test:run
pnpm build
```

Expected: all PASS; Next route output is generated under the configured base path.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: add Evidence Vault BloomBouquet base path"
```

---

### Task 3: Scope Evidence Vault OAuth, redirects, and cookies to the project path

**Files:**
- Modify: `BloomBouquet/evidence-vault/src/auth/config.ts`
- Modify: `BloomBouquet/evidence-vault/app/auth/bouquet/start/route.ts`
- Modify: `BloomBouquet/evidence-vault/app/auth/bouquet/callback/route.ts`
- Modify: `BloomBouquet/evidence-vault/app/auth/sign-out/route.ts`
- Test: `src/auth/config.test.ts`
- Test: `app/auth/bouquet/start/route.test.ts`
- Test: `app/auth/bouquet/callback/route.test.ts`
- Test: `app/auth/sign-out/route.test.ts`

**Interfaces:**
- Consumes: `APP_BASE_PATH`, `appPath`, `appUrl` from Task 2.
- Produces: exact production callback validation, project-scoped attempt/session cookie contract, project-prefixed success/failure redirects.

- [ ] **Step 1: Write RED assertions for production auth URLs**

Add config expectations using:

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

Require the old callback `/auth/bouquet/callback` without `/apps/evidence-vault` to throw `auth_config_invalid` in production.

- [ ] **Step 2: Add RED cookie/redirect assertions**

Start-route test must expect:

```ts
expect(setCookie).toContain('Path=/apps/evidence-vault/auth/bouquet');
```

Callback test must expect successful redirect:

```text
https://bloombouquet.https.gsmsv.site/apps/evidence-vault/dashboard
```

and `ev_session` cookie:

```text
Path=/apps/evidence-vault
```

Failure redirect must be:

```text
https://bloombouquet.https.gsmsv.site/apps/evidence-vault/?auth_error=oauth_failed
```

Sign-out clear cookie must also use `Path=/apps/evidence-vault`.

- [ ] **Step 3: Run focused auth tests and verify RED**

Run:

```bash
pnpm test:run src/auth/config.test.ts app/auth/bouquet/start/route.test.ts app/auth/bouquet/callback/route.test.ts app/auth/sign-out/route.test.ts
```

Expected: failures on callback pathname, redirect URLs, and cookie paths.

- [ ] **Step 4: Implement exact config validation**

In `getAuthConfig`, require in production:

```ts
if (
  appBaseUrl.pathname !== '/apps/evidence-vault/' ||
  appBaseUrl.search || appBaseUrl.hash ||
  bouquetRedirectUri.origin !== appBaseUrl.origin ||
  bouquetRedirectUri.pathname !== '/apps/evidence-vault/auth/bouquet/callback' ||
  bouquetRedirectUri.search || bouquetRedirectUri.hash
) {
  invalid();
}
```

Keep existing HTTPS and session-secret checks.

- [ ] **Step 5: Implement scoped cookie and redirect behavior**

Use constants/helpers instead of duplicated path literals:

```ts
// login attempt cookie
path: `${APP_BASE_PATH}/auth/bouquet`

// callback session cookie and sign-out clear cookie
path: APP_BASE_PATH

// callback redirects
NextResponse.redirect(appUrl(config.appBaseUrl, returnTo))
NextResponse.redirect(appUrl(config.appBaseUrl, '/?auth_error=oauth_failed'))
```

The OAuth provider URL and token/userinfo server-to-server calls remain rooted at `BOUQUET_BASE_URL`; do not prefix them with `/apps/evidence-vault`.

- [ ] **Step 6: Run focused auth tests and full regression**

Run:

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
- Modify: `BloomBouquet/evidence-vault/src/deployment/server-scripts.test.ts`
- Modify: Evidence Vault preview-contract test file that currently validates `deploy/preview-contract.json`
- Keep the standalone Nginx file until final deletion: `deploy/nginx/evidence-vault-preview.conf.template`

**Interfaces:**
- Consumes: base path and auth contract from Tasks 2-3.
- Produces: a deployable Evidence Vault build whose loopback health endpoint is `/apps/evidence-vault/api/health` and whose server-only env contract uses the BloomBouquet path URL.

- [ ] **Step 1: Change tests first to require the new deployment contract**

Expected JSON values:

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

Require `scripts/start-preview.sh` and `scripts/deploy-preview.sh` to contain the same app/callback values and to use:

```text
http://127.0.0.1:3011/apps/evidence-vault/api/health
```

- [ ] **Step 2: Run deployment tests and verify RED**

Run:

```bash
pnpm test:run src/deployment/server-scripts.test.ts
```

plus the existing preview-contract test file.

Expected: old standalone public URL/callback/health assertions fail.

- [ ] **Step 3: Implement the minimal contract changes**

Set:

```bash
APP_BASE_URL=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/
BOUQUET_BASE_URL=https://bloombouquet.https.gsmsv.site
BOUQUET_REDIRECT_URI=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/callback
HEALTH_URL=http://127.0.0.1:3011/apps/evidence-vault/api/health
```

Do not alter DB migration, exact-SHA deploy, forward-only migration, PM2 process name, or rollback behavior.

- [ ] **Step 4: Verify GREEN and production build**

Run:

```bash
pnpm test:run
pnpm build
```

Expected: migration contract, all unit tests, and Next production build PASS.

- [ ] **Step 5: Open/update the Evidence Vault PR using the required template**

PR title:

```text
feat : 증빙함 BloomBouquet 하위 경로 호스팅 적용
```

Keep it Draft until CI and code review pass.

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor: update Evidence Vault path hosting contract"
```

---

### Task 5: Turn BloomBouquet public main into a launcher and add the static project gateway

**Files:**
- Modify: `sunwoo162/Playground/bloom-web/src/app/BouquetShowcaseApp.tsx`
- Create: `sunwoo162/Playground/deploy/nginx/bloombouquet.conf`
- Create: `sunwoo162/Playground/scripts/bloombouquet-app-gateway.policy-test.js`
- Modify: `sunwoo162/Playground/package.json`
- Modify: `sunwoo162/Playground/.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: Evidence Vault fixed upstream `127.0.0.1:3011`, base path `/apps/evidence-vault`.
- Produces: public launcher without visitor auth controls and Nginx routing `/apps/evidence-vault/` to port `3011` while `/` remains port `3000`.

- [ ] **Step 1: Branch from the post-PR-#116 `main`**

Branch:

```text
feat/bloombouquet-project-launcher-gateway
```

- [ ] **Step 2: Add RED launcher/gateway policy tests**

Create `scripts/bloombouquet-app-gateway.policy-test.js` with assertions equivalent to:

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

test('gateway routes Evidence Vault by fixed path and preserves Bloom root', () => {
  const nginx = fs.readFileSync('deploy/nginx/bloombouquet.conf', 'utf8');
  assert.match(nginx, /location = \/apps\/evidence-vault/);
  assert.match(nginx, /return 308 \/apps\/evidence-vault\//);
  assert.match(nginx, /location \^~ \/apps\/evidence-vault\//);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3011;/);
  assert.match(nginx, /location \/[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:3000;/);
});
```

Add this file to `test:production-runtime` in `package.json`.

- [ ] **Step 3: Run production policy and verify RED**

Run:

```bash
pnpm run test:production-runtime
```

Expected: fail because public login/manage controls still exist and committed Nginx gateway file does not exist.

- [ ] **Step 4: Update `BouquetShowcaseApp` to launcher behavior**

Remove the public login/manage actions. Keep an informational authentication note only if it has no CTA, for example:

```tsx
<section className="bouquet-auth-note" aria-label="Project authentication policy">
  <span className="bouquet-auth-mark">✿</span>
  <div className="bouquet-auth-copy">
    <strong>로그인은 각 프로젝트에서 시작합니다</strong>
    <p>필요한 프로젝트만 꽃다발 공통 인증을 사용합니다.</p>
  </div>
</section>
```

Project action becomes same-tab:

```tsx
{submission?.demoUrl && (
  <a href={submission.demoUrl}>프로젝트 열기 →</a>
)}
```

Do not remove the management mode implementation itself; only remove its public promotion.

- [ ] **Step 5: Add the committed static Nginx gateway**

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

- [ ] **Step 6: Make deploy install the committed gateway atomically**

In the SSH deploy step, before reload:

```bash
MATCHES="$(sudo grep -R -l -F 'server_name bloombouquet.https.gsmsv.site' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null || true)"
test "$(printf '%s\n' "$MATCHES" | sed '/^$/d' | wc -l)" -eq 1 || record_failure "BloomBouquet nginx host config must resolve exactly once"
ACTIVE_CONFIG="$(printf '%s\n' "$MATCHES" | sed '/^$/d' | head -n 1)"
ACTIVE_TARGET="$(readlink -f "$ACTIVE_CONFIG")"
BACKUP_CONFIG="${ACTIVE_TARGET}.pre-bloom-app-gateway"
sudo cp "$ACTIVE_TARGET" "$BACKUP_CONFIG"
sudo install -m 644 deploy/nginx/bloombouquet.conf "$ACTIVE_TARGET"
if ! sudo nginx -t; then
  sudo cp "$BACKUP_CONFIG" "$ACTIVE_TARGET"
  sudo nginx -t
  record_failure "BloomBouquet nginx gateway validation failed"
fi
sudo systemctl reload nginx
```

Do not expose or alter arbitrary server blocks.

- [ ] **Step 7: Extend deploy public smoke**

Require both launcher and path health after Evidence Vault has been deployed:

```bash
curl -fsS https://bloombouquet.https.gsmsv.site/ | grep -q '<title>BloomBouquet</title>'
curl -fsS https://bloombouquet.https.gsmsv.site/apps/evidence-vault/api/health \
  | grep -q '"service":"evidence-vault"'
```

For the initial merge before Evidence Vault cutover, gate the Evidence Vault path smoke behind an explicit deployment flag or perform gateway installation in the coordinated production step of Task 7; do not make normal main deploy fail before port 3011 is path-ready.

- [ ] **Step 8: Run full Harness and commit**

Run through PR CI:

```bash
pnpm run test:production-runtime
pnpm run build:bloom-web
```

and the full repository Harness.

Commit:

```bash
git commit -m "feat: add BloomBouquet project app gateway"
```

---

### Task 6: Review and merge the two code changes without deploying the new auth contract prematurely

**Files:**
- Evidence Vault PR from Tasks 2-4
- BloomBouquet gateway/launcher PR from Task 5

**Interfaces:**
- Produces: code on `develop`/`main` ready for coordinated runtime cutover, while old Evidence Vault runtime remains recoverable until the bootstrap Submission is created.

- [ ] **Step 1: Run independent code review on Evidence Vault PR**

Block merge for any of:

```text
root-scoped ev_session or ev_oauth_attempt cookies
raw browser fetch to /auth/* without base path
callback redirects escaping /apps/evidence-vault
server-to-server Bouquet calls incorrectly prefixed with /apps/evidence-vault
old standalone app/callback deployment contract
```

- [ ] **Step 2: Run independent code review on BloomBouquet PR**

Block merge for any of:

```text
public login/manage CTA still visible
arbitrary/dynamic proxy destination
/apps/evidence-vault route stripping the prefix
root route no longer targeting 3000
worker/internal endpoint exposed by Nginx project mapping
```

- [ ] **Step 3: Require latest CI on exact heads**

Evidence Vault: PostgreSQL migration + all Vitest tests + production build + preview verify PASS.

BloomBouquet: full Harness PASS.

- [ ] **Step 4: Merge code PRs but keep production Evidence Vault env on the old runtime contract until Task 7**

Evidence Vault `develop` merge does not auto-deploy; verify deploy workflow remains manual for server mutation.

BloomBouquet gateway deployment must not create a broken public path before the coordinated cutover; if needed keep the Nginx install step disabled behind the explicit coordinated cutover flag until Task 7.

---

### Task 7: Bootstrap the new OAuth client and perform coordinated production cutover

**Files / Systems:**
- BloomBouquet production management API/UI
- PM2: `bloom-worker`, `evidence-vault-preview`
- Evidence Vault `.env.production`
- BloomBouquet Nginx host configuration
- Evidence Vault deployed `develop` SHA

**Interfaces:**
- Consumes: merged path-aware Evidence Vault code and fixed BloomBouquet gateway config.
- Produces: one canonical path-hosted Evidence Vault Submission, its `bouquetClientId`, working OAuth callback/session, and a queued evaluator Run ready to resume.

- [ ] **Step 1: Read-only preflight evaluation state**

Use public/owner/internal read-only evidence to ensure there is no unrelated evaluation currently `RUNNING`.

Expected: safe to pause evaluator. If another run is active, wait for it; do not interrupt it.

- [ ] **Step 2: Stop only the evaluator worker that can claim the new Run**

Stop `bloom-worker` through PM2 after confirming no unrelated active claim. Keep backend, Bloom web, and evaluator LLM available.

Verify:

```bash
pm2 status bloom-worker
```

Expected: stopped; no public service outage.

- [ ] **Step 3: Check whether the exact migration Submission already exists**

Exact contract:

```text
demoUrl=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/
authRedirectUri=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/callback
requiresAuth=true
frontendRepositoryUrl=https://github.com/BloomBouquet/evidence-vault
backendRepositoryUrl=https://github.com/BloomBouquet/evidence-vault
```

If found, reuse its `bouquetClientId` and Run. If absent, continue.

- [ ] **Step 4: Create the migration Submission through the normal authenticated owner flow**

Do not seed or modify DB directly. Required request body:

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

Expected response must contain non-empty `bouquetClientId`, matching `bouquetRedirectUri`, non-null `evaluationRunId`, and `evaluationStatus="QUEUED"`.

If an authenticated owner browser/session is unavailable in the execution environment, this is the explicit user-action gate; ask the owner to perform only this normal management action, never for credentials or cookie values.

- [ ] **Step 5: Back up and atomically update Evidence Vault server-only env**

Do not print values. Replace only these keys while preserving DB/session/storage secrets:

```text
APP_BASE_URL=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/
BOUQUET_BASE_URL=https://bloombouquet.https.gsmsv.site
BOUQUET_CLIENT_ID=<SubmissionResponse.bouquetClientId>
BOUQUET_REDIRECT_URI=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/callback
```

Keep mode `600`; retain an encrypted/server-local or permission-protected rollback copy until the cutover is proven.

- [ ] **Step 6: Deploy the exact merged Evidence Vault `develop` SHA**

Use `scripts/deploy-preview.sh <40-char-sha>`.

Expected:

```text
pnpm install --frozen-lockfile PASS
pnpm db:migrate PASS
pnpm build PASS
PM2 evidence-vault-preview online
http://127.0.0.1:3011/apps/evidence-vault/api/health -> 200
```

If deploy fails, restore previous SHA/env/process; do not create a second Submission.

- [ ] **Step 7: Install/reload the BloomBouquet Nginx gateway atomically**

Use the committed config from Task 5, validate `sudo nginx -t`, then reload.

Expected:

```text
/apps/evidence-vault -> 308 /apps/evidence-vault/
/apps/evidence-vault/ -> Evidence Vault
/ -> BloomBouquet
```

- [ ] **Step 8: Verify unauthenticated public path and assets**

Run from an external runner:

```bash
curl -fsS https://bloombouquet.https.gsmsv.site/apps/evidence-vault/ | grep -q '증빙함'
curl -fsS https://bloombouquet.https.gsmsv.site/apps/evidence-vault/api/health | grep -q '"service":"evidence-vault"'
```

Extract one `/_next/` asset URL from the returned HTML and require its public path to begin `/apps/evidence-vault/_next/` and return HTTP `200`.

- [ ] **Step 9: Verify OAuth start contract before interactive login**

Request:

```text
GET https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/start?returnTo=/dashboard
```

Expected `Location` origin: `https://bloombouquet.https.gsmsv.site` with `mode=auth`, expected `client_id`, new path-hosted `redirect_uri`, PKCE state/challenge, and no project session token in the URL.

- [ ] **Step 10: Perform real owner/user OAuth E2E**

From Evidence Vault, choose `꽃다발로 로그인`; complete provider login/consent through the normal UI.

Expected callback lands at:

```text
https://bloombouquet.https.gsmsv.site/apps/evidence-vault/dashboard
```

and session probe:

```text
GET /apps/evidence-vault/auth/session -> authenticated user
```

Browser cookie inspection must show `ev_session` Path `/apps/evidence-vault` and no readable token in local/session storage.

- [ ] **Step 11: Resume evaluator worker only after Steps 8-10 pass**

Start `bloom-worker` from `/home/ubuntu/bloombouquet`, verify health, then observe the migration Run.

Expected lifecycle:

```text
QUEUED -> RUNNING -> COMPLETED
```

and final response contains score/stars/summary plus required independent role evaluations.

---

### Task 8: Point the launcher at the canonical project URL and remove the standalone domain

**Files / Systems:**
- BloomBouquet Submission/project public data
- BloomBouquet public launcher
- GSM-SV HTTPS domain configuration
- Evidence Vault legacy Nginx standalone host config after GSM-SV removal

**Interfaces:**
- Consumes: completed path-hosted Submission and successful OAuth/evaluation E2E.
- Produces: one public BloomBouquet domain hosting launcher + Evidence Vault path, with no standalone Evidence Vault external domain.

- [ ] **Step 1: Verify the public project card uses the new Submission demo URL**

Fetch public project list and require Evidence Vault latest submission:

```text
https://bloombouquet.https.gsmsv.site/apps/evidence-vault/
```

Open the launcher and confirm project action navigates same-tab to that path.

- [ ] **Step 2: Run final pre-delete E2E matrix**

Require all:

```text
BloomBouquet / -> 200 + BloomBouquet title
/apps/evidence-vault/ -> 200 + Evidence Vault marker
/apps/evidence-vault/api/health -> 200
OAuth start -> Bouquet provider
OAuth callback -> /apps/evidence-vault/dashboard
auth/session -> authenticated after login
evaluation Run -> COMPLETED
```

- [ ] **Step 3: User deletes only `evidence-vault.https.gsmsv.site` in GSM-SV**

This is the final manual owner UI action if no authenticated GSM-SV browser is connected. Keep `bloombouquet.https.gsmsv.site`.

- [ ] **Step 4: Verify standalone hostname is no longer a usable application route while canonical path stays healthy**

Canonical path must still PASS all smoke checks after deletion.

- [ ] **Step 5: Remove or disable the obsolete standalone Evidence Vault Nginx host config on the VM**

Only after GSM-SV deletion and canonical path health. Run `nginx -t` before reload.

- [ ] **Step 6: Update operational documentation/pattern**

Document the reusable requirements for future projects:

```text
unique slug
unique loopback port
app basePath=/apps/<slug>
path-scoped project cookies
one static Nginx mapping
project-internal Bouquet login
canonical Submission demoUrl under BloomBouquet origin
```

Commit documentation with:

```bash
git commit -m "docs: document BloomBouquet project app hosting"
```

- [ ] **Step 7: Final verification before completion claim**

Re-run fresh public smoke and inspect PM2/Nginx state. Do not claim the migration complete unless Evidence Vault path, OAuth session, launcher link, and evaluator Run are all proven after the standalone domain removal.
