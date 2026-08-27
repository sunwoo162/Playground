# Evidence Vault MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-shaped MVP of `증빙함` as an independent responsive web app that lets authenticated users register purchases/contracts, track user-entered deadlines, privately preserve evidence, organize dispute-preparation cases, and export neutral evidence packets without providing legal judgments.

**Architecture:** `evidence-vault/` is an isolated Next.js 16 deployable unit inside the Playground repository. The app uses server-side Route Handlers and domain services, PostgreSQL via Drizzle, an opaque server-owned session after 꽃다발 OAuth Authorization Code + PKCE S256, and a storage adapter whose production implementation uses a private S3-compatible bucket. Domain modules remain independent from framework/UI code so authorization, storage, and export behavior can be tested separately.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, TypeScript 5.8+, Zod 4.4.3, Drizzle ORM 0.45.2, PostgreSQL (`pg` 8.23.0), AWS SDK v3 S3 client, Vitest, Testing Library, Playwright, Tailwind CSS, PDFKit, Archiver.

**Spec:** `docs/superpowers/specs/2026-08-27-evidence-vault-design.md`

## Global Constraints

- Public product name is `증빙함`; internal slug is `evidence-vault`.
- Product must not provide individualized legal advice, legal conclusions, refund/win probability, legal representation, or legal-demand drafting.
- Required disclaimer: `증빙함은 사용자가 입력한 사실과 첨부 자료를 정리하는 도구입니다. 개별 사건에 대한 법률 판단, 법률상담 또는 법률대리를 제공하지 않습니다.`
- All evidence is private by default; no public evidence feed or permanent public object URL.
- SHA-256 is described only as an integrity fingerprint; never as proof of authenticity, admissibility, notarization, or evidentiary weight.
- MVP supports users aged 14 or older and excludes medical/health dispute categories.
- Allowed upload types: PDF, JPEG, PNG, WEBP. Maximum file size: 20 MiB per file.
- Signed download URLs expire after 5 minutes.
- 꽃다발 is the only credential system. No app-owned email/password registration or password store.
- 꽃다발 flow uses Authorization Code + PKCE S256 and server-side code exchange; access token/code/verifier must never reach browser persistence or application logs.
- Production object storage must be private S3-compatible storage, preferably in a Korean region.
- No OCR or AI provider reads user evidence in MVP.
- A neutral case summary may only be assembled from explicit user-entered factual fields/templates.
- Export is a ZIP containing `summary.pdf`, `manifest.json`, and selected `evidence/*` attachments.
- Every server query for a user-owned entity is scoped by authenticated user ID.
- Cross-user object access must have an automated negative test.
- The app must include empty/loading/error/permission states, local run instructions, build instructions, production blockers, and `.env.example`.

---

## Task DAG

```text
T1 Foundation
 ├─> T2 Domain + validation
 ├─> T3 Persistence schema
 └─> T4 꽃다발 auth/session

T2 + T3 + T4 -> T5 Vault dashboard/CRUD
T3 + T4 + T5 -> T6 Evidence upload/storage
T2 + T3 + T4 + T5 -> T7 Case mode/checklists
T3 + T4 + T6 + T7 -> T8 Export packet
T3 + T4 + T6 + T7 + T8 -> T9 Privacy/security/deletion
T5 + T6 + T7 + T8 + T9 -> T10 UX/PWA/docs/final verification
```

### Role branches

- Orchestrator baseline: `evidence-vault/orchestrator`
- Frontend: `evidence-vault/frontend`
- Backend: `evidence-vault/backend`
- Security: `evidence-vault/security`
- DevOps/Infra: `evidence-vault/devops`
- Documentation: `evidence-vault/docs`

Each role owns its judgment. Security and Code Review findings are inputs, not commands; the implementing Agent must independently evaluate them and record the reason for any disagreement.

---

### Task 1: Project Foundation and Product Shell

**Role:** Orchestrator + Frontend + DevOps

