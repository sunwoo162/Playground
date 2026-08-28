# Luna → BloomBouquet One-Click Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a completed Luna Agent System project into a BloomBouquet Team/Project/Submission/Evaluation Run with one owner confirmation click instead of three manual forms.

**Architecture:** The headless Luna runtime builds a versioned base64url registration payload and persists a durable BloomBouquet management handoff URL on `BuilderProject` at worker completion. `BouquetManageApp` detects that handoff, renders a single confirmation card, and POSTs the untrusted payload to a new owner-authenticated transactional BloomBouquet endpoint that re-validates and idempotently creates/reuses Team and Project before publishing the Submission and queuing evaluation.

**Tech Stack:** TypeScript runtime, React/Vite, Spring Boot 3 / Java 17, Spring Security, JPA/Hibernate, MySQL, Node policy tests, JUnit/Spring Boot E2E.

**Spec:** `docs/superpowers/specs/2026-08-28-luna-bloombouquet-one-click-registration-design.md`

## Global Constraints

- Manual Team → Project → Submission management must remain available.
- The Luna URL payload is convenience data, never authorization.
- `POST /api/bloom-bouquet/luna/register` accepts only dedicated 꽃다발 session authentication and derives owner ID server-side.
- No token, password, OAuth code, worker token, session cookie, or environment secret may appear in the handoff URL.
- Registration must be idempotent for an identical owner/team/project/version payload.
- Conflicting reuse of the same project/version must fail rather than overwrite publication data.
- Shared-auth callback validation remains authoritative in `BloomBouquetService`.
- Existing evaluator claim/heartbeat/completion architecture is unchanged.

---

### Task 1: Luna registration payload and durable Builder handoff

**Files:**
- Create: `bloom-runtime/ts/bloomBouquetRegistration.ts`
- Create: `bloom-runtime/ts/bloomBouquetRegistration.policy-test.ts`
- Modify: `bloom-runtime/ts/headlessBuilderExecutor.ts`
- Modify: `bloom-runtime/ts/builderWorkerAdapter.ts`
- Modify: `bloom-worker/run.js`
- Modify: `backend/src/main/java/com/playground/domain/builder/entity/BuilderProject.java`
- Modify: `backend/src/main/java/com/playground/domain/builder/dto/BuilderProjectDto.java`
- Modify: `backend/src/main/java/com/playground/domain/builder/dto/BuilderWorkerDto.java`
- Modify: `backend/src/main/java/com/playground/domain/builder/service/BuilderProjectService.java`
- Modify: `backend/src/main/java/com/playground/domain/builder/service/BuilderWorkerRunService.java`
- Test: `backend/src/test/java/com/playground/domain/builder/service/BuilderWorkerRunServiceTest.java`

**Interfaces:**
- Produces TS type `LunaBloomBouquetRegistrationPayload` and function `buildBloomBouquetRegistrationUrl(input): string | null`.
- Extends `BuilderWorkerExecutionResult` with `bloomBouquetRegistrationUrl: string | null`.
- Extends worker completion JSON with `bloomBouquetRegistrationUrl`.
- Persists `BuilderProject.bloomBouquetRegistrationUrl` and exposes it through `BuilderProjectDto.Response`.

- [ ] **Step 1: Write runtime RED tests**

Cover Korean UTF-8 round trip, canonical five-team IDs, callback join behavior, GitHub repository URL generation, and refusal when preview/repository/plan inputs are missing.

Expected contract example:

```ts
const url = buildBloomBouquetRegistrationUrl({
  teamId: "lily",
  teamName: "백합",
  projectName: "증빙함",
  projectSlug: "evidence-vault",
  description: "증빙 자료를 관리하는 서비스",
  repositoryFullName: "BloomBouquet/evidence-vault",
  demoUrl: "https://bloombouquet.https.gsmsv.site/apps/evidence-vault/",
  requiresAuth: true,
});
assert.match(url!, /\?mode=manage&luna=/);
```

