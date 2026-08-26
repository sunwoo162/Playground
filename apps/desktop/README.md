# Luna Desktop

Luna is a lightweight Tauri desktop companion with a React/TypeScript management window. The desktop pet stays separate from the management UI, while utilities are collected in the existing **Tools** area.

## Stack

- Tauri 2
- React 19
- TypeScript
- Vite

Luna itself should stay lightweight. Project Teams currently uses plain React state plus localStorage and does not pull in a heavy orchestration framework before the runtime actually needs one. Generated projects, however, may add libraries/frameworks when they materially improve production reliability, security, accessibility, maintainability, or delivery speed.

## Current tools

- Focus
- Tasks
- Project Teams

## Project Teams

Project Teams manages five equal development teams: **장미, 백합, 튤립, 해바라기, 벚꽃**. Each team owns 14 independent Agent state records and a separate Team Playbook version. A Team Evolution Agent exists at organization level to evaluate long-term performance and version changes.

`/start` currently creates a project request, assigns the first idle team, persists that assignment locally, and prepares that team's PM Agent. The actual Codex execution runtime is intentionally not faked; until a runtime adapter is connected, projects remain queued with the blocker visible in the UI.

Each Agent is modeled as an independent worker with its own role/session state, version, retrospective history, project-scoped permissions, and future branch/worktree. Agents are expected to perform their own repository actions, including commit/push and opening or updating their own PRs. Code Review, Reviewer, QA, and Documentation run independently rather than being simulated by the PM.

The Documentation Agent keeps user, developer, API, environment, architecture, deployment, and operational documentation aligned with actual repository state and verified behavior. It must not turn another Agent's report into documentation without checking evidence, and it opens its own PR when documentation changes are reviewable repository work.

All generated projects carry organization policies for:

- **꽃다발**: shared login/sign-up standard applied whenever authentication is required.
- **이설 방식**: inspect the real repository first, work on actual files/branches or worktrees, run available verification, use small English commits, open/update the working Agent's own PR, pass Code Review/Reviewer/QA, reroute failures, and write per-Agent retrospectives after completion.
- **Independent judgment**: Agent feedback is evidence, not automatic truth. Every material action has a concise, verifiable rationale and disagreement can be challenged with evidence.
- **Documentation evidence**: documentation must match real code, commands, APIs, configuration, verification, and deployment state; unverified or secret information is not presented as fact.
- **Production service**: generated projects must target actual service quality rather than mock/demo completion.
- **Luna apps portal**: user-facing web projects deploy into the existing `/apps/<id>/` collection by default.

See [`PROJECT_TEAMS.md`](./PROJECT_TEAMS.md) for the full workflow and [`AGENT_RUNTIME_POLICY.md`](./AGENT_RUNTIME_POLICY.md) for Agent autonomy, permissions, decision, dependency, documentation, PR, and release rules.

## Local run

```bash
cd apps/desktop
pnpm install
pnpm dev
```

Vite runs on `http://localhost:1420`.

For the actual Tauri desktop app:

```bash
pnpm tauri dev
```

## Build

```bash
pnpm build
pnpm tauri build
```

## Production blockers

- Connect a supported Codex runtime adapter for independent Agent execution and lifecycle events.
- Give the runtime project-scoped GitHub credentials (prefer a Luna GitHub App) so Agents can branch, push, create/update/review PRs, and merge only after repository/quality gates pass.
- Move long-lived orchestration history and Agent decision records from localStorage to durable storage before treating team history as production data.
- Implement the reusable 꽃다발 authentication package/runtime before generated projects can consume it directly.
- Add workspace/worktree lifecycle management, bounded retries, pause/resume, Agent audit logging, disagreement/re-review handling, documentation verification events, and release publication into the Luna apps portal.
- Run packaged Tauri verification on Windows before release.
