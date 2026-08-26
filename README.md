# Project Builder

> Working title. The permanent product name has not been decided yet.

Project Builder is a web-first autonomous software creation platform. A user describes an idea or chooses a template, then independent specialist Agents plan, build, review, test, and prepare a real project for release.

The current repository is being migrated from a Playground/Luna-oriented product into this Builder architecture.

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

The root web application is the new control plane. Existing applications under `apps/*` remain available during migration and may become generated outputs, examples, or legacy apps.

## Agent Runtime migration

The verified Agent orchestration implementation currently lives primarily in `apps/desktop`. That Tauri shell is not the target product UI anymore, but its OS-bound Git, worktree, Codex App Server, evidence, recovery, and cleanup Runtime is preserved until equivalent server/worker interfaces replace it.

Do not remove the desktop Runtime only to remove Luna branding; migrate the Runtime first, then retire the shell.

## Authentication

**꽃다발** is the shared authentication standard.

- The Builder platform should use 꽃다발 for its own account/session flow once the reusable service/package is available.
- Generated projects that require login or sign-up use the 꽃다발 auth contract by default.
- Provider choice remains project-specific behind the shared contract.

## Development

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Run the web control plane and server:

```bash
pnpm dev
```

Build the web control plane:

```bash
pnpm build
```

Verify the retained desktop Agent Runtime:

```bash
pnpm --dir apps/desktop run build
pnpm --dir apps/desktop run test:allocation
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Product specification

See [`docs/AUTONOMOUS_BUILDER_PRODUCT.md`](./docs/AUTONOMOUS_BUILDER_PRODUCT.md) for the product boundary, MVP, Agent organization, 꽃다발 policy, and migration plan.
