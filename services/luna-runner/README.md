# Luna Remote Runner

Luna Remote Runner is the always-on control plane for Agent project execution.

Its purpose is to let the desktop app disconnect, sleep, hibernate, or shut down without making the project lifecycle depend on the laptop process.

## Current scope

The current implementation provides the durable remote job boundary:

- authenticated HTTP control plane
- persisted job queue
- idempotent job submission
- fixed worker executable contract
- restart recovery for queued/running jobs
- job status lookup
- safe queued-job cancellation
- per-job input, result, and log files

The actual Luna project worker is intentionally separate. The runner does not accept arbitrary shell commands from the desktop client. Only the configured `LUNA_RUNNER_WORKER` executable can perform project work.

## Architecture

```text
Luna Desktop
    |
    | authenticated job submission / status polling
    v
Luna Remote Runner
    |
    | durable jobs.json + per-job files
    v
Fixed luna-worker executable
    |
    +--> Git / GitHub CLI
    +--> Codex App Server
    +--> project worktrees / branches / PRs
```

The final architecture moves the orchestration loop to the remote side. The desktop becomes a control and monitoring client instead of the owner of a running Agent process.

## Security boundary

The runner deliberately avoids an API such as `POST /exec { command: ... }`.

Requests can create structured Luna jobs only. The server invokes one administrator-configured executable with fixed arguments:

```text
luna-worker --input <job-input.json> --output <job-result.json>
```

The worker receives structured JSON from a file. `shell: false` is used when the runner spawns it.

All `/v1/*` endpoints require:

```http
Authorization: Bearer <LUNA_RUNNER_TOKEN>
```

`/health` is intentionally unauthenticated and exposes only service readiness metadata.

## Environment

Copy `.env.example` values into the process manager or system service environment. Do not commit real tokens.

Required:

- `LUNA_RUNNER_TOKEN`: long random bearer token

Optional:

- `LUNA_RUNNER_HOST`: default `127.0.0.1`
- `LUNA_RUNNER_PORT`: default `4781`
- `LUNA_RUNNER_DATA_DIR`: default `.luna-runner`
- `LUNA_RUNNER_WORKER`: absolute path to the trusted Luna worker executable

For public access, keep the Node server bound to localhost and put TLS/authenticated reverse proxy infrastructure in front of it instead of exposing the raw port directly.

## API

### Health

```http
GET /health
```

### Submit job

```http
POST /v1/jobs
Authorization: Bearer <token>
Content-Type: application/json
```

Example body:

```json
{
  "projectId": "PROJECT-ABC123",
  "idempotencyKey": "PROJECT-ABC123:run:1",
  "payload": {
    "protocolVersion": 1,
    "kind": "project-execution",
    "project": {}
  }
}
```

Submitting the same `idempotencyKey` again returns the existing job rather than starting duplicate project work.

### List jobs

```http
GET /v1/jobs
Authorization: Bearer <token>
```

### Job status

```http
GET /v1/jobs/<job-id>
Authorization: Bearer <token>
```

### Cancel queued job

```http
POST /v1/jobs/<job-id>/cancel
Authorization: Bearer <token>
```

Running jobs are not force-killed by the control plane. Future worker-level cooperative cancellation will stop at a safe Agent boundary so Git/worktree state is not corrupted.

## Durable storage

The runner writes:

```text
<LUNA_RUNNER_DATA_DIR>/
  jobs.json
  jobs/
    <job-id>.input.json
    <job-id>.result.json
    <job-id>.log.txt
```

`jobs.json` is written through a temporary file followed by rename.

When the runner restarts, jobs previously marked `running` are returned to `queued`. The worker protocol is required to reconcile real repository/PR state before repeating destructive work.

## Local verification

```bash
npm --prefix services/luna-runner run check
```

Start the control plane after setting the required environment:

```bash
LUNA_RUNNER_TOKEN=... \
LUNA_RUNNER_WORKER=/opt/luna/bin/luna-worker \
node services/luna-runner/src/server.mjs
```

## Not complete yet

The control plane alone does not make Luna projects run remotely. The remaining critical piece is the headless `luna-worker` that reuses Luna's existing Agent Runtime and owns the full task DAG, failure recovery, integration, retrospective, and durable project state without requiring the desktop React page to stay alive.
