# 증빙함 (Evidence Vault) Product & Architecture Design

Updated: 2026-08-27
Status: Proposed implementation baseline
Owner: Team Sunflower / Luna Agent System

## 1. Product Summary

`증빙함` is a consumer evidence-management web service for people who need to preserve, organize, and export records related to purchases, subscriptions, rentals, warranties, cancellations, refunds, deliveries, and consumer disputes.

The product is not a legal-advice service. Its primary job is to help users keep factual records before and during a dispute so that they do not have to reconstruct evidence from screenshots, email, chat, shopping apps, and device storage after a problem occurs.

Public product name: `증빙함`
Internal project slug: `evidence-vault`
Primary platform: responsive web / PWA-capable web

## 2. Target User

Primary users are Korean consumers who regularly purchase online goods or services, subscribe to recurring services, use rentals or fixed-term contracts, or need to preserve proof for cancellation/refund/repair requests.

Typical situations:

- online purchase with a return deadline
- subscription free-trial or renewal deadline
- gym, telecom, rental, or membership contract with an end date
- warranty expiration
- delayed delivery or damaged product
- refund request and merchant response history
- repeated communication that may later need to be submitted to a consumer dispute body

## 3. Job To Be Done

When a purchase, contract, or service relationship might later become a dispute, the user should be able to:

1. register the transaction or contract,
2. record important deadlines,
3. attach evidence as events occur,
4. see a factual chronological timeline,
5. identify missing evidence categories,
6. export a neutral evidence packet.

The service must reduce evidence-loss risk without making individualized legal judgments.

## 4. Product Boundary

### Included

- transaction / contract registration
- deadline tracking
- evidence upload and private storage
- chronological event timeline
- evidence checklist by case category
- neutral case summary generated from user-entered facts
- evidence packet export
- SHA-256 file integrity value generation
- public consumer-information links with source and verification date
- shared 꽃다발 authentication

### Explicitly excluded

- individualized legal advice
- prediction of win/refund probability
- automated legal conclusions such as "you are legally entitled to a refund"
- representation or negotiation with merchants on behalf of users
- success-fee dispute handling
- automated lawsuit, complaint, content-certified mail, or legal-demand drafting that requires legal judgment
- medical dispute evidence in MVP
- public evidence feeds or social posting
- a separate email/password account system
- AI-based legal interpretation in MVP

## 5. Legal & Compliance Guardrails

The implementation must be conservative by design.

### 5.1 Legal-service boundary

The product may store, sort, summarize, and export user-provided factual information. It must not present itself as a law firm, legal representative, legal-advice platform, or service that determines legal rights for an individual case.

Required product copy:

> 증빙함은 사용자가 입력한 사실과 첨부 자료를 정리하는 도구입니다. 개별 사건에 대한 법률 판단, 법률상담 또는 법률대리를 제공하지 않습니다.

Prohibited copy includes:

- "환불받을 수 있습니다"
- "법적으로 승소할 가능성이 높습니다"
- "법원에서 인정되는 증거입니다"
- "이 문서로 법적 효력이 보장됩니다"

### 5.2 File integrity wording

SHA-256 values are used only as file-integrity fingerprints.

Allowed wording:

> 저장된 파일의 변경 여부를 확인할 수 있도록 무결성 확인값을 제공합니다.

The product must never claim that hashing alone certifies authenticity, admissibility, notarization, or evidentiary weight.

### 5.3 Privacy

All evidence is private by default. No evidence is publicly discoverable.

High-risk identifiers such as resident registration numbers must not be intentionally collected. The upload flow must warn users to redact unnecessary identifiers before storage.

MVP excludes medical/health dispute categories to avoid intentionally collecting health-sensitive evidence as a normal product workflow.

Users must be able to delete individual evidence files, cases, and their entire account data. Deletion must remove both database metadata and stored object data according to the retention policy.

### 5.4 Third-party personal information

Screenshots may contain merchant employee names, phone numbers, emails, account numbers, or other third-party information. The product must:

- keep evidence private,
- advise the user to retain only information necessary for the dispute,
- provide a redaction step before upload or before export,
- avoid public sharing features in MVP.

### 5.5 Age policy

MVP supports users aged 14 or older. The product must not intentionally onboard children under 14 until a legal guardian consent workflow is designed and reviewed.

### 5.6 Legal information pages

Consumer-information pages must:

- show the original source organization,
- show the last verification date,
- distinguish general information from individualized advice,
- link users to the authoritative source for current details.

## 6. Product Architecture

`증빙함` is an independent product, not a new public route inside the BloomBouquet frontend.

BloomBouquet remains the public project showcase/evaluation platform. `증빙함` will be developed and deployed independently, then registered as a versioned project submission in BloomBouquet.

