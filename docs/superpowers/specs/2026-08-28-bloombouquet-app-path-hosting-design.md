# BloomBouquet App Path Hosting Design

**Date:** 2026-08-28

## Goal

BloomBouquet is the public project launcher and evaluator showcase. It does not require users to log in from the main page. Each project remains its own web application and starts shared Bouquet authentication only when the user chooses to log in inside that project.

All public project sites are exposed under the single BloomBouquet origin instead of consuming one GSM-SV HTTPS subdomain per project.

Canonical structure:

- `https://bloombouquet.https.gsmsv.site/` — BloomBouquet project launcher/showcase
- `https://bloombouquet.https.gsmsv.site/apps/evidence-vault/` — Evidence Vault
- `https://bloombouquet.https.gsmsv.site/apps/<project-slug>/` — future project apps

## Approved Product Behavior

1. BloomBouquet main is a launcher/showcase, not the login entry point.
2. Public main shows project cards, evaluation status, score, and report access.
3. Public main does not show a Bouquet login button.
4. A project card opens the project application on the same BloomBouquet origin under `/apps/<slug>/`.
5. Project login begins only from inside that project.
6. The shared Bouquet identity provider remains hosted by BloomBouquet infrastructure.
7. Operator project management remains available as a non-publicly-promoted management surface; it is not presented as a normal visitor action on the showcase.

## Considered Approaches

### A. Path-aware applications behind Nginx — selected

Each application runs on its own loopback port and is configured with a stable public base path. Nginx routes the matching path prefix to the corresponding loopback upstream.

Example:

- BloomBouquet root: `127.0.0.1:3000`
- Evidence Vault: `127.0.0.1:3011`, base path `/apps/evidence-vault`

Advantages:

- Next.js assets, navigation, route handlers, and OAuth callbacks all agree on the same public path.
- Each project stays independently deployable.
- One external domain can host many projects.
- No HTML rewriting or iframe boundary is required.

### B. Strip `/apps/<slug>` in Nginx without modifying the application — rejected

This would let the upstream believe it lives at `/`, but generated `/_next/*`, `/auth/*`, redirects, and raw absolute links would escape the project prefix. It is fragile for Next.js and authentication flows.

### C. Embed each project in an iframe — rejected

This preserves independent origins internally but introduces navigation, cookie, CSP, accessibility, sizing, and authentication problems. It also does not behave like entering the project website directly.

## Gateway Architecture

The GSM-SV HTTPS route continues to expose only:

`bloombouquet.https.gsmsv.site -> VM internal port 80`

The VM Nginx server for that host becomes the project gateway.

Routing contract:

```nginx
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
}

location / {
    proxy_pass http://127.0.0.1:3000;
}
```

The Evidence Vault location deliberately uses `proxy_pass` without a trailing URI segment so the upstream receives `/apps/evidence-vault/...`. Next.js is configured to understand that prefix through `basePath`.

Future projects receive one explicit location block and one dedicated loopback port. Dynamic arbitrary proxying from URL input is not allowed.

## Evidence Vault Base Path Contract

Evidence Vault sets:

```ts
basePath: "/apps/evidence-vault"
```

in `next.config.ts`.

The application must not depend on browser root-relative raw URLs that bypass Next.js base-path handling. Existing raw anchors and client-side fetches are moved behind a small path helper, for example:

```ts
export const APP_BASE_PATH = "/apps/evidence-vault";
export function appPath(path: string) { ... }
```

Rules:

- `next/link` may continue using logical application-relative routes because Next applies `basePath`.
- Raw `<a href>` application routes must use the helper or `Link`.
- Browser `fetch` calls to Evidence Vault route handlers must use the helper.
- Server-to-server Bouquet API calls continue targeting the Bouquet provider origin directly and do not use the Evidence Vault base path.

## Authentication Flow

The user enters Evidence Vault first and only sees Bouquet authentication after choosing the project login action.

Flow:

1. Visitor opens `/apps/evidence-vault/`.
2. Visitor selects `꽃다발로 로그인` inside Evidence Vault.
3. Evidence Vault starts OAuth at `/apps/evidence-vault/auth/bouquet/start`.
4. The route redirects to the Bouquet provider on `https://bloombouquet.https.gsmsv.site/` using `mode=auth` and PKCE.
5. After provider login/consent, the provider redirects to `/apps/evidence-vault/auth/bouquet/callback`.
6. Evidence Vault exchanges the authorization code server-to-server and creates the project-local session.
7. User returns to `/apps/evidence-vault/dashboard`.