**Files:**
- Create: `evidence-vault/package.json`
- Create: `evidence-vault/tsconfig.json`
- Create: `evidence-vault/next.config.ts`
- Create: `evidence-vault/postcss.config.mjs`
- Create: `evidence-vault/app/globals.css`
- Create: `evidence-vault/app/layout.tsx`
- Create: `evidence-vault/app/page.tsx`
- Create: `evidence-vault/app/api/health/route.ts`
- Create: `evidence-vault/src/components/legal-disclaimer.tsx`
- Create: `evidence-vault/.env.example`
- Create: `evidence-vault/PRODUCT.md`
- Create: `evidence-vault/vitest.config.ts`
- Create: `evidence-vault/src/test/setup.ts`

**Interfaces:**
- Produces: Next application root, shared disclaimer component, health endpoint `GET /api/health -> { ok: true, service: "evidence-vault" }`, environment variable contract.
- Consumes: repository product build protocol and approved Evidence Vault spec.

- [ ] **Step 1: Write the initial health route test**

Create `evidence-vault/src/app-health.test.ts` that imports a pure helper from `src/server/health.ts` and asserts exact service identity:

```ts
import { describe, expect, it } from "vitest";
import { healthPayload } from "./server/health";

describe("healthPayload", () => {
  it("identifies the Evidence Vault service", () => {
    expect(healthPayload()).toEqual({ ok: true, service: "evidence-vault" });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- --run src/app-health.test.ts`
Expected: FAIL because `src/server/health.ts` does not exist.

- [ ] **Step 3: Scaffold the application and minimal helper**

Create `src/server/health.ts`:

```ts
export function healthPayload() {
  return { ok: true as const, service: "evidence-vault" as const };
}
```

`app/api/health/route.ts` returns `Response.json(healthPayload())`. The landing page explains the core job, shows `꽃다발로 로그인`, and renders the required legal disclaimer. No fake login form.

- [ ] **Step 4: Verify foundation**

Run: `npm test -- --run src/app-health.test.ts`
Run: `npm run build`
Expected: test PASS and Next production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add evidence-vault
git commit -m "feat: scaffold evidence vault app"
```

---

### Task 2: Domain Types, Validation, and Deadline Semantics

**Role:** Backend + Frontend

**Files:**
- Create: `evidence-vault/src/domain/categories.ts`
- Create: `evidence-vault/src/domain/vault-item.ts`
- Create: `evidence-vault/src/domain/deadline.ts`
- Create: `evidence-vault/src/domain/evidence.ts`
- Create: `evidence-vault/src/domain/case.ts`
- Create: `evidence-vault/src/domain/export.ts`
- Test: `evidence-vault/src/domain/deadline.test.ts`
- Test: `evidence-vault/src/domain/vault-item.test.ts`

**Interfaces:**
- Produces: `createVaultItemSchema`, `createDeadlineSchema`, `deadlineLabel()`, `daysUntil()`, case/checklist enums.
- Consumes: Global legal wording constraints.

- [ ] **Step 1: Write failing deadline semantics tests**

Tests must assert that a user-entered return date is labeled `반품 가능일로 기록한 날짜` rather than as a legally verified deadline, and that `daysUntil()` uses calendar-day arithmetic in Asia/Seoul-facing UI inputs.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- --run src/domain/deadline.test.ts src/domain/vault-item.test.ts`
Expected: FAIL due to missing modules.

- [ ] **Step 3: Implement Zod schemas and pure helpers**

`createVaultItemSchema` requires title, category, merchantName, and purchaseOrStartDate; amount is optional non-negative integer KRW minor-unit value. `createDeadlineSchema` requires `sourceType` in `user_entered | merchant_provided | general_reference` and never infers legal effect.

- [ ] **Step 4: Run domain tests**

Expected: all domain tests PASS.

- [ ] **Step 5: Commit**

```bash
git add evidence-vault/src/domain
git commit -m "feat: add evidence vault domain rules"
```

---

### Task 3: PostgreSQL Persistence and Ownership-Safe Repository Boundary

**Role:** Backend

**Files:**
- Create: `evidence-vault/drizzle.config.ts`
- Create: `evidence-vault/src/db/schema.ts`
- Create: `evidence-vault/src/db/client.ts`
- Create: `evidence-vault/src/repositories/vault-repository.ts`
- Create: `evidence-vault/src/repositories/session-repository.ts`
- Create: `evidence-vault/src/repositories/evidence-repository.ts`
- Create: `evidence-vault/src/repositories/case-repository.ts`
- Create: `evidence-vault/src/repositories/export-repository.ts`
- Test: `evidence-vault/src/repositories/ownership-contract.test.ts`