Authentication uses the shared 꽃다발 Identity Provider through Authorization Code + PKCE S256. Evidence Vault maintains only its own application session and product-domain data; it does not create its own password credential store.

Recommended initial architecture:

```text
Browser / PWA
  -> Evidence Vault Web App
    -> App BFF / API
      -> PostgreSQL
      -> Private Object Storage
      -> 꽃다발 Identity Provider
      -> Export Worker / PDF Generator
```

For MVP, the API may ship in the same deployable unit as the web app if deployment simplicity is materially improved, but domain services must remain separated in code so backend extraction is possible later.

## 7. Technology Choices

The Playground repository baseline prefers React + TypeScript + Vite for normal apps, but this product requires authenticated server-backed persistence, secure object access, and server-side session handling.

Recommended standalone stack:

- Frontend: Next.js 16 + TypeScript + App Router
- Styling: existing project design-system primitives; no heavy UI framework required
- Validation: Zod
- Database: PostgreSQL
- ORM: Prisma or Drizzle; choose one at bootstrap and keep a single data access boundary
- Object storage: S3-compatible private bucket in a Korean region when possible
- Auth: 꽃다발 OAuth 2.0 Authorization Code + PKCE S256
- Session: secure, HTTP-only application session cookie
- Testing: Vitest + Testing Library + Playwright
- Deployment: Docker-compatible production build

No AI provider, realtime provider, or payment provider is required for MVP.

## 8. Domain Model

### User

Represents the application profile linked to a 꽃다발 identity subject.

Core fields:

- id
- identitySubject
- displayName
- createdAt
- updatedAt
- deletedAt

### VaultItem

Represents a purchase, subscription, rental, warranty, service contract, or other consumer relationship.

Core fields:

- id
- userId
- title
- category
- merchantName
- purchaseOrStartDate
- amount nullable
- currency default KRW
- description nullable
- status
- createdAt
- updatedAt

### Deadline

Represents a user-tracked date such as return window, renewal, warranty expiration, refund expectation, or contract end.

Core fields:

- id
- vaultItemId
- type
- dueAt
- sourceType
- sourceNote nullable
- reminderState
- createdAt
- updatedAt

`sourceType` records whether a deadline was user-entered, merchant-provided, or copied from a general reference. The service must not silently infer a legally binding deadline.

### EvidenceEvent

A factual chronological event.

Core fields:

- id
- vaultItemId
- occurredAt
- eventType
- title
- note nullable
- createdByUserId
- createdAt
- updatedAt

Examples: purchased, delivered, defect_found, refund_requested, merchant_replied, refund_received.

### EvidenceFile

A private uploaded file attached to an event or item.

Core fields:

- id
- userId
- vaultItemId
- evidenceEventId nullable
- storageKey
- originalFilename
- mimeType
- byteSize
- sha256
- uploadedAt
- redactionState
- deletedAt

No public object URL is stored. Access is generated through short-lived signed URLs after authorization.

### Case

A user-created dispute-preparation workspace linked to one VaultItem.

Core fields:

- id
- vaultItemId
- caseType
- openedAt
- closedAt nullable
- userSummary nullable
- status

MVP case types:

- return_refund
- recurring_payment
- rental_contract
- delivery
- used_goods
- warranty_repair
- other

### ChecklistItem

Represents a neutral evidence category, not a legal requirement conclusion.

Examples:

- proof_of_purchase
- transaction_terms
- cancellation_request
- merchant_response
- delivery_record
- defect_photo
- payment_record

The UI must say "확인해 볼 자료" or "정리 권장 자료", not "법적으로 반드시 필요한 자료" unless a cited authoritative source explicitly states that requirement.

### ExportPacket

Represents one generated evidence export.

Core fields:

- id
- caseId
- requestedByUserId
- generatedAt
- storageKey
- manifestHash
- status
- expiresAt nullable

## 9. Primary User Workflow

### 9.1 Sign in

1. User chooses `꽃다발로 로그인`.
2. App redirects using Authorization Code + PKCE S256.
3. Server exchanges the authorization code.
4. App creates a secure application session.
5. First-time users accept product terms and privacy notices.

### 9.2 Register an item

1. User chooses `새 증빙함 만들기`.
2. User selects category.
3. User enters title, merchant, date, and optional amount.
4. User adds deadlines if known.
5. Item is created without requiring evidence upload.

### 9.3 Add evidence

1. User creates an event or selects an existing event.
2. User selects a local file.
3. Client shows a privacy warning and redaction option.
4. Server validates authorization, MIME type, extension, file size, and upload intent.
5. File is stored privately.
6. Server computes or verifies SHA-256 and stores metadata.
7. Timeline displays the event and attachment.

### 9.4 Start case mode