Production environment contract becomes:

- `APP_BASE_URL=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/`
- `BOUQUET_BASE_URL=https://bloombouquet.https.gsmsv.site`
- `BOUQUET_REDIRECT_URI=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/callback`

`AuthConfig` validation must explicitly allow and require this exact callback path in production.

## Cookie Isolation

Although the applications share one browser origin, project session cookies must remain scoped to the project path.

Evidence Vault cookie contract:

- `ev_oauth_attempt` path: `/apps/evidence-vault/auth/bouquet`
- `ev_session` path: `/apps/evidence-vault`
- HttpOnly: true
- Secure in production: true
- SameSite: Lax

The Bouquet provider session may remain root-scoped because it represents the shared identity-provider session. BloomBouquet main still does not expose visitor login controls.

This prevents Evidence Vault project cookies from being sent to unrelated future project paths.

## BloomBouquet Main UI

`BouquetShowcaseApp` remains backed by the public BloomBouquet project/evaluation APIs.

Public showcase changes:

- remove the public `꽃다발 로그인` action;
- remove the public `프로젝트 관리` promotion from the normal visitor surface;
- keep project evaluation/report information;
- project links navigate in the same tab so browser Back naturally returns to the launcher;
- canonical hosted submissions use `https://bloombouquet.https.gsmsv.site/apps/<slug>/` as their demo URL.

The management surface itself is not deleted. Operators may still reach it directly through the management mode while project registration is required.

## Project Registration, OAuth Client Bootstrap, and Evaluation

Path hosting does not bypass the existing BloomBouquet project/submission model.

The existing `SubmissionResponse` returns `bouquetClientId` and `bouquetRedirectUri`. A `requiresAuth=true` Submission creates the OAuth client and evaluation Run together. Therefore the path migration must not assume a client with the new callback exists before the new Submission is created.

Evidence Vault bootstrap contract:

1. Confirm there is no unrelated Bloom evaluation in `RUNNING` state and stop the evaluator worker before creating the migration Submission.
2. Through the normal authenticated BloomBouquet management flow, publish a new Evidence Vault Submission with:
   - `demoUrl=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/`
   - `requiresAuth=true`
   - `authRedirectUri=https://bloombouquet.https.gsmsv.site/apps/evidence-vault/auth/bouquet/callback`
   - canonical Evidence Vault frontend/backend repository URLs.
3. Read the returned `bouquetClientId` from the normal Submission response; do not read or modify the production DB directly.
4. Put that client ID and the new app/provider/callback URLs into the Evidence Vault server-only environment.
5. Deploy/restart Evidence Vault under the new base path and verify OAuth end-to-end.
6. Resume the evaluator worker only after Evidence Vault is reachable and its login/callback flow is proven.
7. Observe the queued Submission Run through `RUNNING -> COMPLETED` and preserve the resulting evaluation evidence.

If a migration Submission already exists for the exact new demo/callback contract, reuse its returned client ID rather than creating a duplicate Submission.

## Deployment Sequence

To avoid a broken callback window:

1. Merge and deploy the pending BloomBouquet server-path migration so `/home/ubuntu/bloombouquet` is canonical for every Bloom runtime, including the evaluator LLM.
2. Add Evidence Vault base-path support and tests on its repository while the existing standalone domain remains available.
3. Prepare the BloomBouquet Nginx `/apps/evidence-vault/` route and validate the candidate config with `nginx -t` before reload.
4. Ensure there is no unrelated `RUNNING` evaluation and stop the evaluator worker for the short auth-client bootstrap window.
5. Publish the normal authenticated Evidence Vault migration Submission using the new path-hosted demo URL and callback URI, then capture the returned `bouquetClientId`.
6. Update the Evidence Vault server-only environment with the new app URL, provider URL, callback URI, and returned client ID.
7. Build and restart Evidence Vault on loopback port 3011 with `basePath=/apps/evidence-vault` and reload the validated Nginx gateway config.
8. Verify public landing page, prefixed `/_next` assets, path health route, login start redirect, provider callback, project session, and dashboard.
9. Resume the evaluator worker and verify the migration Submission Run lifecycle.
10. Verify the BloomBouquet project card opens the canonical path-hosted Evidence Vault URL.
11. Remove `evidence-vault.https.gsmsv.site` from GSM-SV only after all new-path checks pass.

