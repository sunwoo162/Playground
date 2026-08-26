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

`/start` currently creates a project request, assigns the first idle team, persists that assignment locally, and prepares that team's PM Agent. The actual Codex execution runtime is intentionally not faked; until independent Codex worker dispatch is connected, projects remain queued with the blocker visible in the UI.

Each Agent is modeled as an independent worker with its own role/session state, version, retrospective history, project-scoped permissions, and branch/worktree. Agents are expected to perform their own repository actions, including repository creation when assigned, commit/push, and opening or updating their own PRs. Code Review, Reviewer, QA, and Documentation run independently rather than being simulated by the PM.

The Documentation Agent keeps user, developer, API, environment, architecture, deployment, and operational documentation aligned with actual repository state and verified behavior. It must not turn another Agent's report into documentation without checking evidence, and it opens its own PR when documentation changes are reviewable repository work.

All generated projects carry organization policies for:

- **꽃다발**: shared login/sign-up standard applied whenever authentication is required.
- **이설 방식**: inspect the real repository first, work on actual files/branches or worktrees, run available verification, use small English commits, open/update the working Agent's own PR, pass Code Review/Reviewer/QA, reroute failures, and write per-Agent retrospectives after completion.
- **Independent judgment**: Agent feedback is evidence, not automatic truth. Every material action has a concise, verifiable rationale and disagreement can be challenged with evidence.
- **Documentation evidence**: documentation must match real code, commands, APIs, configuration, verification, and deployment state; unverified or secret information is not presented as fact.
- **Production service**: generated projects must target actual service quality rather than mock/demo completion.
- **BloomBouquet Git flow**: project repositories default to the `BloomBouquet` GitHub Organization, use `main` for release, `develop` for integration, and `agent/<team>/<role>/<task>` for Agent work.
- **Luna apps portal**: user-facing web projects deploy into the existing `/apps/<id>/` collection by default.

## BloomBouquet runtime foundation

The first local runtime layer is implemented without adding another framework. The Project Teams panel stores the local workspace root and keeps `BloomBouquet` as the default project Organization.

The Tauri backend exposes a runtime preflight that checks the actual local machine for:

- Git
- GitHub CLI (`gh`)
- GitHub CLI authentication
- Codex CLI
- access to the configured GitHub Organization

A repository bootstrap command is also available for the future PM/runtime dispatcher. Given a repository name and workspace root, it can create a private repository in `BloomBouquet` when missing, clone or refresh the workspace, preserve an existing dirty workspace by stopping instead of overwriting it, ensure `main`, and create or track `develop`.

Repository bootstrap is not automatically executed by `/start` yet because the PM Codex dispatcher still needs to decide the real project/repository name and task plan first. This avoids creating placeholder repositories before project analysis.

The ChatGPT Codex Connector installed on the GitHub Organization and Luna's local runtime authentication are separate credentials. The connector allows the connected ChatGPT/Codex environment to access the Organization; the desktop Luna runtime still needs an authenticated local `gh` session (or a later dedicated Luna GitHub App credential) before it can create or push repositories itself.

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

Open **Tools → Project Teams**, set a workspace root, save it, and use **Runtime 확인** from the Organization panel to check the local Git/gh/Codex prerequisites.

## Build

```bash
pnpm build
pnpm tauri build
```

## Production blockers

- Connect the PM Codex runtime adapter that starts and observes independent Agent sessions and calls repository bootstrap only after PM planning.
- Authenticate the Luna machine with GitHub (`gh auth login`) or replace the local CLI credential with a dedicated Luna GitHub App/token strategy suitable for unattended execution.
- Apply repository rules/protection for `main` and `develop` and wire Reviewer/QA gates to merge decisions.
- Move long-lived orchestration history and Agent decision records from localStorage to durable storage before treating team history as production data.
- Implement the reusable 꽃다발 authentication package/runtime before generated projects can consume it directly.
- Add worktree lifecycle management, bounded retries, pause/resume, Agent audit logging, disagreement/re-review handling, documentation verification events, and release publication into the Luna apps portal.
- Run packaged Tauri verification on Windows before release.
