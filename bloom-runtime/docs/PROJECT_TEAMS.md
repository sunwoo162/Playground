# Luna Project Teams

## Product definition

Luna Project Teams is a lightweight multi-Agent software-delivery organization inside Luna's existing Tools area. A user starts a project with `/start`; Organization Project Intake first analyzes the request, clarification blocks unsafe assumptions, an eligible equal-status team is selected, that team's PM plans through Codex, Luna prepares a real repository in `BloomBouquet`, and dependency-ready independent Agents execute the project.

The five equal teams are **장미, 백합, 튤립, 해바라기, 벚꽃**. Every team starts from the same playbook and now owns **15 independent Agent states**. Team strengths are not predefined; performance profiles and Team Evolution use completed-project evidence so strengths can emerge from actual outcomes.

Generated projects are expected to become real-use services or production candidates. Luna itself stays lightweight, while project Agents may add libraries, frameworks, databases, testing tools, analytics instrumentation, or other proven dependencies when there is a concrete product reason.

## Senior operating baseline

All Luna Agents operate at the quality bar expected from a practitioner with **10+ years of relevant experience in the Agent's own specialty**. This is an operating standard, not a claim that the underlying model has a literal human employment history.

The common baseline requires senior-level attention to user value, architecture, maintainability, operational risk, security, accessibility, performance, evidence quality, failure modes, and handoff quality. Agents must not invent credentials, experience, market data, product metrics, user research, test results, deployment results, or external-service state.

The baseline is encoded in `src/projectTeams/seniorAgent.ts` and applied to PM, task Agents, Intake, failure recovery, retrospectives, and Team Evolution context.

## Team Agents

Each team owns independent instances of:

- Idea Agent
- PM Agent
- Design System Agent
- Designer Agent
- Frontend Agent
- Backend Agent
- **Data & Marketing Agent**
- Code Review Agent
- Reviewer Agent
- QA Agent
- Documentation Agent
- Debug / Problem Router Agent
- User Agent A (first-time user)
- User Agent B (experienced user)
- Process Evaluator Agent

A separate organization-level **Project Intake Agent** runs before team assignment. A separate organization-level **Team Evolution Agent** handles cross-project retrospective evidence and Agent/Playbook improvement experiments.

## Independent Agent autonomy

Every Agent is modeled as a separate worker, not as one model switching roles inside a shared conversation. Runtime state records Agent identity, role, task, session/thread identifiers, worktree, branch, evidence, verification, blockers, and available commit/PR references.

Repository-changing Agents use dedicated Git worktrees and the branch convention:

```text
agent/<team>/<role>/<task>
```

They inspect the real repository first, change actual files, run applicable verification, create small logical English commits, push their own branch, and open or update their own PR targeting `develop`.

Review-style Agents such as Code Review, Reviewer, QA, User A/B, and Process Evaluator are separate sessions. Sharing one GitHub credential does not make a native GitHub self-approval equivalent to an independent Agent judgment, so Luna persists logical Agent identity and evidence separately.

## Independent judgment and decision reasons

No Agent blindly trusts PM, Reviewer, Code Review, QA, Designer, Data & Marketing, Documentation, or another specialist. Handoffs and findings are evidence inputs that each receiving Agent checks against actual requirements, repository state, PR diffs, command/test output, product behavior, and available source evidence.

Every material action must have a concise defensible reason. Agent outputs carry rationale summaries and evidence rather than private chain-of-thought. An Agent can disagree with another Agent when it has stronger evidence, but it must not silently ignore a finding.

Objective failures are different from opinions. A reproducible build/test failure, repository protection rule, security requirement, or explicit Product Owner decision cannot be bypassed because another Agent prefers a different outcome.

## Organization Project Intake and team assignment

`/start` begins with Organization Project Intake before delivery-team PM planning. Intake records the primary user/job, complexity, required and critical roles, auth need, external dependencies, risk flags, assumptions, missing inputs, and rationale.

If required product inputs are missing, Luna blocks team assignment and asks for Product Owner clarification. Clarification lineage is preserved and bounded rather than silently guessing.