**Interfaces:**
- Produces tables: `users`, `app_sessions`, `vault_items`, `deadlines`, `evidence_events`, `evidence_files`, `cases`, `case_evidence_links`, `export_packets`, `deletion_jobs`.
- Produces repository signatures that always require `ownerUserId` for user-owned reads/writes.

- [ ] **Step 1: Write ownership contract test**

The test should inspect exported repository functions/types and fail if `getVaultItem`, `getEvidenceFile`, `getCase`, or `getExportPacket` can be called without `ownerUserId`.

- [ ] **Step 2: Generate initial schema and confirm contract test fails**

Run: `npm test -- --run src/repositories/ownership-contract.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement schema and repositories**

Use UUID primary keys, UTC timestamps, soft-delete timestamps only where required for deletion reconciliation, and a unique `users.identity_subject`. `app_sessions` stores only a SHA-256 hash of a random opaque session token plus expiry.

- [ ] **Step 4: Generate migration and run tests**

Run: `npm run db:generate`
Run: `npm test -- --run src/repositories/ownership-contract.test.ts`
Expected: migration generated, contract test PASS.

- [ ] **Step 5: Commit**

```bash
git add evidence-vault/src/db evidence-vault/src/repositories evidence-vault/drizzle evidence-vault/drizzle.config.ts
git commit -m "feat: add evidence vault persistence"
```

---

### Task 4: 꽃다발 OAuth + PKCE and Project Session

**Role:** Backend + Security + Frontend

**Files:**
- Create: `evidence-vault/src/auth/config.ts`
- Create: `evidence-vault/src/auth/pkce.ts`
- Create: `evidence-vault/src/auth/login-attempt.ts`
- Create: `evidence-vault/src/auth/bouquet-client.ts`
- Create: `evidence-vault/src/auth/project-session.ts`
- Create: `evidence-vault/app/auth/login/route.ts`
- Create: `evidence-vault/app/auth/bouquet/callback/route.ts`
- Create: `evidence-vault/app/auth/session/route.ts`
- Create: `evidence-vault/app/auth/sign-out/route.ts`
- Test: `evidence-vault/src/auth/pkce.test.ts`
- Test: `evidence-vault/src/auth/callback.test.ts`

**Interfaces:**
- Consumes 꽃다발 endpoints: `/api/bouquet/oauth/authorize`, `/api/bouquet/oauth/token`, `/api/bouquet/oauth/userinfo`.
- Produces app session cookie `ev_session`, opaque token stored only as SHA-256 hash server-side.

- [ ] **Step 1: Write PKCE and state tests**

Assert RFC 7636 S256 challenge generation, one-time state validation, internal-only `returnTo`, and rejection of missing/reused/mismatched state.

- [ ] **Step 2: Run and confirm tests fail**

Run: `npm test -- --run src/auth/pkce.test.ts src/auth/callback.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement server-side OAuth flow**

Login route creates random state + verifier, stores them in a short-lived encrypted HttpOnly cookie, and redirects to `${BOUQUET_BASE_URL}/api/bouquet/oauth/authorize?response_type=code&client_id=...&redirect_uri=...&state=...&code_challenge=...&code_challenge_method=S256`. Callback exchanges code with JSON `{ clientId, code, redirectUri, codeVerifier }`, calls `/oauth/userinfo`, upserts the app user, creates an opaque project session, clears the login-attempt cookie, and redirects only to a validated internal path.

- [ ] **Step 4: Add UI session state**

Landing/login and protected layouts distinguish `checking`, `anonymous`, `redirecting`, `callback`, `authenticated`, and `error`; credentials are never collected in this app.

