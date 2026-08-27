# Bloom Worker

`bloom-worker/` is the headless process that claims Builder control-plane runs and executes them through Bloom Runtime.

Bloom is separate from Luna. Luna is only the desktop pet application; Bloom owns PM planning, Agent teams, GitHub/Codex execution, Review/QA, durable snapshots, recovery, and integration.

## Build

```bash
pnpm run build:bloom-worker
pnpm run build:bloom-runtime-bridge
```

## Required runtime dependencies

- Git
- GitHub CLI (`gh auth login`)
- Codex CLI (`codex login`, ChatGPT authentication mode)
- the Bloom Runtime bridge binary

## Environment

Required:

```text
BUILDER_WORKER_TOKEN=shared-worker-protocol-secret
BLOOM_GITHUB_ORGANIZATION=target-org
BLOOM_WORKSPACE_ROOT=/srv/bloom-workspaces
```

Optional:

```text
BLOOM_API_BASE_URL=http://localhost:8080
BLOOM_WORKER_ID=bloom-host-01
BLOOM_TEAM_ID=rose
BLOOM_TEAM_NAME=Rose
BLOOM_RUNTIME_BRIDGE_PATH=/custom/path/bloom-runtime-bridge
BLOOM_WORKER_POLL_INTERVAL_MS=5000
BLOOM_WORKER_HEARTBEAT_INTERVAL_MS=30000
```

The worker accepts the previous `BUILDER_*` runtime variable names as temporary fallbacks, except `BUILDER_WORKER_TOKEN`, which remains the backend protocol token for now.

## Run

```bash
pnpm run start:bloom-worker
```

A claimed run is completed only after the executor finishes Intake → PM → repository bootstrap → task DAG execution → Review/Reviewer/QA gates → integration and persists the final snapshot.