When Intake is ready, Luna selects from idle equal-status teams using fairness first and only uses **established performance evidence** as a guarded tie-breaking signal. No team receives a hardcoded specialty. Historical role performance can include Data & Marketing after real projects provide enough evidence.

## PM planning runtime

After Intake and team assignment, the team's PM runs through ChatGPT-authenticated Codex in planning-only mode.

PM output is constrained to structured project/product/architecture/technology decisions and a dependency DAG of independently reviewable Agent tasks. Luna validates naming, roles, duplicates, missing/self dependencies, cycles, and review topology.

If authentication is required, Luna applies the shared **꽃다발** authentication runtime before release-governance tasks are appended. A `needsAuth=true` plan must contain one Backend `bouquet-auth-server` Task and one Frontend `bouquet-auth-client` Task. Missing Tasks are injected automatically, an existing standard Task is hardened with mandatory acceptance criteria rather than blindly trusted, the Frontend Task directly depends on the Backend contract, and the authentication technology decision is persisted in the plan. See [`BOUQUET_AUTH.md`](./BOUQUET_AUTH.md).

The runtime then applies organization policy. In particular, release-target product plans receive a mandatory Data & Marketing → Documentation → Code Review → Reviewer → QA chain. This policy is injected after the product/auth plan so authentication implementation is part of the same downstream review and QA topology rather than bypassing it.

## BloomBouquet repository runtime

Once the plan is validated, Luna prepares the real project repository in the configured GitHub Organization, currently `BloomBouquet` by default.

The runtime can create a private repository when missing, clone it into the configured workspace root, verify an existing origin, stop on dirty local changes, ensure `main`, and create/track `develop`.

GitHub Connector access and Luna's local runtime credential are separate. The desktop runtime still requires an authenticated local `gh` session for unattended repository mutation.

## Agent task dispatcher

PM tasks become persisted task-run records. Tasks without dependencies become `ready`; dependency-bound tasks stay `pending` until dependencies are `done`.

The scheduler currently limits execution to at most two tasks per wave and at most one running task for the same role. Blocked tasks have bounded retries.

Each Agent task is executed through a dedicated Codex App Server thread/turn with its own role prompt, task contract, worktree, and dependency artifacts.

Repository-changing Agents receive dedicated worktrees/branches. Before execution Luna verifies that the project workspace `origin` exactly identifies the expected GitHub repository. When a writer Agent claims completion, the common evidence gate requires the reported commit, worktree HEAD, origin branch SHA, and the expected open `develop` PR `headRefOid` to agree before trusting the result.

Review/QA/User-style Agents report the dependency PRs they actually examined and return structured evidence and verification results.

## Execution control

Project Teams supports `/pause`, `/resume`, and `/stop` for an active planned project. Execution control is persisted independently from the project's delivery/failure status so a deliberate pause is not misclassified as an Agent failure.

`/pause` is cooperative at the Agent-wave boundary. If no Agent Task is running, the project pauses immediately. If a wave is already running, Luna records `pause-requested`, accepts the results from that already-dispatched wave, and prevents Debug Router work or a new dependency-ready wave from starting. `/resume` restores scheduling from the preserved Task DAG and can also cancel a pending pause request before the current wave finishes.

`/stop` follows the same safe boundary rule but is terminal for that project execution. After the current wave settles, Luna stops dispatching new Agent work and releases the assigned team back to `idle`. Existing task evidence, branches, commits, PR references, and project history are preserved rather than rolled back.

The control states are `running`, `pause-requested`, `paused`, `stop-requested`, and `stopped`. They are stored under a dedicated local persistence record so the asynchronous queue can observe a user request even while its current React execution closure is waiting for Agent results.

This is not a claim of true in-turn process suspension. Luna does not currently freeze and later continue the same in-flight Codex turn. After a process restart, Luna can now recover an **already-terminal** Agent result when the completed App Server turn and required repository evidence were written before the interruption; an in-flight turn without terminal evidence is still blocked rather than guessed successful. See [`SESSION_RECONCILIATION.md`](./SESSION_RECONCILIATION.md).

