# BloomBouquet Project Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in 꽃다발 account create/manage BloomBouquet teams and projects, publish a submission, and enqueue the existing production evaluator through the normal product path.

**Architecture:** Add a dedicated Spring Security authentication type resolved from the existing HttpOnly `bouquet_session` cookie, keep worker/JWT auth paths intact, and restrict non-public BloomBouquet owner APIs to that bouquet identity. Add a dedicated `?mode=manage` React surface that uses same-origin cookie-authenticated API calls for Team -> Project -> Submission and then returns to the public evaluation surface.

**Tech Stack:** Java 17, Spring Boot 3.3, Spring Security, Spring MVC/MockMvc, React 19, TypeScript 5.7, Vite 6, Node 22 policy tests.

**Spec:** `docs/superpowers/specs/2026-08-28-bloombouquet-project-management-design.md`

## Global Constraints

- `bouquet_session` remains HttpOnly, Secure, SameSite=Lax, path `/`; React never receives its value.
- BloomBouquet owner identity comes only from the validated server-side 꽃다발 session; request bodies never accept `ownerId`.
- `/api/bloom-bouquet/public/**` remains anonymous.
- `/internal/builder/worker/**` remains worker-token-only and management code never references it.
- Legacy JWT auth remains available outside BloomBouquet ownership flows, but a JWT principal must not become a BloomBouquet owner.
- Existing worker lease/heartbeat/evaluator logic is unchanged.
- No database migration, delete endpoint, evaluator retry/cancel control, admin impersonation, or direct production DB seeding.
- Management requests use same-origin relative paths and `credentials: 'include'`; no auth/session token is stored in Local Storage or Session Storage.
- `return_to` accepts only the symbolic `manage` target, never an arbitrary URL.
- Use TDD RED -> GREEN and English commit messages.

---

### Task 1: Add the bouquet-session Spring Security bridge

**Files:**
- Create: `backend/src/main/java/com/playground/config/BouquetAuthenticationToken.java`
- Create: `backend/src/main/java/com/playground/config/BouquetSessionAuthFilter.java`
- Modify: `backend/src/main/java/com/playground/config/JwtAuthFilter.java`
- Modify: `backend/src/main/java/com/playground/config/SecurityConfig.java`
- Test: `backend/src/test/java/com/playground/domain/bloombouquet/BloomBouquetProjectRegistrationE2ETest.java`

**Interfaces:**
- Consumes: `BouquetAuthService.resolveSession(String)` and cookie name `BouquetAuthController.SESSION_COOKIE`.
- Produces: `BouquetAuthenticationToken#getAccountId()`, `getEmail()`, `getDisplayName()`, `ROLE_BOUQUET_USER`; valid bouquet cookie is represented in the Spring `SecurityContext`.

- [ ] **Step 1: Write the failing authentication E2E assertions**

Change the registration E2E setup to obtain a real bouquet cookie through signup and prove the current owner endpoint cannot yet use it. The helper shape is:

```java
private Cookie signUpBouquetAccount(String email, String displayName) throws Exception {
    MvcResult result = mockMvc.perform(post("/api/bouquet/auth/signup")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""
                            {"email":"%s","password":"password-1234","displayName":"%s"}
                            """.formatted(email, displayName)))
            .andExpect(status().isCreated())
            .andReturn();
    return Arrays.stream(result.getResponse().getCookies())
            .filter(cookie -> BouquetAuthController.SESSION_COOKIE.equals(cookie.getName()))
            .findFirst()
            .orElseThrow();
}
```

Primary owner writes then use `.cookie(ownerCookie)` instead of `.with(authentication(new JwtAuthenticationToken(...)))`. Add separate assertions that no cookie returns 401 and a legacy `JwtAuthenticationToken` returns 403 for a non-public BloomBouquet owner endpoint.

- [ ] **Step 2: Run the focused backend test and verify RED**

Run:

```bash
bash backend/gradlew -p backend test --tests com.playground.domain.bloombouquet.BloomBouquetProjectRegistrationE2ETest --no-daemon
```

Expected: FAIL because `bouquet_session` is not yet converted into an authenticated BloomBouquet owner.

- [ ] **Step 3: Implement the dedicated authentication token**

Create `BouquetAuthenticationToken` extending `AbstractAuthenticationToken` with exactly one authority, `ROLE_BOUQUET_USER`, stable account id, email, display name, null credentials, `getPrincipal()` returning `this`, and `getName()` returning account id.

Core shape:

```java
public final class BouquetAuthenticationToken extends AbstractAuthenticationToken {
    private final String accountId;
    private final String email;
    private final String displayName;

    public BouquetAuthenticationToken(String accountId, String email, String displayName) {
        super(List.of(new SimpleGrantedAuthority("ROLE_BOUQUET_USER")));
        this.accountId = accountId;
        this.email = email;
        this.displayName = displayName;
        setAuthenticated(true);
    }

    public String getAccountId() { return accountId; }
    public String getEmail() { return email; }
    public String getDisplayName() { return displayName; }
    @Override public Object getCredentials() { return null; }
    @Override public Object getPrincipal() { return this; }
    @Override public String getName() { return accountId; }
}
```

- [ ] **Step 4: Implement the bouquet session filter and filter-order protection**

`BouquetSessionAuthFilter` must:

```java
Authentication existing = SecurityContextHolder.getContext().getAuthentication();
if (existing != null && existing.isAuthenticated()) {
    filterChain.doFilter(request, response);
    return;
}
```

Read only the exact `bouquet_session` cookie, call `resolveSession`, and set `BouquetAuthenticationToken` only on a valid session. Invalid/missing cookies continue unauthenticated.

Modify `JwtAuthFilter` with the same existing-auth early return so a valid bouquet/worker authentication is never overwritten if a legacy JWT cookie/header also exists.

- [ ] **Step 5: Restrict BloomBouquet owner APIs in SecurityConfig**

Order authorization matchers so public paths stay anonymous and owner paths require bouquet role:

```java
.requestMatchers("/api/bloom-bouquet/public/**").permitAll()
.requestMatchers("/api/bloom-bouquet/**").hasRole("BOUQUET_USER")
.requestMatchers("/api/bouquet/**").permitAll()
```

Register filters in this order before username/password authentication:

```java
.addFilterBefore(builderWorkerTokenFilter, JwtAuthFilter.class)
.addFilterBefore(bouquetSessionAuthFilter, JwtAuthFilter.class)
.addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
```

The resulting chain must preserve `/internal/builder/worker/**` behavior and bouquet auth endpoints.

- [ ] **Step 6: Re-run focused backend test and verify GREEN**

Run the same focused Gradle command. Expected: bouquet cookie owner flow passes; anonymous owner write is 401; legacy JWT owner write is 403.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/playground/config backend/src/test/java/com/playground/domain/bloombouquet/BloomBouquetProjectRegistrationE2ETest.java
git commit -m "feat: authenticate BloomBouquet owners with bouquet sessions"
```

---

### Task 2: Add owner-scoped project listing and migrate owner controllers

**Files:**
- Modify: `backend/src/main/java/com/playground/domain/bloombouquet/service/BloomBouquetService.java`
- Modify: `backend/src/main/java/com/playground/domain/bloombouquet/controller/BloomBouquetController.java`
- Test: `backend/src/test/java/com/playground/domain/bloombouquet/BloomBouquetProjectRegistrationE2ETest.java`

**Interfaces:**
- Consumes: `BloomBouquetProjectRepository.findByTeam_OwnerIdOrderByUpdatedAtDesc(String)` which already exists.
- Produces: `GET /api/bloom-bouquet/projects -> List<ProjectResponse>` for the authenticated bouquet owner; all owner controller methods derive `ownerId` from `BouquetAuthenticationToken#getAccountId()`.

- [ ] **Step 1: Add RED assertions for owner project listing/isolation**

After creating an unpublished project, assert:

```java
mockMvc.perform(get("/api/bloom-bouquet/projects").cookie(ownerCookie))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$[0].id").value(projectId))
    .andExpect(jsonPath("$[0].published").value(false));
```

Create a second bouquet account and assert its `GET /projects` response does not contain the first owner’s project.

- [ ] **Step 2: Run focused backend test and verify RED**

Expected: 404/405 because owner project listing does not yet exist.

- [ ] **Step 3: Implement `listProjects(ownerId)`**

Add:

```java
@Transactional(readOnly = true)
public List<BloomBouquetDto.ProjectResponse> listProjects(String ownerId) {
    return projectRepository.findByTeam_OwnerIdOrderByUpdatedAtDesc(ownerId).stream()
            .map(this::toProjectResponse)
            .toList();
}
```

- [ ] **Step 4: Migrate controller ownership to BouquetAuthenticationToken**

Replace all non-public owner method principals with `BouquetAuthenticationToken`. Add:

```java
@GetMapping("/projects")
public ResponseEntity<List<BloomBouquetDto.ProjectResponse>> listProjects(
        @AuthenticationPrincipal BouquetAuthenticationToken auth
) {
    return ResponseEntity.ok(service.listProjects(auth.getAccountId()));
}
```

Team creation/listing, project creation, and submission publishing must all use `auth.getAccountId()`.

- [ ] **Step 5: Re-run focused test and full backend suite**

