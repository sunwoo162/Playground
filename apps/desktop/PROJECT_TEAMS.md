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

The runtime then applies organization policy. In particular, release-target product plans receive a mandatory Data & Marketing → Documentation → Code Review → Reviewer → QA chain. This policy is injected after the PM plan so marketing governance cannot disappear just because a PM omitted it.

If authentication is required, the project must use the shared **꽃다발** authentication standard.

## BloomBouquet repository runtime

Once the plan is validated, Luna prepares the real project repository in the configured GitHub Organization, currently `BloomBouquet` by default.

The runtime can create a private repository when missing, clone it into the configured workspace root, verify an existing origin, stop on dirty local changes, ensure `main`, and create/track `develop`.

GitHub Connector access and Luna's local runtime credential are separate. The desktop runtime still requires an authenticated local `gh` session for unattended repository mutation.

## Agent task dispatcher

PM tasks become persisted task-run records. Tasks without dependencies become `ready`; dependency-bound tasks stay `pending` until dependencies are `done`.

The scheduler currently limits execution to at most two tasks per wave and at most one running task for the same role. Blocked tasks have bounded retries.

Each Agent task is executed through a dedicated Codex App Server thread/turn with its own role prompt, task contract, worktree, and dependency artifacts.

Repository-changing Agents receive dedicated worktrees/branches. When an Agent claims completion, Luna independently verifies expected branch, clean worktree, local HEAD, matching remote branch SHA, and an open `develop`-targeting PR before trusting commit/PR metadata.

Review/QA/User-style Agents report the dependency PRs they actually examined and return structured evidence and verification results.

## Execution control

Project Teams supports `/pause`, `/resume`, and `/stop` for an active planned project. Execution control is persisted independently from the project's delivery/failure status so a deliberate pause is not misclassified as an Agent failure.

`/pause` is cooperative at the Agent-wave boundary. If no Agent Task is running, the project pauses immediately. If a wave is already running, Luna records `pause-requested`, accepts the results from that already-dispatched wave, and prevents Debug Router work or a new dependency-ready wave from starting. `/resume` restores scheduling from the preserved Task DAG and can also cancel a pending pause request before the current wave finishes.

`/stop` follows the same safe boundary rule but is terminal for that project execution. After the current wave settles, Luna stops dispatching new Agent work and releases the assigned team back to `idle`. Existing task evidence, branches, commits, PR references, and project history are preserved rather than rolled back.

The control states are `running`, `pause-requested`, `paused`, `stop-requested`, and `stopped`. They are stored under a dedicated local persistence record so the asynchronous queue can observe a user request even while its current React execution closure is waiting for Agent results.

This is not a claim of true in-turn process suspension. Luna does not currently freeze and later continue the same in-flight Codex turn; process-level interruption/reconnect reconciliation remains separate runtime work. If Luna itself exits while a Task is recorded as `running`, the existing interrupted-task recovery still marks that Task blocked so repository evidence can be checked before retrying.

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

PM Runtime failures and Agent Runtime failures are tracked separately. Interrupted `running` tasks are recovered as blocked rather than being falsely treated as resumed.

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

Any generated project that requires login or sign-up must use the shared **꽃다발** auth standard instead of inventing a new authentication process per project. The current runtime carries this as policy; the reusable auth package/runtime itself remains separate work.

## Release target

User-facing web projects are intended to publish into the existing Luna/Playground app collection under `/apps/<id>/` by default. A different deployment target requires a product reason.

## Current implemented runtime

Implemented in the existing Tauri/React desktop app includes:

- five equal team pool
- **15 independent delivery Agent roles per team**, including Data & Marketing
- organization-level Project Intake and clarification gate
- fairness-guarded evidence-based team allocation
- local state persistence and interrupted-task recovery
- PM Codex planning runtime and dependency validation
- mandatory marketing/documentation governance plan injection
- `BloomBouquet` repository bootstrap and `main`/`develop` setup
- dependency-aware Agent task queue with bounded parallel waves
- cooperative `/pause` / `/resume` / `/stop` execution control with persisted wave-boundary reconciliation
- dedicated Agent worktrees and `agent/<team>/<role>/<task>` branches
- Codex App Server Agent threads/turns
- repository writer commit/push/PR contract with independent post-turn verification
- Code Review / Reviewer / QA / Documentation / User role separation
- Debug / Problem Router failure classification and PM/Product Owner recovery routing
- integration/merge evidence gate
- independent project retrospectives
- Team Evolution experiments with keep/rollback evaluation
- measured team role-performance profiles
- senior 10+ operating baseline across Agent contexts
- Data & Marketing analysis → Documentation GTM workflow and policy tests

See [`AGENT_RUNTIME_POLICY.md`](./AGENT_RUNTIME_POLICY.md) for the detailed autonomy, seniority, decision, dependency, marketing, documentation, PR, and release contract.

## Remaining runtime work

The following still require dedicated verification or implementation and must not be represented as finished:

- true in-turn Codex App Server pause/interruption/reconnect reconciliation beyond the implemented cooperative wave-boundary controls
- persistent orchestration history beyond localStorage
- completed-worktree lifecycle cleanup/archive
- reusable 꽃다발 authentication implementation
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
