# Luna Desktop

Luna is a lightweight Tauri desktop companion with a React/TypeScript management window. The desktop pet stays separate from the management UI, while utilities are collected in the existing **Tools** area.

## Stack

- Tauri 2
- React 19
- TypeScript
- Vite

Luna itself should stay lightweight. Project Teams uses the existing Tauri runtime, plain React state, localStorage, Git/GitHub CLI, and the locally installed Codex CLI instead of adding a separate orchestration framework.

Generated projects may add libraries/frameworks when they materially improve production reliability, security, accessibility, maintainability, performance, or delivery speed.

## Current tools

- Focus
- Tasks
- Project Teams

## Project Teams

Project Teams manages five equal development teams: **장미, 백합, 튤립, 해바라기, 벚꽃**. Each team owns 14 independent Agent state records and a separate Team Playbook version. A Team Evolution Agent exists at organization level for later cross-project evaluation and version changes.

A `/start` request now performs the first real runtime chain:

1. assign an idle team
2. run that team's independent PM through ChatGPT-authenticated Codex
3. require a structured PM plan with repository name, architecture decisions, Agent tasks, dependencies, and acceptance criteria
4. create or refresh the project repository in `BloomBouquet`
5. ensure `main` and `develop`
6. turn the PM dependency graph into runnable Agent tasks
7. run independent Agent sessions through Codex App Server
8. give repository-changing Agents dedicated Git worktrees and `agent/<team>/<role>/<task>` branches
9. require the working Agent to commit, push, and open/update its own PR when repository changes are complete
10. independently verify clean worktree, remote branch/commit, and open PR before accepting the Agent's completion claim

The queue currently runs at most two tasks at once and avoids running two tasks for the same role concurrently. Dependencies must be complete before a pending task becomes ready.

Code Review, Reviewer, QA, Documentation, User A/B, and Process Evaluator are modeled as independent workers. Review-style Agents do not modify the implementation branch by default; they inspect the repository and dependency PR evidence independently.

Every material Agent result includes a concise rationale, evidence, verification results, blockers, and available commit/PR references. Other Agents are not required to trust that result automatically.

## Runtime recovery

Project Teams does not assume that a persisted `running` state means an Agent is still alive after Luna is restarted or reloaded.

When stored state contains a running Agent task on startup, Luna changes that task to `blocked`, records an interruption blocker, marks the failure source as `agent`, and requires the real worktree/PR state to be checked before retry. This prevents duplicate execution from being started only because the UI lost the original process state.

PM Runtime failures and Agent Runtime failures are stored and displayed separately. A failure during Agent dispatch is not relabeled as a PM planning failure.

## Organization policies

All generated projects carry organization policies for:

- **꽃다발**: shared login/sign-up standard whenever authentication is required.
- **이설 방식**: inspect the real repository first, modify real files, run available verification, use small English commits, push the Agent branch, open/update the Agent's own PR, review actual evidence, and never claim checks that were not executed.
- **Independent judgment**: Agent feedback is evidence, not automatic truth. Every material action needs a concise, verifiable reason.
- **Documentation evidence**: documentation must match real code, commands, APIs, configuration, verification, and deployment state.
- **Production service**: generated projects target actual service quality rather than mock/demo completion.
- **BloomBouquet Git flow**: `main` for release, `develop` for integration, `agent/<team>/<role>/<task>` for Agent work.
- **Luna apps portal**: user-facing web projects are intended to publish into the existing `/apps/<id>/` collection.

## Local runtime requirements

Open **Tools → Project Teams**, set a workspace root, save it, and run **Runtime 확인**.

The Tauri runtime checks the local machine for:

- Git
- GitHub CLI (`gh`)
- authenticated GitHub CLI session
- Codex CLI
- ChatGPT-backed Codex login
- access to the configured GitHub Organization

The ChatGPT Codex Connector installed on the GitHub Organization and Luna's local CLI authentication are separate credentials. Luna still needs its own authenticated local `gh` session to create/push repositories from the desktop runtime.

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

## Remaining production work

- Apply repository rules/protection for `main` and `develop` and connect Code Review/Reviewer/QA evidence to an actual merge gate.
- Implement Debug / Problem Router reassignment instead of only bounded retry of blocked tasks.
- Add pause/resume/stop with durable process/session recovery rather than startup blocking alone.
- Move long-lived organization history, decisions, evaluations, and Agent version history from localStorage to durable storage before treating it as production history.
- Implement per-Agent retrospectives, Process Evaluator output, and Team Evolution version proposals.
- Implement the reusable 꽃다발 authentication package/runtime for generated services.
- Add final PR integration, release publication, and registration into the Luna apps portal.
- Add lifecycle cleanup for completed worktrees and archived runtime logs.
- Run full packaged Tauri + Codex App Server verification on Windows before release.

See [`PROJECT_TEAMS.md`](./PROJECT_TEAMS.md) for the workflow and [`AGENT_RUNTIME_POLICY.md`](./AGENT_RUNTIME_POLICY.md) for Agent autonomy, permissions, decision, dependency, documentation, PR, and release rules.
