# Luna Project Teams

## Product definition

Luna Project Teams is a lightweight orchestration surface inside Luna's existing Tools area. The user starts a project with `/start`, Luna assigns one idle team, and the team's independent Agents later execute the project through a Codex-based runtime.

The five equal teams are **장미, 백합, 튤립, 해바라기, 벚꽃**. Every team starts with the same playbook and 12 independent Agent states. Their versions and retrospectives are stored separately so teams can diverge based on actual project results rather than preassigned personalities.

## Team Agents

Each team owns independent instances of:

- Idea Agent
- PM Agent
- Design System Agent
- Designer Agent
- Frontend Agent
- Backend Agent
- Reviewer Agent
- QA Agent
- Debug / Problem Router Agent
- User Agent A (first-time user)
- User Agent B (experienced user)
- Process Evaluator Agent

A separate organization-level **Team Evolution Agent** compares project evaluations and retrospectives, proposes Agent/playbook version changes, and tracks whether those changes improve later projects.

## Execution workflow

1. `/start` creates a project request.
2. Luna assigns one idle team.
3. PM Agent receives the project and runs the required Agents in order.
4. Design work must be grounded in the product's Figma/design system and real product patterns. Generic AI-looking UI, emoji icons, decorative gradients, excessive cards/radius/glow, and unsupported visual decisions are rejected.
5. Frontend and Backend work on real repository branches/worktrees.
6. Every development task follows the same evidence-based workflow used for the Iseol bot: inspect the repository first, modify real files, run available verification, create small English commits, then pass Reviewer and QA.
7. Failures go to Debug / Problem Router, which sends the issue back to the Agent best able to fix it. Automatic retries are bounded; repeated failures escalate to PM/Reviewer and then to the user when a real product decision is needed.
8. User Agent A and B validate first-time and experienced-user flows.
9. Process Evaluator scores the result and the way the team worked.
10. Every participating Agent writes an independent retrospective.
11. Team Evolution Agent turns repeated evidence into version-change candidates for Agents and the team playbook.
12. The project is archived and the team returns to idle.

## Shared auth standard: 꽃다발

Any generated project that needs login or sign-up must use the shared **꽃다발** auth standard instead of inventing a separate authentication flow per project.

The PM must apply this policy when authentication becomes part of project scope. Brand styling can vary, but authentication stages, states, error handling, and common behavior should remain shared. The first implementation in Luna records and exposes this policy; the reusable auth runtime/package is a follow-up integration.

## Current lightweight MVP

Implemented locally inside the existing Tauri/React Luna app with no new dependency:

- Project Teams card in Tools
- Five team pool with independent 12-Agent state records
- `/start` intake and idle-team assignment
- Local persistence with `localStorage`
- Agent and Team Playbook version fields
- Team Evolution Agent organization state
- 꽃다발 auth policy attached to every project request as `when-auth-required`
- Iseol-style execution policy attached to every project request
- Honest Runtime state: project assignment works, Codex workers are not yet connected

## Runtime blocker

The current repository does not include a Codex orchestration runtime that Luna can programmatically start, monitor, pause, route, and resume. Until that adapter exists, the UI must not pretend that Agents are modifying repositories. Assigned projects remain queued with the exact Runtime blocker visible.

The next implementation layer is a small runtime adapter that can:

- create a project workspace/worktree
- start an independent Agent session with role instructions
- receive completion/failure events
- dispatch review/QA/retry stages
- persist retrospective/version events

## Run and verification

```bash
cd apps/desktop
pnpm install
pnpm dev
```

Tauri:

```bash
pnpm tauri dev
```

Build:

```bash
pnpm build
pnpm tauri build
```