The current `evidence-vault.https.gsmsv.site` route remains a rollback path until step 11.

## Failure and Rollback Rules

- Nginx config changes require `nginx -t` before reload.
- Evidence Vault old external route is not removed before the new route and OAuth callback succeed.
- Evidence Vault production env is backed up before changing app/callback/client values.
- If project deployment fails after the migration Submission is created, keep the old external route and restore the previous Evidence Vault SHA/env/process while the evaluator remains stopped until the migration is either repaired or deliberately allowed to fail.
- Never resume the evaluator under the assumption that the new path works; run the explicit public and OAuth smoke checks first.
- Do not create a second migration Submission merely to repair deployment; reuse the client ID from the first exact-contract Submission.
- No direct production DB mutation is used to repair project/submission/auth records.

## Testing Requirements

### Evidence Vault

Add RED→GREEN tests proving:

- `next.config.ts` has `/apps/evidence-vault` basePath;
- browser session probe calls the prefixed route;
- login/start, dashboard, sign-out, and other raw application links stay under the base path;
- auth config requires the prefixed callback URI;
- OAuth-attempt and project-session cookie paths are project-scoped;
- callback success and failure redirect under the base path;
- production preview contract uses the BloomBouquet origin plus project path;
- existing PostgreSQL migration, unit, and production build gates remain green.

### BloomBouquet

Add RED→GREEN policy/integration coverage proving:

- public showcase no longer presents visitor login/manage actions;
- hosted project demo links stay on the canonical BloomBouquet origin;
- deployed Nginx config contains the Evidence Vault exact path-to-port mapping;
- root BloomBouquet routes still resolve to port 3000;
- public `/apps/evidence-vault/` and a Next asset return successfully after deployment.

### Production E2E

Required before deleting the standalone Evidence Vault domain:

- BloomBouquet root: 200 and BloomBouquet title marker;
- Evidence Vault path root: 200 and Evidence Vault marker;
- Evidence Vault path health: 200;
- Evidence Vault project login redirects to Bouquet provider;
- provider callback returns to Evidence Vault path;
- authenticated Evidence Vault session resolves;
- migration evaluation reaches `COMPLETED` after the worker is resumed;
- public standalone Evidence Vault domain is deleted only after the above pass.

## Security Boundaries

- No arbitrary user-provided upstream ports or proxy destinations.
- All app path mappings are operator-controlled static configuration.
- No auth tokens are placed in query strings beyond the existing short-lived OAuth authorization code/state contract.
- Project cookies are path-scoped.
- Shared provider cookie remains HttpOnly/Secure.
- Nginx forwards only required proxy headers.
- Existing evaluator worker/internal endpoints are not exposed through project path routing.
- Evaluator pause/resume is an operator-only deployment action and never exposed to the public management UI.

## Non-goals

This change does not:

- merge Evidence Vault source code into the Playground repository;
- turn projects into React components rendered by BloomBouquet;
- iframe projects;
- create per-project external domains;
- remove project-local sessions;
- make BloomBouquet main a login screen;
- redesign evaluator scoring;
- add dynamic self-service Nginx proxy creation;
- rename every legacy internal artifact or PM2 process name in the same change.

## Completion Criteria

The migration is complete when:

1. `bloombouquet.https.gsmsv.site/` remains the public launcher without visitor login UI.
2. `bloombouquet.https.gsmsv.site/apps/evidence-vault/` serves the Evidence Vault application and its assets.
3. Evidence Vault initiates shared authentication only from inside Evidence Vault.
4. OAuth callback and project session work entirely through the path-hosted URL.
5. BloomBouquet project card opens the path-hosted Evidence Vault site.
6. The migration Evidence Vault Submission uses the path-hosted demo URL and its evaluator Run reaches `COMPLETED`.
7. `evidence-vault.https.gsmsv.site` is removed from GSM-SV.
8. The pattern is documented well enough that the next project needs only a unique slug, internal port, app base-path support, and one static gateway mapping.
