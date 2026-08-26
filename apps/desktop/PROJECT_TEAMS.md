# Luna Project Teams

## Product definition

Luna Project Teams is a lightweight orchestration surface inside Luna's existing Tools area. The user starts a project with `/start`, Luna assigns one idle team, and the team's independent Agents later execute the project through a Codex-based runtime.

The five equal teams are **장미, 백합, 튤립, 해바라기, 벚꽃**. Every team starts with the same playbook and 12 independent Agent states. Their versions and retrospectives are stored separately so teams can diverge based on actual project results rather than preassigned personalities.

Generated projects are expected to become real-use services or production candidates. Luna itself stays lightweight, but teams may add libraries, frameworks, databases, testing tools, or other proven dependencies when there is a concrete product reason.

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

## Independent Agent autonomy

Every Agent is treated as a separate worker rather than a role switch in one shared conversation. Each Agent keeps its own runtime/session state, role instructions, project memory, work history, retrospective history, version, and execution log.

Within its assigned project, an Agent can directly use repository and collaboration capabilities exposed by the runtime, including repository read/write, branch/worktree creation, command execution, dependency installation, build/test, browser/Figma access, commit, push, issue creation, PR creation/update/review, gated merge, and deployment preparation/publication.

The PM coordinates work but does not impersonate the worker. For example, a Frontend Agent that implements a task pushes its own branch and opens or updates its own PR. Reviewer and QA run as separate Agent sessions and can independently block that change.

The runtime may authenticate to GitHub through one Luna GitHub App or runtime credential, but every action must retain the logical Agent ID in audit metadata. Separate public GitHub bot identities can be introduced later if distinct visible PR authors are required.

## Execution workflow

1. `/start` creates a project request.
2. Luna assigns one idle team.
3. PM Agent receives the project and runs the required Agents in order.
4. Design work must be grounded in the product's Figma/design system and real product patterns. Generic AI-looking UI, emoji icons, decorative gradients, excessive cards/radius/glow, and unsupported visual decisions are rejected.
5. Frontend and Backend work on real repository branches/worktrees.
6. Every development task follows the same evidence-based workflow used for the Iseol bot: inspect the repository first, modify real files, run available verification, create small English commits, push the working branch, and open/update the Agent's own PR.
7. Reviewer and QA independently validate the change. A worker saying that a task is finished is never sufficient evidence by itself.
8. Failures go to Debug / Problem Router, which sends the issue back to the Agent best able to fix it. Automatic retries are bounded; repeated failures escalate to PM/Reviewer and then to the user when a real product decision is needed.
9. User Agent A and B validate first-time and experienced-user flows.
10. Process Evaluator scores the result and the way the team worked.
11. Every participating Agent writes an independent retrospective.
12. Team Evolution Agent turns repeated evidence into version-change candidates for Agents and the team playbook.
13. After release/archival work is complete, the team returns to idle.

## Production-service gate

A project is not complete just because the generated code renders. Completion requires the level of work expected from an actual service:

- complete primary workflow from an empty state
- appropriate persistent storage for long-lived/cross-device/collaborative data
- shared `꽃다발` auth when login/sign-up is required
- loading, empty, error, invalid, permission, and retry states
- responsive behavior for intended devices
- accessibility for core actions
- real external data/API integration when the product depends on it
- secrets and environment-variable handling
- security-sensitive validation/authorization boundaries
- successful build and appropriate automated tests
- browser/manual QA for user-facing flows
- deployment path verified in the Luna/Playground apps portal

A mock/local fallback can exist when an external account, credential, legal approval, paid provider, or real dataset is unavailable, but the project remains production-blocked and cannot be mislabeled complete.

## Dependency rule

Luna itself should remain small, but teams are free to add libraries or frameworks when they materially improve reliability, security, accessibility, maintainability, performance, or delivery speed. A major dependency should have a recorded reason, maintenance/security consideration, and bundle/runtime cost when relevant.

Do not avoid a mature library only to keep dependency count low, and do not add dependencies that only duplicate existing code or decorate the UI.

## Shared auth standard: 꽃다발

Any generated project that needs login or sign-up must use the shared **꽃다발** auth standard instead of inventing a separate authentication flow per project.

The PM must apply this policy when authentication becomes part of project scope. Brand styling can vary, but authentication stages, states, error handling, and common behavior should remain shared. The first implementation in Luna records and exposes this policy; the reusable auth runtime/package is a follow-up integration.

## Release target

User-facing web projects are published into the existing Luna/Playground app collection by default. Teams should reuse the repository's `/apps/<id>/` conventions and portal registration instead of creating a separate deployment platform without a product reason.

Release should record at least the deployed URL/path, project version, commit SHA, team/playbook version, and verification result.

## Current lightweight MVP

Implemented locally inside the existing Tauri/React Luna app with minimal runtime weight:

- Project Teams card in Tools
- Five team pool with independent 12-Agent state records
- `/start` intake and idle-team assignment
- Local persistence with `localStorage`
- Agent and Team Playbook version fields
- independent Agent permission/autonomy model
- Team Evolution Agent organization state
- 꽃다발 auth policy attached to every project request as `when-auth-required`
- Iseol-style execution policy attached to every project request
- production-service and Luna apps portal policies attached to project state
- Honest Runtime state: project assignment works, Codex workers are not yet connected

See [`AGENT_RUNTIME_POLICY.md`](./AGENT_RUNTIME_POLICY.md) for the detailed autonomy, permissions, dependency, production-quality, PR, and release contract.

## Runtime blocker

The current repository does not include a Codex orchestration runtime that Luna can programmatically start, monitor, pause, route, and resume. Until that adapter exists, the UI must not pretend that Agents are modifying repositories. Assigned projects remain queued with the exact Runtime blocker visible.

The next implementation layer is a small runtime adapter that can:

- create project workspaces/worktrees
- start independent Agent sessions with role instructions and project-scoped permissions
- preserve the acting Agent identity in Git/PR/audit events
- receive completion/failure events
- dispatch review/QA/retry stages
- allow workers to push and open/update their own PRs
- persist retrospective/version events
- publish release-ready web projects into the Luna apps portal

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