- [ ] **Step 5: Run auth tests**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add evidence-vault/src/auth evidence-vault/app/auth
git commit -m "feat: integrate bouquet sso"
```

---

### Task 5: Dashboard, Vault CRUD, and Deadline Radar

**Role:** Frontend + Backend

**Files:**
- Create: `evidence-vault/app/(app)/layout.tsx`
- Create: `evidence-vault/app/(app)/dashboard/page.tsx`
- Create: `evidence-vault/app/(app)/vault/new/page.tsx`
- Create: `evidence-vault/app/(app)/vault/[id]/page.tsx`
- Create: `evidence-vault/app/api/vault/route.ts`
- Create: `evidence-vault/app/api/vault/[id]/route.ts`
- Create: `evidence-vault/src/components/deadline-card.tsx`
- Create: `evidence-vault/src/components/vault-item-card.tsx`
- Test: `evidence-vault/src/components/deadline-card.test.tsx`

**Interfaces:**
- Consumes authenticated `userId`, domain schemas, repository boundary.
- Produces first complete workflow: sign in -> create VaultItem -> add user-entered deadline -> see Dashboard urgency ordering.

- [ ] **Step 1: Write failing UI/domain integration test**

Assert a deadline card renders `반품 가능일로 기록한 날짜까지 D-3` and never renders `법적으로` or `환불받을 수 있습니다`.

- [ ] **Step 2: Implement protected app shell, forms, API handlers, and dashboard**

Every route scopes repository calls by current user ID. Unauthorized users receive 401 and UI re-auth path. Empty dashboard shows one primary CTA `첫 증빙함 만들기`.

- [ ] **Step 3: Run tests and build**

Run: `npm test -- --run src/components/deadline-card.test.tsx`
Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add evidence-vault/app evidence-vault/src/components
git commit -m "feat: add evidence vault dashboard"
```

---

### Task 6: Private Evidence Upload, Integrity Hashing, and Redaction Gate

**Role:** Backend + Security + Frontend

**Files:**
- Create: `evidence-vault/src/storage/storage.ts`
- Create: `evidence-vault/src/storage/s3-storage.ts`
- Create: `evidence-vault/src/storage/local-storage.ts`
- Create: `evidence-vault/src/evidence/file-policy.ts`
- Create: `evidence-vault/src/evidence/hash.ts`
- Create: `evidence-vault/app/api/vault/[id]/events/route.ts`
- Create: `evidence-vault/app/api/evidence/[fileId]/download/route.ts`
- Create: `evidence-vault/app/(app)/vault/[id]/events/new/page.tsx`
- Test: `evidence-vault/src/evidence/file-policy.test.ts`
- Test: `evidence-vault/src/evidence/ownership.test.ts`

**Interfaces:**
- Produces `EvidenceStorage.putPrivate()`, `EvidenceStorage.createDownloadUrl(ttlSeconds=300)`, SHA-256 metadata.
- Consumes authenticated user ownership and private storage configuration.

- [ ] **Step 1: Write failing file-policy and cross-user tests**

Allow only PDF/JPEG/PNG/WEBP <= 20 MiB. Explicitly reject archives/executables. Cross-user test: user B requesting a download for user A's file must receive generic 404/403 and storage signing must not be invoked.

- [ ] **Step 2: Implement private upload flow**

Server validates size, extension and declared MIME; uses magic-byte checks for supported formats; computes SHA-256 on the received bytes; stores unpredictable private key; writes metadata only after object persistence succeeds. UI warns users to redact resident registration numbers, account numbers, unnecessary phone/email data before upload.

- [ ] **Step 3: Implement download authorization**

Download route looks up evidence with `ownerUserId`, then returns a 5-minute signed URL or streams via local dev adapter. No permanent URL is persisted.

- [ ] **Step 4: Run tests**

Expected: file policy and negative ownership tests PASS.

- [ ] **Step 5: Commit**

```bash
git add evidence-vault/src/storage evidence-vault/src/evidence evidence-vault/app/api/evidence evidence-vault/app/api/vault evidence-vault/app/'(app)'/vault
git commit -m "feat: add private evidence storage"
```

---

### Task 7: Dispute Preparation Case Mode and Neutral Checklists

**Role:** PM + Frontend + Backend + Legal/Security reviewer

**Files:**
- Create: `evidence-vault/src/cases/checklists.ts`
- Create: `evidence-vault/src/cases/summary.ts`
- Create: `evidence-vault/app/(app)/vault/[id]/case/page.tsx`
- Create: `evidence-vault/app/(app)/case/[id]/page.tsx`
- Create: `evidence-vault/app/api/cases/route.ts`
- Create: `evidence-vault/app/api/cases/[id]/route.ts`
- Test: `evidence-vault/src/cases/checklists.test.ts`
- Test: `evidence-vault/src/cases/summary.test.ts`

