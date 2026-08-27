# BloomBouquet Production Cutover Design

Date: 2026-08-27

## Goal

Replace the public Playground portal served at `https://playground.https.gsmsv.site/` with the new BloomBouquet project gallery and evaluation experience. Remove the old Playground portal and legacy hosted web-app products from the active product surface while preserving the server, Spring Boot backend, database, Bloom runtime/worker, desktop runtime dependency, deployment infrastructure, and shared 꽃다발 authentication work.

## Product Definition

- **User:** people browsing projects published by teams such as 팀 백합, 팀 장미, and future teams.
- **Primary job:** discover a deployed project, open its live service, and inspect its versioned senior-Agent evaluation report.
- **MVP workflow:** open the root domain → browse BloomBouquet projects → open a project → see latest score/stars and submission history → open Agent evaluation report → launch the actual project service.
- **Auth:** uploaded projects that require authentication use the shared 꽃다발 signup/login contract. BloomBouquet itself must not introduce a competing per-project auth system.
- **Persistence:** existing Spring Boot/MySQL BloomBouquet entities remain the source of truth for Team, Project, Submission, EvaluationRun, and AgentEvaluation.

## Scope

### Remove from the active product/repository surface

1. `playground-web/` legacy portal source.
2. Legacy hosted web apps and companion app directories under `apps/`, except `apps/desktop` which is still required by Bloom runtime tooling.
3. Legacy `/apps/*` static serving routes in `server/index.js`.
4. Root build scripts that build the old Playground portal or every legacy app.
5. Deployment assertions and build commands for removed legacy apps.
6. Legacy app registry entries that advertise deleted Playground products.

### Preserve

1. `bloom-web/` as the only public root web UI.
2. `bloom-runtime/` and `bloom-worker/` for evaluator/runtime work.
3. `apps/desktop/` because existing TypeScript/Rust policy/build commands depend on it.
4. `backend/` and MySQL persistence.
5. `server/` as the Node reverse-proxy/static-serving process.
6. `ecosystem.config.js`, Nginx/PM2 deployment assumptions, GitHub Actions deployment, and current server location.
7. Existing BloomBouquet APIs and shared 꽃다발 authentication implementation.
8. Old server API handlers are not aggressively deleted in this cutover unless they prevent the new root service from running; deeper server API cleanup is a separate follow-up to reduce production risk.

## Architecture

### Public serving path

The Node server continues to own port 3000 and proxy API traffic to Spring Boot. The production root static directory changes to the BloomBouquet build output.

```text
bloom-web/ source
  ↓ pnpm run build:bloom-web
root dist/
  ↓ server/index.js express.static(dist)
https://playground.https.gsmsv.site/
```

`build:bloom-web` emits directly to `dist/`, eliminating the current split between `dist/` and `dist-bloom/`.

### Backend/API path

```text
Browser
  ├─ GET /                     → BloomBouquet static app
  └─ /api/bloom-bouquet/**    → Node proxy → Spring Boot → MySQL
```

The shared 꽃다발 Identity Provider endpoints remain under `/api/bouquet/**`. Project submissions with authentication receive a dedicated OAuth client and use Authorization Code + PKCE S256 to reuse the central 꽃다발 account.

### Legacy routes

All product-hosting routes under `/apps/*` are removed from the Express server. Requests to old `/apps/<legacy-id>` URLs fall through to the BloomBouquet SPA instead of serving legacy bundles.

## Build and Workspace Changes

- `dev` runs the Node server plus Bloom Web development server.
- `build` builds BloomBouquet.
- `build:bloom-web` type-checks `bloom-web` and outputs to `dist/`.
- `build:web` aliases the BloomBouquet build only.
- `build:apps` and legacy per-app production builds are removed.
- `build:all` builds BloomBouquet plus retained runtime requirements only.
- Bloom runtime, worker, Rust bridge, desktop, and Harness commands remain available.
- `pnpm-workspace.yaml` keeps `apps/*` because `apps/desktop` remains a workspace member.

## Deployment Changes

`.github/workflows/deploy.yml` must stop building and verifying legacy apps. Production deployment should:

1. install root dependencies;
2. build BloomBouquet into `dist/`;
3. build Spring Boot only when backend changes require it;
4. reset the server checkout to `origin/main`;
5. build BloomBouquet on the server;
6. restart the existing `playground` PM2 process;
7. restart backend only when required;
8. reload Nginx;
9. verify that `dist/index.html` exists and the root response contains the BloomBouquet shell.

## Deletion Strategy

The legacy source deletion is performed by removing `playground-web/` and every `apps/*` top-level directory except `apps/desktop`. The removal set is derived from the current repository tree before the deletion commit.

## Error and Recovery Behavior

- Missing `dist/index.html` fails deployment before PM2 restart.
- Node startup failure fails deployment.
- Spring Boot remains running when backend is unchanged.
- Root HTTP verification must identify BloomBouquet before deployment is considered successful.
- No destructive database migration is part of this cutover.

## Verification

1. `pnpm install --frozen-lockfile`
2. `pnpm run build:bloom-web`
3. `test -f dist/index.html`
4. `bash backend/gradlew -p backend test --no-daemon`
5. `pnpm run test:bloom-runtime`
6. `pnpm run build:bloom-worker`
7. retained desktop/runtime Harness checks
8. no `playground-web` source remains
9. no legacy `apps/*` directory remains except `apps/desktop`
10. no `/apps/` static product routes remain in `server/index.js`
11. GitHub Actions Harness passes
12. production deploy passes after merge to `main`
13. `https://playground.https.gsmsv.site/` shows BloomBouquet

## Non-goals

- New server provisioning
- Replacing MySQL or Spring Boot
- Replacing shared 꽃다발 authentication
- Completing the evaluator worker engine in this cutover
- Broad deletion of every historical Node API handler
