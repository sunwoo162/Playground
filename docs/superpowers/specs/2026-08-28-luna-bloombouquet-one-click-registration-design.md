# Luna → BloomBouquet One-Click Registration Design

Date: 2026-08-28

## Goal

Replace the manual Team → Project → Submission registration flow for Luna Agent System projects with a Luna-generated registration handoff that reduces the owner interaction to one confirmation click while preserving BloomBouquet owner authentication, URL validation, OAuth client registration, and evaluation queue semantics.

The manual management flow remains available for non-Luna projects.

## Current Problem

BloomBouquet already supports a production owner flow, but it asks the user to manually re-enter data that Luna already knows:

- Luna team (장미, 백합, 튤립, 해바라기, 벚꽃)
- project name and product summary
- GitHub repository
- deployed preview URL
- whether shared 꽃다발 authentication is required
- callback path when authentication is used

The headless Luna runtime already has the selected team, PM plan, repository bootstrap result, and Builder project metadata. Re-entering these values in three separate forms adds friction and creates avoidable mismatch risk.

## Chosen Architecture

Use a **Luna registration handoff URL + transactional one-click registration API**.

The handoff does not grant any new privilege. A signed-in BloomBouquet owner can already create arbitrary Teams, Projects, and Submissions through the manual management flow. The handoff only pre-populates the same data and routes it through a single server transaction.

### 1. Luna registration payload

Add a shared runtime contract with schema version 1:

```ts
type LunaBloomBouquetRegistrationPayload = {
  schemaVersion: 1;
  teamId: "rose" | "lily" | "tulip" | "sunflower" | "cherry-blossom";
  teamName: string;
  projectName: string;
  projectSlug: string;
  description: string;
  version: string;
  demoUrl: string;
  repositoryUrl: string;
  requiresAuth: boolean;
  authRedirectUri: string | null;
};
```

The runtime serializes this payload as UTF-8 JSON, base64url encodes it without padding, and creates:

```text
https://bloombouquet.https.gsmsv.site/?mode=manage&luna=<payload>
```

The handoff is only generated when Luna has a validated PM plan, repository result, and non-empty preview URL.

Default values:

- `teamId` / `teamName`: selected Luna delivery team
- `projectName`: PM `projectName`
- `projectSlug`: normalized PM `repositoryName`
- `description`: PM `productSummary`, capped at the BloomBouquet 4000-character limit
- `version`: `1.0.0`
- `demoUrl`: Builder/Luna preview URL
- `repositoryUrl`: `https://github.com/<repositoryFullName>`
- `requiresAuth`: PM/Builder authentication requirement
- `authRedirectUri`: when auth is required, `<demoUrl without trailing slash>/auth/bouquet/callback`

The payload is a convenience input, not a trusted authorization artifact. The backend re-validates every field.

### 2. Persist the handoff on BuilderProject

Extend `BuilderProject` with nullable `bloomBouquetRegistrationUrl`.

Extend the worker completion result and DTO so the headless executor can return the generated registration URL together with repository and preview URL. `BuilderWorkerRunService.complete()` stores it on the owning BuilderProject.

This makes the handoff durable and recoverable after browser refresh or server restart. Existing Builder projects remain valid with a null handoff URL.

### 3. One-click BloomBouquet API

Add:

```text
POST /api/bloom-bouquet/luna/register
```

Authentication:

- requires the existing dedicated 꽃다발 `BouquetAuthenticationToken`;
- owner identity is always derived server-side from the authenticated session;
- the request never accepts `ownerId`.

Request fields mirror the Luna registration payload.

The service performs one transaction:

1. validate `schemaVersion == 1`;
2. validate team ID is one of the five Luna teams and normalize the canonical team name/slug;
3. find the owner Team by slug, or create it;
4. find the Project in that Team by slug, or create it;
5. validate/reuse an existing same-version Submission only when all immutable publication fields match;
6. otherwise create the Submission using the same URL/auth validation as the manual publication flow;
7. when `requiresAuth=true`, register the existing 꽃다발 OAuth client and persist client ID/redirect URI;
8. create the Evaluation Run in `QUEUED` and publish the Project;
9. return Team, Project, Submission, OAuth client details, and Evaluation Run state.

The operation is idempotent for the same owner/team/project/version payload. A repeated click must return the already-created Submission/Run rather than queue a duplicate evaluation. A conflicting repeated version returns HTTP 409/400 with a clear message rather than silently replacing data.

### 4. Management UI simplification