**Interfaces:**
- Produces neutral checklist categories and template-only factual summary.
- Prohibited output: individualized legal conclusions or legal requirement claims unless copied verbatim from an explicitly cited authoritative source.

- [ ] **Step 1: Write legal-boundary tests**

Tests scan generated checklist labels and summaries for prohibited phrases such as `환불받을 수`, `승소`, `법적 효력 보장`, and require organizational wording `확인해 볼 자료` / `정리 권장 자료`.

- [ ] **Step 2: Implement case categories and checklists**

MVP categories: `return_refund`, `recurring_payment`, `rental_contract`, `delivery`, `used_goods`, `warranty_repair`, `other`.

- [ ] **Step 3: Implement template summary**

Only interpolate user-entered merchant/title/date/amount/event facts. Do not add unstated causal or legal conclusions.

- [ ] **Step 4: Run tests and commit**

```bash
git add evidence-vault/src/cases evidence-vault/app/'(app)'/case evidence-vault/app/api/cases
git commit -m "feat: add dispute preparation mode"
```

---

### Task 8: Neutral Evidence Packet Export

**Role:** Backend + Documentation + Security

**Files:**
- Create: `evidence-vault/src/export/manifest.ts`
- Create: `evidence-vault/src/export/pdf.ts`
- Create: `evidence-vault/src/export/archive.ts`
- Create: `evidence-vault/app/(app)/case/[id]/export/page.tsx`
- Create: `evidence-vault/app/api/cases/[id]/export/route.ts`
- Create: `evidence-vault/app/api/exports/[id]/download/route.ts`
- Test: `evidence-vault/src/export/manifest.test.ts`
- Test: `evidence-vault/src/export/legal-boundary.test.ts`

**Interfaces:**
- Produces ZIP structure: `summary.pdf`, `manifest.json`, `evidence/<safe-name>`.
- `manifest.json` records filename, size, MIME, SHA-256, event timestamp, export generation timestamp.

- [ ] **Step 1: Write failing manifest/legal wording tests**
- [ ] **Step 2: Generate deterministic manifest from selected owned evidence**
- [ ] **Step 3: Generate Korean-capable PDF summary with required disclaimer and factual timeline**
- [ ] **Step 4: Archive selected evidence without modifying originals**
- [ ] **Step 5: Store export privately and authorize download by owner**
- [ ] **Step 6: Run tests and commit**

```bash
git add evidence-vault/src/export evidence-vault/app/'(app)'/case evidence-vault/app/api/cases evidence-vault/app/api/exports
git commit -m "feat: add evidence packet export"
```

---

### Task 9: Privacy Deletion, Security Hardening, and Abuse-Safe Logging

**Role:** Security + Backend + Code Review

**Files:**
- Create: `evidence-vault/src/privacy/deletion.ts`
- Create: `evidence-vault/src/security/safe-log.ts`
- Create: `evidence-vault/app/(app)/settings/privacy/page.tsx`
- Create: `evidence-vault/app/(app)/settings/account/page.tsx`
- Create: `evidence-vault/app/api/account/delete/route.ts`
- Test: `evidence-vault/src/privacy/deletion.test.ts`
- Test: `evidence-vault/src/security/safe-log.test.ts`
- Test: `evidence-vault/src/security/cross-user-access.test.ts`

**Interfaces:**
- Produces retryable deletion jobs and log redaction contract.
- Deletes DB metadata and object data; failures remain reconcilable without exposing content.

- [ ] **Step 1: Write deletion and secret-redaction tests**
- [ ] **Step 2: Implement file/case/item/account deletion orchestration**
- [ ] **Step 3: Implement structured safe logger that rejects/omits token, signed URL, evidence body, resident number, account number, and full message fields**
- [ ] **Step 4: Run the cross-user authorization suite**

Run: `npm test -- --run src/security/cross-user-access.test.ts`
Expected: user B cannot read, mutate, sign, export, or delete user A resources.

- [ ] **Step 5: Commit**