Run:

```bash
bash backend/gradlew -p backend test --tests com.playground.domain.bloombouquet.BloomBouquetProjectRegistrationE2ETest --no-daemon
bash backend/gradlew -p backend test --no-daemon
```

Expected: both PASS; worker claim/heartbeat assertions in the existing E2E still pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/playground/domain/bloombouquet backend/src/test/java/com/playground/domain/bloombouquet/BloomBouquetProjectRegistrationE2ETest.java
git commit -m "feat: add owner project management API"
```

---

### Task 3: Add the management UI and safe auth return flow

**Files:**
- Create: `bloom-web/src/app/BouquetManageApp.tsx`
- Create: `bloom-web/src/app/bouquet-manage.css`
- Create: `scripts/bloom-management.policy-test.js`
- Modify: `bloom-web/src/app/BloomApp.tsx`
- Modify: `bloom-web/src/app/BouquetAuthApp.tsx`
- Modify: `bloom-web/src/app/BouquetShowcaseApp.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: `GET /api/bouquet/auth/me`, `GET/POST /api/bloom-bouquet/teams`, `GET/POST /api/bloom-bouquet/projects`, `POST /api/bloom-bouquet/projects/{id}/submissions`.
- Produces: `?mode=manage` owner UI, safe `?mode=auth&return_to=manage` login round-trip, success state with `evaluationRunId` and `QUEUED`.

- [ ] **Step 1: Write the RED source-policy test**

Create a Node test that reads management/auth/router source and asserts all load-bearing product/security invariants. Example assertions:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const manage = fs.readFileSync('bloom-web/src/app/BouquetManageApp.tsx', 'utf8');
const app = fs.readFileSync('bloom-web/src/app/BloomApp.tsx', 'utf8');
const auth = fs.readFileSync('bloom-web/src/app/BouquetAuthApp.tsx', 'utf8');