`BouquetManageApp` detects the `luna` query parameter before rendering the existing three-stage forms.

When the payload is valid and the owner is signed in, show one compact confirmation surface containing:

- `팀 백합` / selected team
- project name
- short description
- demo URL
- GitHub repository
- shared 꽃다발 login yes/no
- callback URL when applicable

Primary action:

```text
BloomBouquet에 등록하고 평가 시작
```

On success show:

- registration complete
- Evaluation Run number
- `QUEUED` state
- OAuth client ID when created
- link to the public BloomBouquet gallery

Secondary action:

```text
직접 수정해서 등록
```

This clears the Luna handoff mode and reveals the existing Team → Project → Submission forms pre-filled where practical. The manual flow is not removed.

Invalid/malformed payloads must not crash the page. Show an error and provide the manual management flow.

### 5. Future automatic registration

The one-click endpoint is intentionally the same domain operation needed for full automatic registration later.

A future trusted machine credential may call an internal wrapper that supplies the same validated payload and owner mapping. This design does not add that credential or automatic approval now.

The first release therefore remains explicit-owner-confirmation only.

## Security Boundaries

- The `luna` URL payload is not trusted and is never treated as proof of ownership.
- Registration requires an authenticated 꽃다발 owner session.
- `ownerId` never comes from the browser request.
- Existing BloomBouquet URL validation remains authoritative.
- `requiresAuth=true` still requires HTTPS demo/callback origin validation.
- OAuth client secrets/tokens are never placed in the handoff URL.
- No worker token, session token, password, OAuth code, or environment secret is encoded in the URL.
- Manual `/internal/builder/worker/**` APIs remain unavailable to the management UI.
- The one-click route must not loosen global `/api/**` Spring Security rules.

## Error Handling

- Missing login: show the existing login-required state and preserve the handoff URL through the allowlisted manage return path.
- Malformed base64/JSON/schema: show `Luna 등록 정보를 읽지 못했습니다.` and reveal manual registration.
- Missing preview URL/repository: Luna does not generate a handoff URL.
- Team/project duplicate: reuse the owner-scoped entity by canonical slug.
- Same version with identical fields: return the existing publication idempotently.
- Same version with different immutable fields: reject as a conflict.
- OAuth client registration failure: roll back Team/Project/Submission/Evaluation changes in the same transaction.
- Evaluation Run creation failure: roll back publication transaction.

## Testing Strategy

### Runtime policy/unit tests

Verify:

- UTF-8 Korean team/project names round-trip through base64url;
- only known Luna team IDs are accepted by the payload builder;
- registration link contains `mode=manage&luna=`;
- auth callback is derived from the demo URL without a double slash;
- no registration URL is generated without preview URL/repository/plan;
- headless executor returns the registration URL on completed projects.

### Backend tests

Extend BloomBouquet registration E2E coverage to prove:

- a 꽃다발 session can call `/api/bloom-bouquet/luna/register`;
- 백합 Team is created automatically on first registration;
- same Team is reused for the next 백합 project;
- Project is created automatically;
- Submission is queued and Project is public;
- shared auth creates bouquet client/callback correctly;
- repeated identical registration is idempotent;
- conflicting same-version registration is rejected;
- unauthenticated and legacy JWT-only calls cannot use the one-click route;
- manual Team/Project/Submission endpoints still work.

Builder worker tests must verify `bloomBouquetRegistrationUrl` is persisted on completion without breaking older null values.

### Frontend policy

Verify `BouquetManageApp`:

- recognizes `luna` handoff mode;
- calls only `/api/bloom-bouquet/luna/register` for one-click publication;
- keeps `credentials: 'include'`;
- does not expose internal worker APIs;
- retains the manual three-stage flow as fallback;
- renders one primary registration action instead of requiring Team/Project/Submission forms in Luna mode.

## Production Behavior

After merge and normal deployment:

1. existing BloomBouquet manual management continues to work;
2. completed Luna Builder projects expose a durable BloomBouquet registration handoff URL;
3. opening the URL with a valid 꽃다발 session shows a one-card confirmation screen;
4. one click creates/reuses Team and Project, publishes Submission, registers shared OAuth client when needed, and queues evaluation;
5. the evaluator remains the only actor that claims and completes the Evaluation Run.

## Non-goals

- fully automatic owner approval in this release
- machine-to-machine BloomBouquet owner impersonation
- destructive Team/Project/Submission deletion
- automatic version bumping for an already-completed BuilderProject
- editing previously published Submission fields
- replacing the manual management console
- changing evaluator architecture
