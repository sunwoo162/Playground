# Luna Project Teams

## Product definition

Luna Project Teams is a lightweight orchestration surface inside Luna's existing Tools area. A user starts a project with `/start`, Luna assigns one idle team, runs that team's PM through Codex, prepares a real repository in `BloomBouquet`, and dispatches dependency-ready independent Agent tasks.

The five equal teams are **장미, 백합, 튤립, 해바라기, 벚꽃**. Every team starts with the same playbook and 14 independent Agent states. Their future versions and retrospectives are tracked separately so strengths can emerge from actual project evidence rather than preassigned personalities.

Generated projects are expected to become real-use services or production candidates. Luna itself stays lightweight, but project Agents may add libraries, frameworks, databases, testing tools, or other proven dependencies when there is a concrete product reason.

## Team Agents

Each team owns independent instances of:

- Idea Agent
- PM Agent
- Design System Agent
- Designer Agent
- Frontend Agent
- Backend Agent
- Code Review Agent
- Reviewer Agent
- QA Agent
- Documentation Agent
- Debug / Problem Router Agent
- User Agent A (first-time user)
- User Agent B (experienced user)
- Process Evaluator Agent

A separate organization-level **Team Evolution Agent** is reserved for cross-project evaluation, retrospective aggregation, and Agent/Playbook version-change proposals.

## Independent Agent autonomy

Every Agent is modeled as a separate worker, not as one model switching roles inside a shared conversation. Runtime state records Agent identity, role, task, session/thread identifiers, worktree, branch, evidence, verification, blockers, and available commit/PR references.

Repository-changing Agents use dedicated Git worktrees and the branch convention:

```text
agent/<team>/<role>/<task>
```

They are instructed to inspect the real repository first, change actual files, run applicable verification, create small logical English commits, push their own branch, and open or update their own PR targeting `develop`.

Review-style Agents such as Code Review, Reviewer, QA, User A/B, and Process Evaluator are separate sessions. By default they inspect repository/PR evidence without modifying the implementation branch. Sharing one GitHub credential does not make a native GitHub self-approval equivalent to an independent Agent judgment.

## Independent judgment and decision reasons

No Agent blindly trusts PM, Reviewer, Code Review, QA, Designer, Documentation, or another specialist. Handoffs and review findings are evidence inputs that each Agent checks against the actual requirement, repository, diff, test output, design evidence, and product goal.

Every material action must have a concise defensible reason. Agent outputs carry rationale summaries and evidence rather than private chain-of-thought. An Agent can disagree with another Agent when it has stronger evidence, but it must not silently ignore a finding.

Objective failures are different from opinions. A reproducible build/test failure, repository protection rule, security requirement, or explicit Product Owner decision cannot be bypassed simply because another Agent prefers a different outcome.

## PM planning runtime

After `/start` and team assignment, the team's PM runs through ChatGPT-authenticated Codex in planning-only mode.

PM output is constrained to a structured schema containing:

- project name
- lowercase kebab-case repository name
- product summary
- architecture summary
- authentication requirement
- technology decisions with reasons
- Agent tasks
- task role
- task slug
- dependency IDs
- observable acceptance criteria

Luna validates repository/task naming, allowed Agent roles, duplicate IDs/slugs, missing dependencies, self-dependencies, and cyclic dependency graphs before repository bootstrap begins.

If authentication is required, PM must set the project to use the shared **꽃다발** authentication standard.

## BloomBouquet repository runtime

Once the PM plan is validated, Luna prepares the real project repository in the configured GitHub Organization, currently `BloomBouquet` by default.

The runtime can:

- create a private repository when it does not exist
- clone it into the configured workspace root
- verify an existing workspace origin before touching it
- stop on uncommitted local changes instead of overwriting them
- ensure `main`
- create or track `develop`

GitHub Connector access and Luna's local runtime credential are separate. The desktop runtime still requires an authenticated local `gh` session.

## Agent task dispatcher

PM tasks are converted into persisted task-run records. A task with no dependencies starts as `ready`; dependency-bound tasks remain `pending` until every dependency is `done`.

The current scheduler intentionally limits execution to reduce collisions and subscription usage:

- at most two tasks per wave
- at most one running task for the same Agent role
- only dependency-ready tasks may start
- blocked tasks have bounded retries

Each Agent task is executed through a dedicated Codex App Server thread/turn with its own role prompt, task contract, worktree, and dependency artifacts.

Repository-changing Agents receive a dedicated worktree and branch. When an Agent claims completion, Luna does not trust the claim by itself. The runtime independently verifies:

- the Agent stayed on the expected branch
- the worktree is clean
- the local HEAD exists
- the remote Agent branch exists
- a `develop`-targeting open PR exists

The runtime then records the actual commit SHA and PR metadata it observed.

