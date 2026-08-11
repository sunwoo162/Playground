# Harness Engineering For Playground

Harness engineering means building the rails around the products so every app can be checked consistently. In this repository, the harness is responsible for catching drift between:

- The product registry in `docs/app-registry.json`
- The portal app list in `src/entities/app-item/model/apps.ts`
- Static app routes in `server/index.js`
- Root build orchestration in `package.json`
- Built app artifacts under `apps/<id>/dist`

## What Was Added

- `pnpm run harness`
  - Runs `scripts/harness-check.js`.
  - Verifies that registered apps have directories.
  - Verifies that buildable apps have build scripts.
  - Warns when portal/server/build entries are out of sync with the registry.

- `pnpm run verify`
  - Runs `pnpm run build:all`.
  - Runs `pnpm run harness`.
  - Use this before shipping broad product changes.

- `.github/workflows/harness.yml`
  - Runs the fast harness check on pushes to `main` and pull requests.
  - It intentionally does not install every app dependency or run the full build; that remains the job of release/deploy workflows.

## Why This Matters

`Playground` has many apps, extensions, and native companion tools. Without a harness, it is easy to:

- Add an app to the portal but forget the server route
- Add a package app but forget root `build:apps`
- Keep a product in docs but delete or rename the folder
- Ship a template app with no product readiness tracking
- Treat a companion extension as a standalone product before its host app is stable

The harness turns those rules into executable checks.

## Current Policy

- Product truth starts in `docs/app-registry.json`.
- User-facing portal truth is `src/entities/app-item/model/apps.ts`.
- Deployable static routes live in `server/index.js`.
- Buildable Node/Vite apps must expose `pnpm run build`.
- Apps that are not Node packages must be documented as companion/native/static tools.

## Next Harness Layers

The current harness is the foundation. Add these layers next:

1. Route smoke test: start the server and request `/`, `/apps/<id>/`, and one asset for each active app.
2. Browser smoke test: use Playwright to check that key app pages are nonblank at desktop and mobile sizes.
3. App contract tests: define per-app `harness.json` files with primary routes, required permissions, and demo-mode expectations.
4. Extension checks: validate each `manifest.json`, required icons, default URLs, and package zip outputs.
5. Production deploy monitor: after GitHub Actions deploys, request hosted URLs and fail if an app returns a blank page or missing asset.

## Command Reference

```powershell
pnpm run harness
pnpm run verify
```
