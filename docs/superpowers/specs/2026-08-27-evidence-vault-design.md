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
- deterministic case summary assembled from explicit user-entered facts
- evidence packet export
- SHA-256 file integrity value generation
- public consumer-information links with source and verification date
- shared 꽃다발 authentication

The deterministic case summary is template-based. It does not use generative AI and does not infer legal conclusions.

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

### 5.4 Third-party personal information and redaction

Screenshots may contain merchant employee names, phone numbers, emails, account numbers, or other third-party information. The product must:

- keep evidence private,
- advise the user to retain only information necessary for the dispute,
- avoid public sharing features in MVP,
- allow image evidence (JPEG/PNG/WEBP) to be client-side redacted with opaque rectangles before upload,
- permanently rasterize the redacted image before it is uploaded so the hidden pixels are not recoverable from the uploaded result,
- require users to upload a separately redacted copy of PDFs when PDF redaction is needed in MVP,
- allow any attachment to be excluded from an export packet.

MVP does not perform OCR-based automatic personal-information detection. This avoids false assurances and avoids sending evidence contents to an AI/OCR provider.

### 5.5 Age policy

MVP is restricted to users aged 14 or older. First-time onboarding requires an explicit `만 14세 이상입니다` attestation before product data is created. The service does not store date of birth solely for this purpose.

If the 꽃다발 Identity Provider later exposes a verified age-eligibility claim, the application should prefer that claim. A legal-guardian consent workflow is outside MVP scope.

### 5.6 Legal information pages

Consumer-information pages must:

- show the original source organization,
- show the last verification date,
- distinguish general information from individualized advice,
- link users to the authoritative source for current details.

Priority reference authorities are the National Law Information Center, Korea Consumer Agency, Consumer24, Korea Fair Trade Commission, and relevant official dispute-resolution bodies.

## 6. Product Architecture

`증빙함` is an independent product, not a new public route inside the BloomBouquet frontend.

BloomBouquet remains the public project showcase/evaluation platform. `증빙함` will be developed and deployed independently, then registered as a versioned project submission in BloomBouquet.

Authentication uses the shared 꽃다발 Identity Provider through Authorization Code + PKCE S256. Evidence Vault maintains only its own application session and product-domain data; it does not create its own password credential store.

Initial architecture:

```text
Browser / PWA
  -> Evidence Vault Next.js App
    -> Route Handlers / Server Actions
      -> Domain Services
        -> PostgreSQL
        -> Private S3-compatible Object Storage
        -> 꽃다발 Identity Provider adapter
        -> Export service
```

MVP ships as one deployable Next.js application with clear server-side domain boundaries. Export generation runs inside the application process behind an `ExportService` interface for MVP. Moving export generation to a dedicated worker is a later scaling option and must not change the domain contract.

## 7. Technology Choices

Standalone stack:

- Framework: Next.js 16 + TypeScript + App Router
- Styling: Tailwind CSS with small accessible project-owned UI primitives
- Validation: Zod
- Database: PostgreSQL
- ORM/query layer: Drizzle ORM
- Object storage API: AWS SDK S3 client against a private S3-compatible bucket; production storage should use a Korean region when possible
- Auth: 꽃다발 OAuth 2.0 Authorization Code + PKCE S256
- Session: opaque database-backed session referenced by a Secure, HttpOnly cookie
- Unit/integration testing: Vitest + Testing Library
- End-to-end testing: Playwright
- Deployment: Docker-compatible production build

No AI provider, realtime provider, payment provider, OCR provider, or third-party analytics provider is required for MVP.

## 8. Domain Model

### User

Represents the application profile linked to a 꽃다발 identity subject.

Core fields:

- id
- identitySubject
- displayName
- ageAttestedAt
- termsAcceptedAt
- privacyAcceptedAt
- createdAt
- updatedAt
- deletedAt

### Session

Represents an application session after OAuth code exchange.

Core fields:

- id
- userId
- tokenHash
- expiresAt
- createdAt
- lastSeenAt
- revokedAt nullable

Only the session token hash is stored server-side. The raw opaque session token exists only in the user's secure cookie.

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

No public object URL is stored. Access is generated through a short-lived signed download URL only after server-side ownership authorization.

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

The UI must say `확인해 볼 자료` or `정리 권장 자료`, not `법적으로 반드시 필요한 자료` unless a cited authoritative source explicitly states that requirement.

### ExportPacket

Represents one generated evidence export.

Core fields:

- id
- caseId
- requestedByUserId
- generatedAt
- storageKey
- manifestSha256
- status
- expiresAt nullable

## 9. Primary User Workflow

### 9.1 Sign in

1. User chooses `꽃다발로 로그인`.
2. App redirects using Authorization Code + PKCE S256.
3. Server exchanges the authorization code.
4. App creates a secure application session.
5. First-time users accept product terms and privacy notices and attest that they are at least 14 years old.

