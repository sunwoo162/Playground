# BloomBouquet Project Management Design

Date: 2026-08-28

## Goal

Add a production-ready BloomBouquet management flow that lets a signed-in 꽃다발 account create a Team, create or reselect a Project, publish a versioned Submission, and automatically enqueue the existing senior-Agent evaluation pipeline without direct database manipulation or legacy JWT login.

The first production Submission created through this flow will also be used as the real evaluator E2E proof: `QUEUED -> RUNNING -> COMPLETED`, with persisted independent Agent evaluations and a public aggregate report.

## Current State

- The public BloomBouquet UI only lists published projects and evaluation reports.
- Production currently has zero public projects, so the evaluator worker has no real Evaluation Run to claim.
- `POST /api/bloom-bouquet/teams`, `POST /api/bloom-bouquet/projects`, and `POST /api/bloom-bouquet/projects/{projectId}/submissions` already exist.
- `BloomBouquetProjectRepository` already has an owner-scoped project query, but no owner project-list API currently exposes it.
- Publishing a Submission already creates an Evaluation Run with status `QUEUED` and marks the Project published.
- The production evaluator worker is online in `runtime=local`, and production deployment has already proven a real Qwen JSON inference through `createLocalEvaluatorTransport()`.
- 꽃다발 login currently establishes an HttpOnly `bouquet_session` cookie.
- BloomBouquet management endpoints currently expect legacy `JwtAuthenticationToken`, so a 꽃다발-authenticated browser cannot use them yet.

## Chosen Architecture

Use the existing BloomBouquet APIs and existing 꽃다발 session as the source of identity. Do not add a second admin account system, a special test-only endpoint, or direct DB seed path.

The change has two coordinated pieces:

1. **Bouquet session -> Spring Security bridge**
   - Resolve the existing `bouquet_session` cookie on each request.
   - When valid, create a dedicated authenticated principal for the 꽃다발 account.
   - Keep Spring Security stateless; the cookie is resolved per request rather than creating an HTTP server session.
   - BloomBouquet owner endpoints accept only this dedicated 꽃다발 authentication for owner identity.
   - Existing public endpoints, worker token authentication, legacy JWT authentication, and OAuth project login behavior remain intact.

2. **`?mode=manage` management UI**
   - Reuse the existing Bloom web application shell.
   - Require a valid 꽃다발 session before showing management controls.
   - Provide a guided three-stage flow: Team -> Project -> Submission.
   - Persist recoverability across refresh by loading owner Teams and Projects from the backend.
   - After Submission creation, show the created Evaluation Run and route the user back to the public gallery/report flow for status tracking.

This keeps production behavior identical to the product contract: a normal logged-in owner publishes a real project, and the existing worker evaluates it automatically.

## Authentication Design

### Dedicated authentication type

Introduce a dedicated Spring Security authentication object for 꽃다발 accounts rather than reusing `JwtAuthenticationToken`.

Required properties:

- authenticated user id = `BouquetAuthService.AccountView.id()`
- display name/email remain available to the application when needed
- `getName()` returns the stable account id
- no password, bearer token, or session token is exposed as credentials

### Bouquet session filter

Add a `OncePerRequestFilter` that:

1. skips work when a trusted authentication is already present;
2. reads only the `bouquet_session` cookie;
3. calls `BouquetAuthService.resolveSession()`;
4. sets the dedicated 꽃다발 Authentication in `SecurityContextHolder` when the session is valid;
5. treats missing, invalid, or expired sessions as unauthenticated without leaking token details.

The filter must not change OAuth authorization behavior and must not turn arbitrary cookies into authentication.

### Filter ordering

Worker-token authentication remains first for `/internal/builder/worker/**`.

The 꽃다발 session filter runs before the JWT filter. A valid worker or existing trusted Authentication is not overwritten. The JWT filter remains available for legacy `/api/**` consumers.

### BloomBouquet owner enforcement

The owner operations use the dedicated 꽃다발 account id as `ownerId`:

- `POST /api/bloom-bouquet/teams`
- `GET /api/bloom-bouquet/teams`
- `POST /api/bloom-bouquet/projects`
- `GET /api/bloom-bouquet/projects`
- `POST /api/bloom-bouquet/projects/{projectId}/submissions`

A legacy JWT-authenticated request must not silently become a BloomBouquet owner request. If the principal is not the dedicated 꽃다발 authentication, the controller returns unauthorized/forbidden behavior appropriate to Spring Security.

Public read endpoints remain anonymous:

- `GET /api/bloom-bouquet/public/projects`
- `GET /api/bloom-bouquet/public/projects/{projectId}`
- `GET /api/bloom-bouquet/public/evaluations/{runId}`

## Owner Project Listing API

Add:

`GET /api/bloom-bouquet/projects`

Behavior:

- requires dedicated 꽃다발 authentication;
- derives `ownerId` from the authenticated account, never from a query/body field;
- returns all Projects owned by the account, including unpublished Projects;
- orders by `updatedAt` descending using the existing repository method;
- returns the existing `ProjectResponse`, including `latestSubmission` when present.

This endpoint is required so a management session can recover after refresh and so an owner can publish a later version to an existing Project rather than creating a duplicate Project.

## Management UI

### Routing

`BloomApp.tsx` recognizes:

- default: public BloomBouquet gallery
- `?mode=auth`: existing 꽃다발 login/signup
- `?mode=manage`: new project management UI
- `?mode=builder`: retained legacy Builder surface

The management screen uses a dedicated component and stylesheet instead of expanding `BouquetShowcaseApp.tsx` into an admin UI.

### Session gate

On load, the management UI requests:

`GET /api/bouquet/auth/me`

with `credentials: 'include'`.

If no user is signed in:

- show a clear login-required state;
- link to `?mode=auth&return_to=manage`;
- do not render submission write controls.

`BouquetAuthApp` recognizes only the allowlisted return target `manage`. After successful login/signup, the normal non-OAuth session state offers a direct “프로젝트 관리로 이동” action. Arbitrary redirect URLs are never accepted from `return_to`.

### Stage 1: Team

Load the owner’s teams with:

`GET /api/bloom-bouquet/teams`

The screen supports:

- selecting an existing Team;
- creating a Team with `name` and optional `slug`;
- immediately selecting the newly created Team.

Backend validation remains authoritative. Client-side validation provides only required-field and basic length feedback.

### Stage 2: Project

Load the owner’s Projects with:

`GET /api/bloom-bouquet/projects`

The screen filters/selects Projects for the selected Team and supports creating a new Project with:

- `teamId`
- `name`
- optional `slug`
- `description`

A returned new Project is initially `published=false` and becomes the selected Project for Submission publishing.

Existing owned Projects, including unpublished Projects, remain selectable after page refresh. Published Projects can be selected to publish a later version.

### Stage 3: Submission

Publish with the existing contract:

- `version` — required
- `demoUrl` — required absolute HTTP(S) URL
- `frontendRepositoryUrl` — optional
- `backendRepositoryUrl` — optional
- `requiresAuth` — boolean
- `authRedirectUri` — shown/required by the UI when `requiresAuth=true`; backend remains authoritative

When `requiresAuth=true`, the existing backend registers the Submission as a 꽃다발 OAuth client and returns `bouquetClientId` / `bouquetRedirectUri`.

A successful response must contain:

- `evaluationRunId`
- `evaluationStatus = QUEUED`

The UI then shows a success state containing the Run id and links back to the public gallery. No client-side call directly starts or completes evaluation.

## Evaluation Lifecycle UI

The public gallery already renders `QUEUED`, `RUNNING`, and `COMPLETED` labels and can open the public evaluation report by `evaluationRunId`.

For this feature:

- after Submission success, navigate or link to the public gallery;
- refresh the project list when returning to the public surface;
- do not add a privileged evaluator-control UI;
- the worker remains the only actor that claims and completes Evaluation Runs.

The first production E2E acceptance check observes:

1. Submission response reports `QUEUED`;
2. worker log records the claimed Run;
3. public report reaches `RUNNING` while independent results are being persisted;
4. required Agent evaluations are present;
5. report reaches `COMPLETED` with `overallScore`, `overallStars`, and `reportSummary`.

## API Client Behavior

Management fetches use:

- same-origin relative paths;
- `credentials: 'include'` for 꽃다발 cookie authentication;
- `Content-Type: application/json` for writes;
- normalized Korean user-facing error messages;
- no access token stored in Local Storage or Session Storage.

A 401 response moves the UI back to the login-required state. A validation 400 preserves user-entered form fields and displays the server message safely as text.

## Security Requirements

- Never expose the `bouquet_session` value to React code.
- Keep the session cookie HttpOnly, Secure, SameSite=Lax, and path `/` as currently implemented.
- Do not persist passwords, OAuth codes, worker tokens, or session tokens in browser storage.
- Do not make `/internal/builder/worker/**` callable from the management UI.
- Management reads/writes derive `ownerId` from authenticated server-side identity only; no `ownerId` request field is accepted.
- Do not loosen `/api/**` globally to `permitAll` to make the management UI work.
- Do not accept arbitrary `return_to` URLs; only the symbolic `manage` target is allowed.
- Existing URL validation and public-GitHub evidence restrictions remain backend/evaluator responsibilities.
- Render backend error messages as React text, never as HTML.

