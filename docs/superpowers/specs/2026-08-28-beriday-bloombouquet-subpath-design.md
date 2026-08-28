# Beriday BloomBouquet Subpath Design

## Goal
Deploy Beriday as a first-class BloomBouquet child application at `https://bloombouquet.https.gsmsv.site/apps/beriday/` without changing the existing BloomBouquet root or Evidence Vault routes.

## Architecture
Beriday remains an independent Vite application. Its production build uses `/apps/beriday/` as the Vite base and loads runtime data relative to that base. On the server, Beriday is checked out under `/home/ubuntu/bloombouquet/apps/beriday`, built there, and served by PM2 on port `3012` with SPA fallback. BloomBouquet Nginx proxies `/apps/beriday/` to that fixed upstream while preserving the existing root `3000` and Evidence Vault `3011` mappings.

## Beriday runtime behavior
- Vite production base is `/apps/beriday/` so JS/CSS assets resolve below the BloomBouquet child path.
- Runtime data manifest is addressed relative to `import.meta.env.BASE_URL`, producing `/apps/beriday/data/runtime/manifest.json` in production and preserving valid development behavior.
- Manifest-owned shard paths continue to be resolved relative to the manifest URL; no raw region value is converted into a path.
- Canonical production data and runtime shard validation remain unchanged and fail closed.

## Server process
- Repository: `BloomBouquet/beriday`.
- Working copy: `/home/ubuntu/bloombouquet/apps/beriday`.
- Branch deployed: `main`.
- Build: `npm ci` followed by `npm run build`.
- Runtime: `pm2 serve dist 3012 --spa --name beriday`.
- Local readiness marker: `http://127.0.0.1:3012/` must return Beriday HTML and `/data/runtime/manifest.json` must be valid JSON with runtime schema version 1.

## Gateway
Nginx adds an exact redirect from `/apps/beriday` to `/apps/beriday/` and a fixed `location ^~ /apps/beriday/` proxy to `http://127.0.0.1:3012/`. The trailing slash on `proxy_pass` intentionally strips the external `/apps/beriday/` prefix before requests reach the static server, allowing the Vite-built directory tree to remain rooted at `dist/`.

## Deployment workflow
A manual-only Playground workflow deploys the Beriday app before mutating the gateway. It connects to the existing BloomBouquet server with the existing SSH credential, clones or updates `BloomBouquet/beriday`, builds `main`, restarts only the `beriday` PM2 process, and checks the local root and runtime manifest. The existing BloomBouquet gateway workflow is then updated to require the Beriday local/public route in its probes and rollback validation.

## Failure handling
- Beriday build failure leaves the prior PM2 process untouched until a valid new `dist` exists.
- A failed PM2 start or local smoke check fails deployment and surfaces PM2 diagnostics.
- Gateway deployment continues to use its existing backup/rollback trap; public route failure restores the previous Nginx config.
- No existing root, auth, worker, or Evidence Vault process is restarted by Beriday deployment.

## Verification
Beriday CI must cover the subpath URL contract, runtime loader contract, all existing domain/UI tests, typecheck, and production build. Playground policy tests must assert the fixed 3012 mapping and manual-only deploy behavior. Final operational verification requires local port 3012 readiness, Nginx syntax success, `https://bloombouquet.https.gsmsv.site/apps/beriday/` HTTP 200, and a successful public runtime manifest request.