No product-domain record is created before required onboarding acknowledgements succeed.

### 9.2 Register an item

1. User chooses `새 증빙함 만들기`.
2. User selects category.
3. User enters title, merchant, date, and optional amount.
4. User adds deadlines if known.
5. Item is created without requiring evidence upload.

### 9.3 Add evidence

1. User creates an event or selects an existing event.
2. User selects a local file.
3. Client shows a privacy warning.
4. For JPEG/PNG/WEBP, the user may apply opaque client-side redaction rectangles; the redacted result becomes a new rasterized upload file.
5. For PDF, the UI instructs the user to upload a pre-redacted copy if sensitive information must be removed.
6. Server validates authorization, MIME type, extension, file size, and upload intent.
7. Server streams the file into private object storage.
8. Server computes SHA-256 while processing the upload and stores metadata only after storage succeeds.
9. Timeline displays the event and attachment.

### 9.4 Start case mode

1. User selects `분쟁 준비 모드`.
2. User selects the neutral case category.
3. UI presents evidence categories that may be useful to organize.
4. User links existing timeline events/files or adds new evidence.
5. UI clearly shows that the checklist is organizational guidance, not a legal determination.

### 9.5 Export evidence packet

1. User chooses `증빙 패킷 만들기`.
2. User reviews included events and files.
3. User excludes any attachment that should not be exported.
4. System creates a ZIP archive containing a deterministic `summary.pdf`, `manifest.json`, and selected original/redacted attachments under `evidence/`.
5. `manifest.json` records included filenames, event timestamps, MIME types, byte sizes, and SHA-256 integrity values.
6. The system stores the SHA-256 of the exact generated `manifest.json` bytes as `manifestSha256`.
7. User downloads the ZIP through an authenticated endpoint that issues a signed object URL valid for 5 minutes.

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
- `/onboarding`
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
- session cookies use Secure, HttpOnly, SameSite=Lax, and Path=/
- session tokens are cryptographically random and stored server-side only as a hash
- logout revokes the server-side session

### Object storage

- private bucket only
- no permanent public URLs
- unpredictable UUID-based storage keys
- uploads pass through the authenticated application API so ownership and file policy are validated before persistence
- downloads use signed URLs valid for 5 minutes only after a server-side ownership check
- deleted records trigger object deletion

### File policy

MVP supported evidence formats:

- `application/pdf`
- `image/jpeg`
- `image/png`
- `image/webp`

Maximum upload size: 20 MiB per file.

MVP rejects archives, executable formats, Office documents, SVG, HTML, and other unlisted MIME types.

Validation includes:

- maximum size enforcement before accepting persistence
- file-signature / magic-byte validation for supported formats where practical
- extension and detected MIME consistency checks
- rejection of executable and archive formats
- rasterization of image redaction output before upload
- stripping image metadata from client-generated redacted image outputs

### Logging

Application logs must not contain uploaded file content, OAuth tokens, session tokens, signed URLs, resident registration numbers, account numbers, or full message contents.

Security/audit logs may record event type, actor ID, object ID, timestamp, and outcome.

## 13. Privacy & Retention Design

Users control the retention of their evidence.

Required controls:

- delete one file
- delete one timeline event while explicitly choosing what happens to attached files
- delete a VaultItem and its related data
- delete account and all product data

Normal deletion behavior:

1. mark the database record deleted in a transaction,
2. enqueue or record a storage-deletion operation,
3. delete the private object,
4. record deletion completion,
5. make deleted evidence inaccessible immediately from all normal application queries even if a storage deletion retry is pending.

Deletion operations must be retryable and must reconcile database tombstones with object-storage deletion results.

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

Show a recoverable sign-in error and do not create a partial product account.

### Storage unavailable

Allow timeline text to remain saveable only if the UI clearly indicates that attachment upload failed. Never display an attachment as saved before persistence succeeds.

## 15. Notification Strategy

MVP does not require push notifications.

Phase 1 reminders are in-app only. Email or push notifications require explicit future product work because they introduce delivery credentials, scheduling infrastructure, user preference management, and additional privacy considerations.

The system therefore models deadlines independently of notification channels.

## 16. Export Design

The export packet is an organizational artifact, not a legal opinion.

Archive layout:

```text
case-<case-id>.zip
  summary.pdf
  manifest.json
  evidence/
    <safe-generated-name-1>.pdf
    <safe-generated-name-2>.jpg
```

`summary.pdf` structure:

1. product disclaimer
2. case title and category
3. explicit user-entered transaction facts
4. chronological event timeline
5. included evidence index
6. file names, timestamps, and SHA-256 integrity values
7. generation timestamp

`manifest.json` contains machine-readable equivalents for included files and events. Export filenames are sanitized and generated server-side; original filenames are recorded inside the manifest rather than trusted as archive paths.

No automatic section states legal liability, breach, statutory entitlement, damages, or likelihood of success.

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