## Durable orchestration history

Project Teams keeps a disk-backed orchestration history in addition to the browser `localStorage` cache. The durable snapshot contains the Project Teams state and execution-control map, including project/task status, Agent identity, session references, branches, commits, PR references, evidence, verification, blockers, recovery decisions, and other orchestration metadata already held by the runtime.

The Tauri runtime writes under the application's data directory:

```text
project-teams/orchestration/
  latest.json
  history.jsonl
  history.previous.jsonl   # only after rotation
```

`latest.json` is the fast recovery snapshot. `history.jsonl` is append-only orchestration history. When the active history reaches 25MB it is rotated to `history.previous.jsonl`; a single incoming snapshot is limited to 10MB. Latest-snapshot replacement uses temporary and backup files. If `latest.json` is missing or malformed, Luna falls back to the backup and then the newest valid JSONL record.

Local state remains authoritative when it is structurally valid. Disk recovery is used only when the Project Teams local cache is absent or malformed, so an intentionally reset empty local state is not resurrected from an older backup. If only execution-control local data is missing, Luna can restore that control map from the durable snapshot without replacing a valid Project Teams state.

The durable bootstrap runs before React rendering. It is followed by interrupted-task reconciliation, which inspects persisted `running` Tasks before ordinary hydration applies the hard-block fallback. Only terminal App Server evidence can be recovered; unresolved or unsafe Tasks remain blocked.

Project Teams and execution-control local writes are coalesced at the microtask boundary and disk writes are serialized so an older asynchronous snapshot cannot finish later and replace a newer one. GitHub/Codex credential tokens and environment secret values are not part of the Project Teams snapshot contract and are not intentionally persisted by this history layer.

Durable history plus reconciliation can recover terminal evidence after restart, but it does not reconnect to or resume a still-running Codex OS process after Luna loses the process. True live-session reconnect remains separate work.

## Worktree lifecycle cleanup and archive

Independent Agent execution creates one worktree per task under the project workspace parent:

```text
.luna-worktrees/<projectId>/<taskId>
```

After the project merge gate succeeds and the required PRs have been merged into `develop`, Luna runs a conservative cleanup pass for completed task worktrees. Cleanup is evidence-gated rather than age-based or directory-based, and it never uses `git worktree remove --force`.

Repository-changing Agents are eligible only when the task is `done` and the persisted branch, commit, and PR evidence are present. Before removal Luna checks that the worktree is clean including untracked files, the current branch matches the recorded Agent branch, the worktree HEAD matches the recorded commit, and the referenced GitHub PR is actually `MERGED` with the expected head branch and `develop` base.

Review/read-only Agents do not need writer PR metadata, but their completed worktree must be clean and remain on detached HEAD. A review-style worktree that unexpectedly has branch metadata or an attached branch is preserved instead of being guessed safe.

Luna also verifies that the target path stays under the expected `.luna-worktrees/<projectId>` root and is still registered by `git worktree list --porcelain`. Windows path handling separates the original lexical-root check from canonical-path/registry comparison so normal `C:\...` paths and Windows canonical `\\?\C:\...` forms do not bypass or incorrectly fail the safety boundary. This is path-hardening logic, not a claim that the packaged Windows app has completed end-to-end verification.

Dirty or untracked worktrees, blocked/incomplete tasks, missing writer evidence, branch/commit mismatches, unmerged PRs, unexpected registry state, and unsafe paths are skipped and preserved. Local or remote Agent branches are not force-deleted by this lifecycle step.

Before attempting destructive removal, Luna flushes an archive record to the Tauri application-data directory:

```text
project-teams/worktree-archive/<projectId>.jsonl
```

The archive records task/session/turn identity, role, original worktree path, branch, commit, PR, evidence, and verification together with lifecycle phases such as `pre-remove`, `removed`, `remove-failed`, and `already-absent`. `pre-remove` is written before `git worktree remove`; this keeps an auditable record even if removal or the app fails afterward. After the project pass Luna runs `git worktree prune` to clear stale Git registry entries.