```bash
git add evidence-vault/src/privacy evidence-vault/src/security evidence-vault/app/'(app)'/settings evidence-vault/app/api/account
git commit -m "feat: harden evidence vault privacy"
```

---

### Task 10: PWA/Responsive UX, Production Docs, and Final Verification

**Role:** Frontend + DevOps + Documentation + Code Review

**Files:**
- Create: `evidence-vault/app/manifest.ts`
- Create: `evidence-vault/public/icon.svg`
- Modify: `evidence-vault/app/globals.css`
- Modify: `evidence-vault/PRODUCT.md`
- Create: `evidence-vault/README.md`
- Create: `evidence-vault/Dockerfile`
- Create: `evidence-vault/playwright.config.ts`
- Create: `evidence-vault/e2e/primary-flow.spec.ts`
- Modify: `.env.example` only if shared deployment variables are intentionally needed; otherwise keep app env isolated.

**Interfaces:**
- Produces responsive installable shell, build/run docs, production blocker list, and full user-flow verification.

- [ ] **Step 1: Add mobile-first responsive/PWA metadata**
- [ ] **Step 2: Add explicit empty/loading/error/permission states across primary routes**
- [ ] **Step 3: Add Playwright primary-flow test using a test-only app-session fixture, never fake 꽃다발 credentials**
- [ ] **Step 4: Document production inputs**

Required production inputs: `DATABASE_URL`, `SESSION_SECRET`, `BOUQUET_BASE_URL`, `BOUQUET_CLIENT_ID`, `BOUQUET_REDIRECT_URI`, S3 endpoint/region/bucket/access credentials. Record that a real 꽃다발 OAuth client registration and exact redirect URI are deployment blockers.

- [ ] **Step 5: Final automated verification**

Run:

```bash
npm ci
npm test -- --run
npm run db:generate
npm run build
npm run test:e2e
```

Expected: all unit/integration tests PASS, migration generation succeeds, production build succeeds, primary flow passes.

- [ ] **Step 6: Final independent review**

Code Review Agent verifies spec compliance, Security Agent independently verifies authorization/file/privacy boundaries, and Orchestrator adjudicates disagreements with written rationale.

- [ ] **Step 7: Commit**

```bash
git add evidence-vault
git commit -m "chore: prepare evidence vault mvp"
```

---

## Pre-flight Review Matrix

| Producer | Consumer | Shared interface/file | Ruling |
|---|---|---|---|
| T1 | T2-T10 | app/package/env shell | T1 owns scaffolding only; later tasks may extend package scripts/dependencies without changing product boundaries. |
| T2 | T5/T7 | domain schemas/deadline wording | Domain wording is authoritative for deadline/legal semantics. |
| T3 | T4-T9 | user/session/resource repositories | All user-owned repositories require `ownerUserId`; later tasks may not bypass this via raw DB calls. |
| T4 | T5-T10 | authenticated user/session | OAuth tokens never become application sessions; app session is separate opaque server-owned session. |
| T5 | T6/T7 | VaultItem ownership and routes | Evidence/cases can only attach to an owned VaultItem. |
| T6 | T8/T9 | EvidenceFile + storage interface | Export/deletion use storage adapter; no direct public object URL. |
| T7 | T8 | case/checklist/summary | Export may render factual summary but may not enrich it with legal interpretation. |
| T8 | T9/T10 | export packet/private object | Account deletion removes export objects; UI only receives authenticated short-lived download path. |
| T9 | T10 | security/deletion behavior | Final E2E must include unauthorized/cross-user negative cases or equivalent integration coverage. |

## Plan Self-Review

- Spec coverage: product scope, auth, persistence, deadline semantics, private evidence, case mode, export, privacy deletion, legal boundary, responsive states, production blockers, and verification all map to explicit tasks.
- Placeholder scan: no TBD/TODO/"implement later" instructions remain.
- Type/interface consistency: `ownerUserId` is the common ownership boundary; `ev_session` is the app cookie; export always uses the same ZIP contract; deadline/legal wording comes from T2 and is consumed unchanged.
- Scope: notifications, payments, OCR/AI, public sharing, medical disputes, and individualized legal analysis remain intentionally outside MVP.