1. User selects `분쟁 준비 모드`.
2. User selects the neutral case category.
3. UI presents evidence categories that may be useful to organize.
4. User links existing timeline events/files or adds new evidence.
5. UI clearly shows that the checklist is organizational guidance, not a legal determination.

### 9.5 Export evidence packet

1. User chooses `증빙 패킷 만들기`.
2. User reviews included events and files.
3. User can redact or exclude selected attachments.
4. System generates a chronological PDF summary plus a manifest of included attachments and file integrity values.
5. User downloads the packet through an authenticated, short-lived URL.

## 10. Dashboard UX

The dashboard is deadline-first, not folder-first.

Primary sections:

- `곧 마감돼요`: upcoming deadlines sorted by urgency
- `최근 기록`: latest evidence events
- `내 증빙함`: all active VaultItems
- `분쟁 준비 중`: active cases

Each deadline card shows only factual, user-entered or source-labeled information.

Example:

```text
무선 이어폰 구매
반품 가능일로 기록한 날짜까지 D-3

정수기 렌탈
약정 종료일로 기록한 날짜까지 D-74
```

The phrase `~로 기록한 날짜` is preferred when the product cannot independently verify the legal meaning of the date.

## 11. Information Architecture

Routes:

- `/` landing
- `/auth/callback`
- `/dashboard`
- `/vault/new`
- `/vault/:id`
- `/vault/:id/deadlines`
- `/vault/:id/events/new`
- `/vault/:id/case`
- `/case/:id`
- `/case/:id/export`
- `/settings/privacy`
- `/settings/account`
- `/guide`

The product must support mobile widths first and remain usable on desktop.

## 12. Security Design

### Authentication and authorization

- every protected API route requires an application session
- every item, event, file, case, and export query is scoped by the authenticated user
- authorization is enforced server-side, never only in the UI
- OAuth state and PKCE verifier are short-lived and bound to the login attempt
- session cookies use Secure, HttpOnly, and SameSite protections appropriate to the deployed topology

### Object storage

- private bucket only
- no permanent public URLs
- unpredictable storage keys
- short-lived signed upload/download access
- server-side ownership check before issuing a URL
- deleted records trigger object deletion

### File validation

MVP allowlist should include common evidence formats such as PDF, JPEG, PNG, and WEBP. Other formats are rejected until explicitly supported.

Validation must include:

- maximum file size
- server-side MIME inspection where available
- extension/MIME consistency checks
- rejection of executable and archive formats in MVP
- image metadata removal or normalization when export processing is performed

### Logging

Application logs must not contain uploaded file content, OAuth tokens, signed URLs, resident registration numbers, account numbers, or full message contents.

Security/audit logs may record event type, actor ID, object ID, timestamp, and outcome.

## 13. Privacy & Retention Design

Users control the retention of their evidence.

Required controls:

- delete one file
- delete one timeline event while explicitly choosing what happens to attached files
- delete a VaultItem and its related data
- delete account and all product data

Deletion jobs must be retryable and must reconcile database tombstones with object-storage deletion results.

A short operational recovery window may exist only if it is explicitly documented in the privacy policy and implemented consistently. MVP should prefer immediate logical deletion followed by prompt physical deletion rather than indefinite retention.

## 14. Error, Empty, Loading, and Permission States

Required states:

### Empty dashboard

Explain the first complete workflow and show one primary action: `첫 증빙함 만들기`.

### Upload failure

Show the exact failed file, reason category, and retry action without losing the event draft.

### Unauthorized object access

Return a generic not-found/forbidden response without leaking whether another user's object exists.

### Export failure

Keep the case unchanged, mark export status as failed, and allow regeneration.

### Identity Provider unavailable

Show a recoverable sign-in error and do not create a partial account.

### Storage unavailable

Allow timeline text to remain saveable only if the UI clearly indicates that attachment upload failed. Never display an attachment as saved before persistence succeeds.

## 15. Notification Strategy

MVP does not require push notifications.

Phase 1 reminders may be in-app only. Email or push notifications require explicit product work because they introduce delivery credentials, scheduling infrastructure, user preference management, and additional privacy considerations.

The system must therefore model deadlines independently of notification channels.

## 16. Export Design

The export packet is an organizational artifact, not a legal opinion.

PDF summary structure:

1. product disclaimer
2. case title and category
3. user-entered transaction facts
4. chronological event timeline
5. included evidence index
6. file names, timestamps, and SHA-256 integrity values
7. generation timestamp

No automatic section should state legal liability, breach, statutory entitlement, damages, or likelihood of success.

## 17. Consumer Guide Design

Guide entries are curated reference cards rather than AI answers.

Each card stores:

- title
- short neutral summary
- source organization
- source URL
- verification date
- topic tags

Priority official sources include Korea Consumer Agency, Consumer24, the Korea Fair Trade Commission, the National Law Information Center, and relevant dispute-resolution organizations.

