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

Preferred build contract:

```text
bloom-web/ source
  ↓ pnpm run build:bloom-web
root dist/
  ↓ server/index.js express.static(dist)
https://playground.https.gsmsv.site/
```

`build:bloom-web` will emit directly to `dist/`, eliminating the current split between `dist/` and `dist-bloom/`. This keeps `server/index.js` and the existing Nginx/PM2 topology simple: the root server still serves `dist`, but that directory now contains BloomBouquet only.

### Backend/API path

```text
Browser
  ├─ GET /                     → BloomBouquet static app
  └─ /api/bloom-bouquet/**    → Node proxy → Spring Boot → MySQL
```

Public project/report endpoints remain unauthenticated as already defined. Team/project administration remains under the existing authenticated API policy.

### Legacy routes

All product-hosting routes under `/apps/*` are removed from the Express server. Requests to old `/apps/<legacy-id>` URLs will fall through to the BloomBouquet SPA instead of serving legacy bundles. No compatibility redirect is required for this cutover.

## Build and Workspace Changes

Root scripts are simplified around BloomBouquet:

- `dev` runs the Node server plus `bloom-web` Vite dev server where useful.
- `build` builds BloomBouquet.
- `build:bloom-web` type-checks `bloom-web` and outputs to `dist/`.
- `build:web` aliases the BloomBouquet build only.
- `build:apps` and legacy per-app production builds are removed.
- `build:all` builds BloomBouquet and the retained runtime requirements only.
- Bloom runtime, worker, Rust bridge, desktop, and Harness commands remain available.

`pnpm-workspace.yaml` may keep `apps/*` because `apps/desktop` remains a workspace member, but the removed app directories no longer participate.

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
9. verify that `dist/index.html` exists and the root health request returns the BloomBouquet shell.

The hostname and server remain unchanged.

## Deletion Strategy

The legacy source deletion is done in one dedicated commit using top-level directory removals where possible, followed by a smaller configuration commit. `apps/desktop` is explicitly excluded from the mass deletion. This avoids accidentally deleting the runtime tooling still used by Bloom policy tests and worker compilation.

Before deletion, the implementation must derive the exact `apps/` top-level directory list from the repository tree and construct a removal set equal to `all apps/* directories - {desktop}`.

## Error and Recovery Behavior

- If `dist/index.html` is missing after build, deployment fails before PM2 restart.
- If the Node process cannot start, deployment fails and records the existing deployment error artifact/message.
- If Spring Boot is unchanged, the existing backend process is left running.
- If the root HTTP verification does not contain the BloomBouquet shell/title after restart, deployment fails rather than reporting success.
- No database destructive migration is part of this cutover.

## Verification

Required checks before merge:

1. `pnpm install --frozen-lockfile`
2. `pnpm run build:bloom-web`
3. `test -f dist/index.html`
4. `bash backend/gradlew -p backend test --no-daemon`
5. `pnpm run test:bloom-runtime`
6. `pnpm run build:bloom-worker`
7. retained desktop/runtime checks from Harness
8. repository scan proving no `playground-web` source remains
9. repository scan proving no legacy `apps/*` directory remains except `apps/desktop`
10. server source scan proving no `/apps/` static product routes remain
11. GitHub Actions Harness pass
12. production deploy pass after merge to `main`
13. live request to `https://playground.https.gsmsv.site/` shows BloomBouquet rather than the old Playground portal

## Production Blockers

- Production cutover requires merge to `main` because the current deploy workflow runs from `main` pushes.
- The deployment account must retain the current SSH/PM2/Nginx secrets and permissions.
- Actual Agent evaluation execution remains a separate runtime capability; this cutover only makes the BloomBouquet gallery/report product the public root service.

## Non-goals

- Replacing the Playground server host or provisioning a new server.
- Replacing MySQL.
- Rewriting Spring Boot.
- Replacing shared 꽃다발 authentication.
- Completing the evaluator worker engine in the same cutover.
- Performing a broad cleanup of every historical Node server API handler in the same deployment-sensitive change.