- [ ] **Step 2: Run runtime policy tests and confirm RED**

Run the existing Bloom runtime policy suite plus the new file. Expected: failure because the builder function/result field does not exist.

- [ ] **Step 3: Implement payload builder**

Use `TextEncoder` + base64url-safe encoding, schema version 1, `1.0.0`, repository URL `https://github.com/<fullName>`, and auth callback `<demoUrl-trailing-slash-trimmed>/auth/bouquet/callback`.

Reject unknown team IDs and empty repository/demo/project names by returning `null` or throwing for programmer-contract violations as fixed by the tests.

- [ ] **Step 4: Wire headless completion**

At successful executor completion use `payload.plan`, `payload.repository`, `options.teamId`, `teamName`, `claim.previewUrl`, and `payload.plan.needsAuth || claim.authRequired` to create the durable handoff URL.

Return:

```ts
{
  repositoryFullName: payload.repository.repository,
  previewUrl: claim.previewUrl,
  bloomBouquetRegistrationUrl,
}
```

Update `bloom-worker/run.js` client completion request body accordingly.

- [ ] **Step 5: Persist backend handoff URL**

Add nullable entity column length 6000. Extend DTOs/service mapping and `BuilderWorkerRunService.complete(...)` to normalize/store the URL when supplied.

- [ ] **Step 6: Add backend completion tests**

Prove completion persists repository, preview URL, and registration URL; repeated same-worker completion remains idempotent; null registration URLs keep legacy behavior.

- [ ] **Step 7: Run focused runtime/backend tests**

Run TS policy tests and Builder worker service tests. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat: persist Luna BloomBouquet registration handoff"
```

---

### Task 2: Transactional owner one-click registration API

**Files:**
- Modify: `backend/src/main/java/com/playground/domain/bloombouquet/dto/BloomBouquetDto.java`
- Modify: `backend/src/main/java/com/playground/domain/bloombouquet/controller/BloomBouquetController.java`
- Modify: `backend/src/main/java/com/playground/domain/bloombouquet/service/BloomBouquetService.java`
- Modify: `backend/src/main/java/com/playground/domain/bloombouquet/repository/BloomBouquetTeamRepository.java` if owner+slug lookup is missing
- Modify: `backend/src/main/java/com/playground/domain/bloombouquet/repository/BloomBouquetProjectRepository.java` if team+slug lookup is missing
- Modify: `backend/src/main/java/com/playground/domain/bloombouquet/repository/BloomBouquetSubmissionRepository.java` if project+version lookup is missing
- Test: `backend/src/test/java/com/playground/domain/bloombouquet/BloomBouquetProjectRegistrationE2ETest.java`

**Interfaces:**
- Consumes JSON `LunaRegistrationRequest` matching schema version 1 payload fields.
- Produces `LunaRegistrationResponse { team, project, submission }`.
- Endpoint: `POST /api/bloom-bouquet/luna/register` authenticated by `BouquetAuthenticationToken` only.

- [ ] **Step 1: Extend E2E tests with RED one-click flow**

Create/login a 꽃다발 account, POST a lily registration payload, and assert:

```java
.andExpect(status().isCreated())
.andExpect(jsonPath("$.team.name").value("백합"))
.andExpect(jsonPath("$.project.slug").value("evidence-vault"))
.andExpect(jsonPath("$.submission.evaluationStatus").value("QUEUED"))
.andExpect(jsonPath("$.submission.bouquetClientId").isNotEmpty());
```

Also test repeated identical POST returns same Submission/Run, and same version with a changed demo URL is rejected.

- [ ] **Step 2: Run the focused E2E test and confirm RED**

Expected: 404/no endpoint.

- [ ] **Step 3: Add DTO contract**

`LunaRegistrationRequest` fields exactly mirror the spec. `LunaRegistrationResponse` wraps existing Team/Project/Submission response types.

- [ ] **Step 4: Add owner-only controller route**

Controller signature must accept `@AuthenticationPrincipal BouquetAuthenticationToken auth`; do not accept legacy JWT for this route.

- [ ] **Step 5: Implement transactional registration**

Inside `BloomBouquetService`:

- canonical map: `rose→장미`, `lily→백합`, `tulip→튤립`, `sunflower→해바라기`, `cherry-blossom→벚꽃`;
- require request team name to match canonical name after trim;
- find/create owner Team by canonical slug/team ID;
- find/create project by Team + normalized project slug;
- when same version exists, compare demo URL, repo URLs, auth flag, and redirect URI; return existing only if identical;
- otherwise reuse the existing publication validation/OAuth/queue logic rather than maintaining a second weaker implementation.

Refactor `publishSubmission` only as needed to share one private transaction-safe publication helper.

- [ ] **Step 6: Verify auth and idempotency tests**

Add explicit unauthenticated and legacy-JWT-only rejection cases. Run the E2E test. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: add one-click Luna BloomBouquet registration"
```