## Backend Test Strategy

Extend the existing BloomBouquet registration E2E test so the primary owner flow uses the real 꽃다발 session cookie instead of manually injecting `JwtAuthenticationToken`.

The test should prove:

1. signup/login creates a valid `bouquet_session` cookie;
2. the cookie can create/list a Team;
3. the cookie can create a Project owned by that account;
4. owner project listing returns unpublished and published Projects after refresh-equivalent requests;
5. the cookie can publish a Submission;
6. publishing queues an Evaluation Run;
7. an unauthenticated owner request is rejected;
8. a legacy JWT principal is not accepted as a 꽃다발 project owner;
9. public project/report endpoints remain anonymous;
10. worker-token claim/heartbeat behavior remains unchanged.

Existing Bouquet auth service tests continue to cover login/session/OAuth semantics.

## Frontend Test / Policy Strategy

Add focused policy/unit coverage for routing and management API behavior rather than browser automation that depends on production.

At minimum verify:

- `mode=manage` is routed to the management component;
- management API requests use `credentials: 'include'`;
- login-required state does not expose write controls;
- `return_to` only accepts `manage`;
- owner Projects are reloaded through `GET /api/bloom-bouquet/projects`;
- Submission success requires/uses the returned `evaluationRunId` and `QUEUED` state;
- no management code references `/internal/builder/worker/`.

The repository Harness remains the merge gate for web build, backend tests, Bloom runtime, worker build, desktop/runtime checks, and invariants.

## Expected Files

Likely new files:

- `backend/src/main/java/com/playground/config/BouquetAuthenticationToken.java`
- `backend/src/main/java/com/playground/config/BouquetSessionAuthFilter.java`
- `backend/src/test/java/com/playground/config/BouquetSessionAuthFilterTest.java` or equivalent focused coverage
- `bloom-web/src/app/BouquetManageApp.tsx`
- `bloom-web/src/app/bouquet-manage.css`
- focused Bloom web management policy test(s), following the repository’s existing test conventions

Likely modified files:

- `backend/src/main/java/com/playground/config/SecurityConfig.java`
- `backend/src/main/java/com/playground/domain/bloombouquet/controller/BloomBouquetController.java`
- `backend/src/main/java/com/playground/domain/bloombouquet/service/BloomBouquetService.java`
- `backend/src/test/java/com/playground/domain/bloombouquet/BloomBouquetProjectRegistrationE2ETest.java`
- `bloom-web/src/app/BloomApp.tsx`
- `bloom-web/src/app/BouquetAuthApp.tsx`
- `bloom-web/src/app/BouquetShowcaseApp.tsx` only if a management-navigation entry is needed; do not mix form logic into the showcase component
- package/test configuration only if required by the existing test runner

`BloomBouquetProjectRepository` already contains the owner-scoped query needed by the new list endpoint, so no repository schema/query redesign is expected.

## Deployment and Production Verification

No new database migration or service is required.

After merge:

1. Harness must pass on the merge SHA.
2. `Deploy to Server` must succeed.
3. `Deploy Bloom Worker` must remain successful, including the existing real local inference smoke.
4. Open `?mode=auth`, create/login to a 꽃다발 account.
5. Open `?mode=manage`.
6. Create one Team, Project, and Submission using an actually reachable demo URL and, when available, public GitHub repository URL(s).
7. Verify the Submission is visible publicly with `QUEUED`.
8. Observe the production evaluator worker claim the Run.
9. Verify the public report reaches `COMPLETED` and contains all roles required by that Submission.
10. Verify the public BloomBouquet card shows the aggregate score/stars and opens the stored report.
11. Reload `?mode=manage` and verify the created Team/Project can be selected again for a later version.

The E2E project should be a real project intended to remain in BloomBouquet, not a fake database fixture. If a temporary test project is unavoidable, cleanup is a separate explicit product action; this feature does not add destructive delete APIs.

## Non-goals

- Team/Project deletion
- Editing an existing Team or Project
- Editing or deleting a published Submission
- Manual retry/cancel controls for evaluator Runs
- Admin impersonation
- Replacing the existing evaluator architecture
- Replacing 꽃다발 OAuth with another provider
- Broad removal of legacy JWT auth outside BloomBouquet ownership flows
- Direct database seeding for production E2E
