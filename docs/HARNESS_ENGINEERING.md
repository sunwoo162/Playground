# BloomBouquet Harness Engineering

The repository Harness now protects a single public product boundary: BloomBouquet at the root domain.

## Invariants

`pnpm run harness` fails unless all of the following are true:

- `playground-web/` does not exist.
- `apps/` contains only `apps/desktop`.
- `package.json` has no `build:playground-web` or `build:apps` script.
- `build:bloom-web` emits to repository-level `dist/`.
- `server/index.js` contains no legacy `/apps/*` static product routes.
- `bloom-web/index.html` identifies the public shell as `BloomBouquet`.
- the production build has created `dist/index.html` and that artifact is the BloomBouquet shell.

## CI coverage

`.github/workflows/harness.yml` performs:

1. frozen pnpm install;
2. BloomBouquet web build;
3. Spring Boot backend tests;
4. retained desktop runtime build;
5. Bloom Agent policy tests;
6. headless worker build;
7. desktop Tauri Rust check;
8. Bloom runtime Rust check;
9. repository invariants.

## Why `apps/desktop` remains

`apps/desktop` is no longer a public Playground product. It remains because Bloom policy-test compilation and Tauri/Rust runtime checks still depend on its workspace/tooling setup. When those dependencies move to a server-only package, it can be removed in a dedicated migration.

## Production boundary

The Node process serves `dist/` at `/` and proxies API traffic to Spring Boot. There is no `/apps/<id>` hosting layer anymore. Published projects are represented by BloomBouquet project/submission records and open their own deployment URL from the gallery.

## Commands

```bash
pnpm run build:bloom-web
pnpm run harness
pnpm run test:bloom-runtime
pnpm run build:bloom-worker
```