---

### Task 3: Luna confirmation mode in BloomBouquet management UI

**Files:**
- Create: `bloom-web/src/app/luna-registration.ts`
- Modify: `bloom-web/src/app/BouquetManageApp.tsx`
- Modify: `bloom-web/src/app/bouquet-manage.css`
- Modify/Test: `scripts/bloom-management.policy-test.js`

**Interfaces:**
- `parseLunaRegistration(search: string): LunaRegistrationPayload | null` parses base64url UTF-8 JSON with schema version 1 and safe primitive type checks.
- Luna mode POSTs payload to `/api/bloom-bouquet/luna/register` with `credentials: 'include'`.

- [ ] **Step 1: Add RED management policy assertions**

Require source references to `mode=manage`, `luna`, `/api/bloom-bouquet/luna/register`, one-click Korean CTA, and continued absence of `/internal/builder/worker/`.

- [ ] **Step 2: Run production runtime policy and confirm RED**

Expected: missing Luna registration UI/parser.

- [ ] **Step 3: Implement safe payload parser**

Decode base64url using browser APIs and `TextDecoder`, catch malformed input, validate `schemaVersion === 1`, booleans/strings/team ID, and return `null` on failure.

- [ ] **Step 4: Render compact confirmation surface**

When `luna` exists and session user is authenticated, do not render Team/Project/Submission forms first. Render project summary and one primary CTA:

```text
BloomBouquet에 등록하고 평가 시작
```

Secondary CTA switches to the manual forms.

- [ ] **Step 5: Wire one-click POST and success state**

Reuse existing `api()` wrapper. On success show Run ID/status/client ID and public gallery link. Preserve `luna` query parameter through login-required return so the owner does not lose the handoff.

- [ ] **Step 6: Run web build + production policy**

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: simplify Luna project registration UI"
```

---

### Task 4: Full regression and PR

**Files:**
- Modify: PR body only after verification; no product-code changes unless a failing test exposes a real defect.

- [ ] **Step 1: Run repository Harness-equivalent verification**

Required gates: Bloom web build, production runtime policy, backend protocol/E2E tests, Luna desktop build, Bloom agent runtime policies, headless worker build, Rust/Tauri checks, harness invariants.

- [ ] **Step 2: Review security invariants**

Confirm no handoff URL contains credentials/secrets; one-click endpoint requires `BouquetAuthenticationToken`; manual management still functions; internal worker routes are absent from React code; duplicate click does not enqueue a second evaluation.

- [ ] **Step 3: Open Draft PR with required format**

Title:

```text
feat : Luna 프로젝트 BloomBouquet 간편 등록 추가
```

Use the repository-required PR section order exactly.

- [ ] **Step 4: Wait for Harness on exact head and fix only evidenced failures**

Expected: full PASS.

- [ ] **Step 5: Mark ready and merge exact verified head**

Do not run the manual Nginx app-gateway cutover as part of this feature.
