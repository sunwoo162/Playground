# Luna Desktop

Luna is a lightweight Tauri desktop companion with a React/TypeScript management window. The desktop pet stays separate from the management UI, while utilities are collected in the existing **Tools** area.

## Stack

- Tauri 2
- React 19
- TypeScript
- Vite

No extra framework is added for Project Teams. The first orchestration surface uses plain React state plus localStorage so the desktop bundle stays small.

## Current tools

- Focus
- Tasks
- Project Teams

## Project Teams

Project Teams manages five equal development teams: **장미, 백합, 튤립, 해바라기, 벚꽃**. Each team owns 12 independent Agent state records and a separate Team Playbook version. A Team Evolution Agent exists at organization level to evaluate long-term performance and version changes.

`/start` currently creates a project request, assigns the first idle team, persists that assignment locally, and prepares that team's PM Agent. The actual Codex execution runtime is intentionally not faked; until a runtime adapter is connected, projects remain queued with the blocker visible in the UI.

All generated projects carry two organization policies:

- **꽃다발**: shared login/sign-up standard applied whenever authentication is required.
- **이설 방식**: inspect the real repository first, work on actual files/branches or worktrees, run available verification, use small English commits, pass Reviewer/QA, reroute failures, and write per-Agent retrospectives after completion.

See [`PROJECT_TEAMS.md`](./PROJECT_TEAMS.md) for the full workflow and current runtime blocker.

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
- Move long-lived orchestration history from localStorage to durable storage before treating team history as production data.
- Implement the reusable 꽃다발 authentication package/runtime before generated projects can consume it directly.
- Add workspace/worktree lifecycle management, bounded retries, pause/resume, and user approval gates around destructive operations.
- Run packaged Tauri verification on Windows before release.