test('Bloom management uses bouquet cookie APIs only', () => {
  assert.match(app, /mode === ['"]manage['"]/);
  assert.match(manage, /credentials:\s*['"]include['"]/);
  assert.match(manage, /\/api\/bloom-bouquet\/teams/);
  assert.match(manage, /\/api\/bloom-bouquet\/projects/);
  assert.doesNotMatch(manage, /\/internal\/builder\/worker\//);
  assert.doesNotMatch(manage, /localStorage|sessionStorage/);
});

test('auth return target is symbolic and allowlisted', () => {
  assert.match(auth, /return_to/);
  assert.match(auth, /manage/);
  assert.doesNotMatch(auth, /window\.location\.assign\(return/);
});
```

Add it to `test:production-runtime`:

```json
"test:production-runtime": "node --test scripts/production-runtime.policy-test.js bloom-worker/run.policy-test.js scripts/bloom-management.policy-test.js"
```

- [ ] **Step 2: Run policy test and verify RED**

Run:

```bash
pnpm run test:production-runtime
```

Expected: FAIL because management source/router does not exist.

- [ ] **Step 3: Route `?mode=manage` in BloomApp**

Import `BouquetManageApp`, derive `const bouquetManage = mode === 'manage'`, set document title to `BloomBouquet 프로젝트 관리`, return management before public showcase, and keep auth/builder behavior unchanged.

- [ ] **Step 4: Implement the session gate and reusable API helper**

`BouquetManageApp` first calls `/api/bouquet/auth/me` with `credentials: 'include'`. If `user` is null, render only a login-required state and link:

```tsx
<a href="?mode=auth&return_to=manage">꽃다발 로그인</a>
```

All owner fetches use a helper equivalent to:

```ts
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (response.status === 401 || response.status === 403) throw new Error('login_required');
  if (!response.ok) throw new Error((await response.text()).trim() || `HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
```

Never store or read auth tokens in browser storage.

- [ ] **Step 5: Implement Team -> Project -> Submission workflow**

On authenticated load fetch teams and owner projects in parallel. UI behavior:

1. Team selector plus create form `{name, slug}`.
2. Project selector filtered by selected `teamId` plus create form `{teamId, name, slug, description}`.
3. Submission form `{version, demoUrl, frontendRepositoryUrl, backendRepositoryUrl, requiresAuth, authRedirectUri}`.
4. If `requiresAuth` is false, send `authRedirectUri: null` or omit it. If true, require it in the browser before POST.
5. On success require `evaluationRunId != null` and `evaluationStatus === 'QUEUED'`; otherwise show an error instead of claiming success.
6. Success panel shows Run id/status and links to `/` for public tracking.

Keep entered form values on 400 errors; clear only the entity form that succeeds.

- [ ] **Step 6: Implement safe return flow in BouquetAuthApp**

Read `return_to` from query params and normalize strictly:

```ts
const returnTarget = params.get('return_to') === 'manage' ? 'manage' : null;
```

When a non-OAuth user is signed in and `returnTarget === 'manage'`, render a direct anchor `href="?mode=manage"`. Do not accept or assign arbitrary URLs from `return_to`.

- [ ] **Step 7: Add a public management entry point**

Add a small `프로젝트 관리` link in `BouquetShowcaseApp` pointing to `?mode=manage`. Do not embed form logic into the showcase component.

- [ ] **Step 8: Add management styles**

Use existing BloomBouquet visual language: centered shell, clear three-stage cards, responsive single-column layout on narrow widths, native labels/inputs/buttons, visible disabled/loading/error states. No external UI dependency.

- [ ] **Step 9: Run policy and web build GREEN**

Run:

```bash
pnpm run test:production-runtime
pnpm run build:bloom-web
```

Expected: PASS, including TypeScript noEmit and Vite production build.

- [ ] **Step 10: Commit**

```bash
git add bloom-web/src/app scripts/bloom-management.policy-test.js package.json
git commit -m "feat: add BloomBouquet project management UI"
```

---

### Task 4: Integration verification and PR readiness

**Files:**
- Modify only if tests expose a real defect; do not broaden scope.
- Verify: entire feature branch against spec.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: one merge-ready PR and a production path capable of creating the first real evaluator Run.

- [ ] **Step 1: Run focused security/product checks**

Verify all of these with automated tests/source review:

```text
bouquet cookie -> owner APIs: allowed
no cookie -> owner APIs: 401
legacy JWT -> owner APIs: 403
public BloomBouquet reads: anonymous
worker endpoints: unchanged
management code -> no /internal/builder/worker reference
management code -> no Local/Session Storage auth tokens
return_to -> only manage
```

- [ ] **Step 2: Run full repository verification available before PR**

Run:

```bash
pnpm install --frozen-lockfile
pnpm run build:bloom-web
pnpm run test:production-runtime
bash backend/gradlew -p backend test --no-daemon
pnpm --dir apps/desktop run build
pnpm run test:bloom-runtime
pnpm run build:bloom-worker
pnpm run harness
```

Expected: all PASS.

- [ ] **Step 3: Review branch diff against the spec**

Confirm no DB migration, delete endpoint, evaluator control, token exposure, direct DB test path, or legacy JWT owner fallback was introduced. Confirm `GET /api/bloom-bouquet/projects` is owner-scoped and includes unpublished projects so refresh works.

- [ ] **Step 4: Open the PR using the repository-required template**

Title:

```text
feat : BloomBouquet 프로젝트 관리 기능 추가
```

Body must use the exact required section order:

```markdown
# ✨ PR 내용

## 📝 코드 변경 사항
- 꽃다발 세션 기반 BloomBouquet owner 인증과 프로젝트 관리 화면을 추가했습니다.

## 💡 변경 이유
- production에서 정상 사용자 경로로 Team/Project/Submission을 등록하고 evaluator E2E를 수행할 수 있도록 하기 위함입니다.

## 🛠️ 구현 방법
- bouquet_session을 Spring Security Authentication으로 연결하고, owner API와 ?mode=manage UI를 기존 등록 API에 연결했습니다.

## 📌 영향 범위
- BloomBouquet owner API 인증, Bloom web 관리/로그인/공개 갤러리 내비게이션에 영향을 줍니다.

## ✅ 테스트
- backend 전체 테스트, Bloom web build, production/runtime policy, Bloom runtime/worker build를 검증합니다.

**테스트 결과 / 참고 사항**
- Harness 결과와 production E2E 결과를 최종 반영합니다.

## 🌿 반영 브랜치
- main
```

- [ ] **Step 5: Wait for Harness and fix only proven failures**

The GitHub Harness must pass production runtime policy, backend, Bloom runtime, worker, desktop, Rust/Tauri, and invariants before merge.

- [ ] **Step 6: Merge and verify deployment**

After merge, confirm `Deploy to Server`, the existing Bloom evaluator deployment/inference smoke, and main Harness succeed on the merge SHA.

- [ ] **Step 7: Perform the first real production evaluator E2E**

Using the actual UI:

```text
?mode=auth -> sign in
?mode=manage -> create/select Team
create/select Project
publish one real Submission with reachable demo URL and public repo URL(s) when available
```

Observe public/API states and worker evidence in order:

```text
QUEUED -> RUNNING -> COMPLETED
```

Acceptance requires persisted required Agent evaluations plus non-null aggregate `overallScore`, `overallStars`, and `reportSummary`. This is observation of the existing evaluator, not a manual evaluator trigger.
