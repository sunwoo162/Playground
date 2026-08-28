# BloomBouquet

BloomBouquet is a project showcase and evaluation platform. Teams publish real web projects, BloomBouquet keeps versioned submissions, and independent 10+ year senior Agents leave evidence-based technical evaluation reports with scores and star ratings.

Production: `https://bloombouquet.https.gsmsv.site/`

## Product flow

```text
Team
  → Project
  → Submission / version
  → Evaluation Run
  → Independent senior-Agent reviews
  → Process Evaluator aggregation
  → Score + stars + versioned report
```

Independent evaluators include user, UX, frontend, backend, security, accessibility, performance, QA, documentation, and code-review roles. Each evaluation records Assessment, Evidence, Severity, Impact, Recommendation, Priority, Confidence, and relevant technical terminology.

## Shared authentication

Projects that require accounts use the shared **꽃다발** Identity Provider. Each authenticated submission receives its own OAuth client and uses Authorization Code + PKCE S256. Projects do not implement or store a separate email/password credential database.

## Repository layout

```text
bloom-web/       # public BloomBouquet React/Vite UI
backend/         # Spring Boot APIs, persistence, 꽃다발 Identity Provider
server/          # root static server + backend proxy + Builder GitHub auth boundary
bloom-runtime/   # Agent policy/orchestration runtime
bloom-worker/    # headless worker
apps/desktop/    # retained runtime/Tauri tooling required by policy/build checks
```

The former `playground-web/` portal and legacy hosted `apps/*` products have been removed. `apps/desktop` is internal runtime tooling, not a public hosted product.

## Development

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

`pnpm run dev` starts the Node server and BloomBouquet Vite app. The web dev server runs on port 5175 and proxies API traffic to the existing backend.

## Build and verification

```bash
pnpm run build:bloom-web
pnpm run harness
pnpm run test:bloom-runtime
pnpm run build:bloom-worker
bash backend/gradlew -p backend test --no-daemon
```

The production web build is written directly to repository-level `dist/`, which the Node server serves at `/`.

## Deployment

Pushes to `main` run the production deployment workflow. The server host, PM2 process topology, Nginx proxy, Spring Boot backend, and MySQL persistence remain unchanged during the domain cutover. The canonical public origin is `https://bloombouquet.https.gsmsv.site/`.