The guide is informational and should send the user to the authoritative source for the most current rule.

## 18. Observability

Minimum production observability:

- structured application errors
- auth callback failures
- upload success/failure counts
- export job duration and failure counts
- object deletion reconciliation failures
- database health
- storage health

No evidence contents are sent to analytics by default.

## 19. Testing Strategy

### Unit tests

- deadline ordering
- ownership guards
- file allowlist validation
- SHA-256 manifest generation
- checklist selection logic
- neutral copy guards where practical

### Integration tests

- OAuth callback/session creation with mocked IdP contract
- create item -> add event -> attach file metadata
- signed URL authorization
- delete item cascade / deletion queue behavior
- export creation lifecycle

### End-to-end tests

Critical happy path:

`sign in -> create VaultItem -> add deadline -> add event -> upload evidence -> start case -> export packet`

Critical negative paths:

- user A cannot access user B evidence
- executable upload rejected
- expired signed URL rejected
- failed export remains retryable
- deleted evidence is not returned from normal queries

### UI verification

Check at minimum:

- narrow mobile viewport
- common desktop viewport
- long Korean merchant/item names
- zero evidence state
- multiple deadlines on same day
- upload progress/failure
- keyboard-only primary flow

## 20. Production Blockers

The product is not production-ready until all of the following exist:

- dedicated project repository or approved standalone source location
- 꽃다발 OAuth client registration
- exact redirect URI and public product domain
- production PostgreSQL database
- private object storage bucket and credentials
- privacy policy
- terms of service
- retention/deletion policy
- supported-file policy and size limits
- legal copy review for guide/disclaimer/export wording
- TLS-enabled deployment
- backup and restore procedure for database metadata
- object deletion reconciliation procedure
- security verification of cross-user authorization boundaries

If paid plans are later introduced, payment, cancellation/refund terms, business identity disclosures, and applicable Korean e-commerce obligations must be separately reviewed before launch.

## 21. BloomBouquet Integration

Evidence Vault is submitted to BloomBouquet only after it has an independently deployable URL and source repository.

Submission should include:

- public project URL
- source repository URL
- version/commit SHA
- test/build evidence
- known production blockers

BloomBouquet evaluators should independently review user experience, accessibility, frontend, backend, security, performance, QA, documentation, and code quality.

## 22. Repository & Branch Strategy

Target standalone repository name: `evidence-vault`.

Until that repository exists and is accessible to the automation connector, orchestration/design artifacts may live in `sunwoo162/Playground` under this spec path only. Product implementation code must not be added to `bloom-web`, because BloomBouquet's public frontend is the showcase/evaluation platform rather than a host for independent product code.

Recommended implementation branches in the standalone repository:

- `evidence-vault/orchestrator`
- `evidence-vault/frontend`
- `evidence-vault/backend`
- `evidence-vault/security`
- `evidence-vault/devops`
- `evidence-vault/documentation`

Each Agent owns its branch scope and may challenge other Agents' conclusions. Code Review and Security Agents are reviewers, not automatic authorities; implementation Agents must evaluate review feedback and provide reasons for accepting or rejecting it.

## 23. Initial Build Sequence

The first implementation cycle should produce one complete vertical slice rather than many disconnected screens.

Sequence:

1. repository bootstrap and CI
2. 꽃다발 auth adapter and protected application shell
3. VaultItem persistence and dashboard empty state
4. deadline creation/listing
5. timeline event creation
6. private evidence upload and authorization
7. case mode and neutral checklist
8. evidence packet export
9. deletion/account privacy controls
10. end-to-end and security verification
11. independent Luna Agent review
12. BloomBouquet submission

## 24. Success Criteria For MVP

MVP is accepted only when a user can complete this workflow with real persisted data:

1. sign in through 꽃다발,
2. create an item,
3. add a deadline,
4. add a factual event,
5. upload a private evidence file,
6. start a case,
7. select evidence for the case,
8. generate and download an evidence packet,
9. delete the evidence and verify it is no longer accessible.

The implementation must pass an explicit cross-user access test proving that one account cannot retrieve another account's evidence or signed download URL.

## 25. Decisions Locked By This Spec

- Evidence Vault is a standalone product.
- BloomBouquet is an evaluator/showcase, not the product host.
- 꽃다발 is the only authentication provider for production accounts.
- Evidence is private by default.
- No legal-advice AI is included in MVP.
- No individualized legal conclusions are generated.
- SHA-256 is described only as an integrity fingerprint.
- Medical dispute workflows are excluded from MVP.
- Users under 14 are excluded from MVP onboarding.
- Deadline values are user-entered/source-labeled unless an authoritative source is explicitly attached.
- The dashboard prioritizes deadlines and recent evidence rather than presenting a generic file manager.
- Server persistence is required; LocalStorage-only persistence is not acceptable.