The guide is informational and sends the user to the authoritative source for the most current rule.

## 18. Observability

Minimum production observability:

- structured application errors
- auth callback failures
- upload success/failure counts
- export duration and failure counts
- object deletion reconciliation failures
- database health
- storage health

No evidence contents are sent to analytics by default.

## 19. Testing Strategy

### Unit tests

- deadline ordering
- ownership guards
- file allowlist validation
- 20 MiB file-size rejection
- SHA-256 file and manifest generation
- checklist selection logic
- deterministic summary generation
- archive filename sanitization
- session token hashing/lookup behavior

### Integration tests

- OAuth callback/session creation with mocked 꽃다발 IdP contract
- first-login age/terms/privacy onboarding gate
- create item -> add event -> attach file metadata
- object download authorization and 5-minute signed URL issuance
- delete item cascade / deletion retry behavior
- export archive creation lifecycle

### End-to-end tests

Critical happy path:

`sign in -> onboarding -> create VaultItem -> add deadline -> add event -> upload evidence -> start case -> export packet`

Critical negative paths:

- user A cannot access user B evidence
- user A cannot request a signed download URL for user B evidence
- executable or unlisted MIME upload is rejected
- file above 20 MiB is rejected
- expired signed URL is rejected
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
- image redaction flow
- keyboard-only primary flow

## 20. Production Blockers

The product is not production-ready until all of the following exist:

- dedicated project repository or approved standalone source location
- 꽃다발 OAuth client registration
- exact redirect URI and public product domain
- production PostgreSQL database
- private object storage bucket and credentials
- Korean-region storage decision documented
- privacy policy
- terms of service
- age eligibility/onboarding copy reviewed
- retention/deletion policy
- supported-file policy fixed to the implemented allowlist and 20 MiB limit
- legal copy review for guide/disclaimer/export wording
- TLS-enabled deployment
- backup and restore procedure for database metadata
- object deletion reconciliation procedure
- security verification of cross-user authorization boundaries

If paid plans are later introduced, payment, cancellation/refund terms, business identity disclosures, and applicable Korean e-commerce obligations must be separately reviewed before launch.

## 21. BloomBouquet Integration

Evidence Vault is submitted to BloomBouquet only after it has an independently deployable URL and source repository.

Submission includes:

- public project URL
- source repository URL
- version/commit SHA
- test/build evidence
- known production blockers

BloomBouquet evaluators independently review user experience, accessibility, frontend, backend, security, performance, QA, documentation, and code quality.

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

The first implementation cycle produces one complete vertical slice rather than many disconnected screens.

Sequence:

1. repository bootstrap and CI
2. 꽃다발 auth adapter, session persistence, and protected application shell
3. onboarding gate
4. VaultItem persistence and dashboard empty state
5. deadline creation/listing
6. timeline event creation
7. private evidence upload, image redaction, and authorization
8. case mode and neutral checklist
9. deterministic case summary and evidence ZIP export
10. deletion/account privacy controls
11. end-to-end and cross-user security verification
12. independent Luna Agent review
13. BloomBouquet submission

## 24. Success Criteria For MVP

MVP is accepted only when a user can complete this workflow with real persisted data:

1. sign in through 꽃다발,
2. pass first-login onboarding,
3. create an item,
4. add a deadline,
5. add a factual event,
6. upload a private evidence file,
7. start a case,
8. select evidence for the case,
9. generate and download the ZIP evidence packet,
10. delete the evidence and verify it is no longer accessible.

The implementation must pass an explicit cross-user access test proving that one account cannot retrieve another account's evidence or obtain a signed download URL for it.

## 25. Decisions Locked By This Spec

- Evidence Vault is a standalone product.
- BloomBouquet is an evaluator/showcase, not the product host.
- 꽃다발 is the only authentication provider for production accounts.
- Next.js 16, TypeScript, PostgreSQL, Drizzle ORM, Zod, Tailwind CSS, Vitest, and Playwright are the MVP application stack.
- Evidence is private by default.
- No legal-advice AI is included in MVP.
- No OCR/AI provider receives user evidence in MVP.
- No individualized legal conclusions are generated.
- Deterministic summaries use explicit user-entered facts only.
- SHA-256 is described only as an integrity fingerprint.
- Medical dispute workflows are excluded from MVP.
- Users under 14 are excluded from MVP onboarding.
- Deadline values are user-entered/source-labeled unless an authoritative source is explicitly attached.
- Supported evidence files are PDF, JPEG, PNG, and WEBP with a 20 MiB per-file limit.
- Redaction is supported for raster images; PDFs must be pre-redacted by the user in MVP.
- Evidence exports are ZIP archives containing `summary.pdf`, `manifest.json`, and selected evidence files.
- Signed evidence download URLs expire after 5 minutes.
- The dashboard prioritizes deadlines and recent evidence rather than presenting a generic file manager.
- Server persistence is required; LocalStorage-only persistence is not acceptable.