Worktree removal does not erase the main Project Teams task record. Durable orchestration history continues to retain the task/Agent/branch/commit/PR/evidence state, while the separate archive records what happened to the physical worktree.

## Data & Marketing workflow

Every team has its own independent **Data & Marketing Agent**. It is a repository-changing Agent and works in:

```text
agent/<team>/data-marketing/<task>
```

After verified product work, the mandatory sequence is:

```text
verified product work
  ↓
Data & Marketing Agent
  ↓
Documentation Agent
  ↓
Code Review
  ↓
Reviewer
  ↓
QA
```

Data & Marketing Agent analyzes the real product, user workflow, available first-party data, defensible external evidence, acquisition channels, SEO/content, funnel, metrics, analytics events, experiments, and privacy constraints. Its source analysis is:

```text
docs/marketing/MARKETING_ANALYSIS.md
```

The analysis must distinguish observed product facts, actually measured data, sourced external evidence, inference, and experiment hypotheses. It may not invent market size, users, CTR, conversion, CAC, LTV, retention, growth, competitor performance, or similar figures. If analytics are absent, it defines a measurement plan rather than fabricating results.

Documentation Agent receives the marketing analysis as evidence, independently checks it against the release repository and verification evidence, and owns the final strategy:

```text
docs/marketing/GO_TO_MARKET.md
```

This two-file/two-PR split prevents independent Agents from editing the same source document and forces the final GTM document through independent verification. See [`DATA_MARKETING_AGENT.md`](./DATA_MARKETING_AGENT.md).

## Runtime failure handling

PM Runtime failures and Agent Runtime failures are tracked separately. On startup, persisted `running` Tasks are first checked by the interrupted Agent reconciliation runtime. A Task with complete terminal App Server evidence can be recovered; missing, malformed, incomplete, or repository-inconsistent evidence is converted to an explicit blocked result and continues through the existing recovery flow.

Blocked Agent failures can be analyzed by the independent Debug / Problem Router, which records failure type, severity, evidence, and one of the supported recovery routes: retry an owner task, escalate to PM replanning, or request a Product Owner decision.

PM recovery replanning is bounded and preserves repository artifacts. The mandatory marketing/documentation governance chain is protected from casual retirement during replanning and is revalidated before execution resumes.

## Integration, retrospectives, and Team Evolution

Repository-writing work is not considered integrated simply because an Agent says it is done. Luna's integration runtime validates the required Code Review → Reviewer → QA evidence and GitHub PR/check state before merge eligibility.

After integration, participating Agents write independent retrospectives. The organization-level Team Evolution Agent evaluates evidence across projects and proposes versioned Agent/Playbook experiments. Experiments are measured on later work and can be kept or rolled back rather than becoming permanent rules from one anecdote.

Role-performance profiles use completed project evidence and can surface emerging/established strengths without assigning personalities in advance.

## Documentation Agent

Documentation Agent owns documentation accuracy rather than copying implementation or marketing reports. Typical outputs include README/user guidance, setup/run/build/test/deploy instructions, environment/configuration guidance, API contracts, architecture decisions, migration/operational notes, release notes, and marketing/measurement documentation.

For marketing, Documentation independently verifies `MARKETING_ANALYSIS.md`, removes unsupported claims, preserves evidence-vs-hypothesis boundaries, and writes `GO_TO_MARKET.md` in its own branch/PR. Secret values are never documented.

## Design expectations

Design work must be grounded in the product's actual workflow and available design-system/Figma evidence. Generic AI-looking UI is not a design strategy. Unsupported emoji-heavy interfaces, automatic purple/blue gradients, decorative glow/glassmorphism, excessive rounded cards, fake KPI dashboards, and generic AI marketing copy should not be introduced without product evidence.

Design System and Designer are separate roles and may disagree through evidence-based review.

## Production-service gate

A project is not complete because generated code merely renders. Completion ultimately requires the level expected from a real service, including where applicable:

- complete primary user workflow
- appropriate persistent storage
- shared `꽃다발` auth when login/sign-up is required
- loading, empty, invalid, error, permission, and retry states
- intended-device responsiveness and accessibility
- real external API/data integration
- secret/environment and security-sensitive validation boundaries
- successful build and appropriate tests
- browser/manual QA for user-facing flows
- documentation matching the verified release
- Data & Marketing analysis and Documentation-verified GTM strategy
- verified deployment/release path

Unavailable credentials/providers/datasets/analytics may produce explicit blockers or measurement plans, but the project must not be mislabeled production- or marketing-ready.

## Shared auth standard: 꽃다발

Any generated project that requires login or sign-up uses the shared **꽃다발** auth runtime instead of inventing a new authentication process per project. `needsAuth=true` causes Luna to enforce a Backend server-session Task and a dependent Frontend session/UI Task, preserve the authentication technology decision, and reject plans that omit or weaken mandatory auth criteria.

The shared client state model is `checking`, `anonymous`, `submitting`, `authenticated`, and `error`. The common route meanings cover session lookup, sign-in, sign-up, callback, and sign-out. Server-owned sessions, production `HttpOnly`/`Secure`/explicit `SameSite` cookies, session rotation, same-origin local redirect validation, secret isolation, stable auth errors, and consistent protected-request handling are mandatory acceptance criteria.

Provider choice remains project-specific. GitHub, Google, email/password, or another provider can be implemented behind an adapter when product evidence supports it. The current Luna implementation is therefore a **provider/framework-neutral contract, planning runtime, enforcement layer, and policy test suite**, not a claim that one universal provider SDK is already installed into every generated project. See [`BOUQUET_AUTH.md`](./BOUQUET_AUTH.md).

## Release target

User-facing web projects are intended to publish into the existing Luna/Playground app collection under `/apps/<id>/` by default. A different deployment target requires a product reason.

## Current implemented runtime

Implemented in the existing Tauri/React desktop app includes:

- five equal team pool
- **15 independent delivery Agent roles per team**, including Data & Marketing
- organization-level Project Intake and clarification gate
- fairness-guarded evidence-based team allocation
- local state persistence plus evidence-based interrupted terminal-task reconciliation
- durable app-data orchestration snapshots and append-only history beyond localStorage
- PM Codex planning runtime and dependency validation
- shared 꽃다발 authentication contract with `needsAuth` Backend/Frontend Task injection and mandatory security criteria enforcement
- mandatory marketing/documentation governance plan injection
- `BloomBouquet` repository bootstrap and `main`/`develop` setup
- dependency-aware Agent task queue with bounded parallel waves
- cooperative `/pause` / `/resume` / `/stop` execution control with persisted wave-boundary reconciliation
- dedicated Agent worktrees and `agent/<team>/<role>/<task>` branches
- evidence-gated completed-worktree cleanup/archive after project integration
- Codex App Server Agent threads/turns
- common writer evidence gate requiring exact origin and matching report/worktree/remote/PR head SHAs
- Code Review / Reviewer / QA / Documentation / User role separation
- Debug / Problem Router failure classification and PM/Product Owner recovery routing
- integration/merge evidence gate
- independent project retrospectives
- Team Evolution experiments with keep/rollback evaluation
- measured team role-performance profiles
- senior 10+ operating baseline across Agent contexts
- Data & Marketing analysis → Documentation GTM workflow and policy tests

See [`AGENT_RUNTIME_POLICY.md`](./AGENT_RUNTIME_POLICY.md) for the detailed autonomy, seniority, decision, dependency, marketing, documentation, PR, and release contract. See [`SESSION_RECONCILIATION.md`](./SESSION_RECONCILIATION.md) for restart reconciliation evidence and limitations.

## Remaining runtime work

The following still require dedicated verification or implementation and must not be represented as finished:

- true live in-flight Codex App Server process reconnect and non-destructive turn pause/resume beyond terminal-evidence restart reconciliation
- final Luna apps portal release publication
- managed unattended GitHub identity/credential strategy
- full packaged Windows Tauri + Codex App Server end-to-end verification
- real multi-project end-to-end soak/failure testing

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

Build and policy tests:

```bash
pnpm build
pnpm test:allocation
pnpm tauri build
```