Review/QA/User-style Agents report the PRs they actually examined and return structured evidence and verification results.

## Runtime failure handling

PM Runtime failures and Agent Runtime failures are tracked separately.

A PM failure blocks the project before a valid plan exists and exposes the PM retry path. An Agent failure blocks the relevant task and uses the Agent retry path.

If Luna is restarted or reloaded while a task is persisted as `running`, Luna does **not** assume the worker is still safely active and does not automatically duplicate the task. On hydration it converts the interrupted task to `blocked`, records an interruption reason, marks the project as an Agent Runtime failure, and requires the real worktree/PR state to be checked before retry.

Automatic Agent retry is currently bounded to three attempts. Exhausted retries remain blocked for PM/Product Owner resolution.

Full Debug / Problem Router reassignment is still a follow-up; current blocked-task handling is retry-oriented rather than root-cause rerouting.

## Documentation Agent

Documentation Agent owns project documentation accuracy rather than blindly copying implementation reports.

Typical outputs include:

- product/user README and usage guide
- setup, run, build, test, and deployment instructions
- environment-variable names and secret-handling guidance
- API contracts and examples
- architecture and decision records
- migration/operational notes
- release/changelog notes

Documentation Agent must reconcile statements with repository state, schemas, command/test evidence, QA results, and deployment evidence. It uses its own branch/worktree and PR when documentation changes are repository work.

## Design expectations

Design work must be grounded in the product's existing design system/Figma evidence and the actual user workflow. Generic AI-looking UI is not a design strategy.

Avoid unsupported patterns such as emoji icons, automatic purple/blue gradients, decorative glow/glassmorphism, excessive rounded cards, fake KPI dashboards, and generic AI marketing copy when the product behavior does not justify them.

Design System and Designer are separate roles and may disagree through explicit evidence-based review.

## Production-service gate

A project is not complete because generated code merely renders. Completion ultimately requires the level expected from a real service, including where applicable:

- complete primary user workflow
- appropriate persistent storage
- shared `꽃다발` auth when login/sign-up is required
- loading, empty, invalid, error, permission, and retry states
- intended-device responsiveness
- accessibility for core actions
- real external data/API integration
- secret/environment handling
- security-sensitive authorization/validation boundaries
- successful build and appropriate tests
- browser/manual QA for user-facing flows
- documentation matching the verified release
- verified Luna apps portal deployment path

Unavailable credentials/providers/datasets may create a mock or local fallback, but the project must remain explicitly production-blocked instead of being mislabeled complete.

## Shared auth standard: 꽃다발

Any generated project that requires login or sign-up must use the shared **꽃다발** auth standard instead of inventing a new authentication process per project.

The current Luna runtime carries this as a project policy and PM planning requirement. The reusable auth package/runtime itself is still pending implementation.

## Release target

User-facing web projects are intended to publish into the existing Luna/Playground app collection under `/apps/<id>/` by default.

Final release automation is not connected yet. A future release record should include at minimum deployed path/URL, project version, release commit SHA, team/playbook version, verification result, and documentation verification result.

## Current implemented runtime

Implemented in the existing Tauri/React desktop app without adding a heavy orchestration framework:

- five equal team pool
- 14 independent Agent roles per team
- `/start` intake and idle-team assignment
- local state persistence
- PM Codex planning runtime
- structured PM schema and dependency validation
- `BloomBouquet` repository bootstrap
- `main` / `develop` setup
- Agent task queue
- dependency readiness
- bounded parallel waves
- dedicated Agent worktrees
- `agent/<team>/<role>/<task>` branch convention
- Codex App Server Agent threads/turns
- structured Agent result schema
- repository-changing Agent commit/push/PR contract
- independent post-turn worktree/branch/PR verification
- Code Review / Reviewer / QA / Documentation / User role separation
- bounded blocked-task retry
- interrupted `running` task recovery
- PM vs Agent Runtime failure classification
- Agent rationale/evidence/verification result persistence

See [`AGENT_RUNTIME_POLICY.md`](./AGENT_RUNTIME_POLICY.md) for the detailed autonomy, permission, decision, dependency, documentation, PR, and release contract.

## Remaining runtime work

The following are not complete yet and must not be represented as finished:

- automatic Code Review → Reviewer → QA merge gate based on actual findings
- Debug / Problem Router root-cause classification and reassignment
- disagreement/re-review protocol automation
- pause/resume/stop with durable live-session recovery
- persistent orchestration history beyond localStorage
- per-Agent retrospectives
- Process Evaluator project evaluation output
- Team Evolution cross-project evidence analysis and version changes
- reusable 꽃다발 authentication implementation
- completed-worktree lifecycle cleanup/archive
- final integration/merge orchestration
- Luna apps portal release publication
- full packaged Windows Tauri + Codex App Server verification

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
