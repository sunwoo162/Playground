# Project Builder

> Working title. The permanent product name has not been decided yet.

This repository now keeps the existing Playground web portal and the new autonomous Builder web control plane as separate frontend folders.

## Web folders

```text
playground-web/   # currently deployed Playground portal
builder-web/      # new Agent-powered software builder
```

`playground-web` preserves the existing user-facing Playground source while `builder-web` contains the new idea/template-to-project product. They share the repository-level dependencies but build independently.

The server, backend, generated/legacy apps, and retained Agent runtime remain outside these frontend folders.

## Product flow

```text
Idea or template
  -> Project Intake
  -> PM plan + Task DAG
  -> Design / Frontend / Backend Agents
  -> Code Review / Reviewer
  -> QA / Documentation
  -> Integration / Preview / Release
```

## Development

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Run the existing Playground portal with the Node server:

```bash
pnpm dev
```

Run each web frontend independently:

```bash
pnpm run dev:playground-web
pnpm run dev:builder-web
```

Build each frontend independently:

```bash
pnpm run build:playground-web
pnpm run build:builder-web
```

`build:playground-web` intentionally writes to the repository-level `dist/` directory because the current Node production server still serves that directory. `build:builder-web` writes to `dist-builder/` and is not switched into production routing yet.

## Agent Runtime migration

The verified Agent orchestration implementation currently lives primarily in `apps/desktop`. That Tauri shell is not the target product UI anymore, but its OS-bound Git, worktree, Codex App Server, evidence, recovery, and cleanup Runtime is preserved until equivalent server/worker interfaces replace it.

## Authentication

**꽃다발** is the shared authentication standard for the Builder platform and generated projects that require account/session functionality.

## Product specification

See [`docs/AUTONOMOUS_BUILDER_PRODUCT.md`](./docs/AUTONOMOUS_BUILDER_PRODUCT.md) for the product boundary, MVP, Agent organization, 꽃다발 policy, and migration plan.
