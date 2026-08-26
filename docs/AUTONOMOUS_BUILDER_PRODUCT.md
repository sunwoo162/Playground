# Autonomous Builder product direction

## Product decision

The product is pivoting from a Luna desktop companion into a web-first autonomous software builder.

The user-facing product no longer depends on the Luna character, desktop-pet behavior, inventory, shop, focus-room, or character-customization concepts. Those features are not part of the new product value proposition.

The retained core is the multi-Agent software-delivery runtime that already plans work, creates repositories and isolated worktrees, dispatches specialist Agents, verifies Git/PR evidence, reviews and tests changes, persists orchestration history, recovers terminal Agent results, and archives completed worktrees.

## One-line product definition

> Describe an idea or choose a template, then an autonomous Agent team plans, builds, reviews, tests, and prepares a real web or app project.

The product should feel like requesting work from a software team, not chatting with one code-generation model.

## Primary user flows

### 1. Idea to project

1. The user describes an idea in plain language.
2. The user selects a target: Web, Mobile, or Web + Mobile.
3. Optional feature switches add explicit product requirements such as accounts, search, notifications, admin, payments, maps, or uploads.
4. Project Intake analyzes the request and asks only for blocking clarification.
5. PM creates product/architecture decisions and a dependency DAG.
6. Specialist Agents execute independent tasks.
7. Review, QA, documentation, integration, and deployment gates run before release readiness is claimed.

### 2. Template to project

The home screen offers starter templates such as community, booking, dashboard, commerce, portfolio, SaaS, and mobile app. Selecting a template pre-fills an editable product brief. Templates are starting constraints, not fixed generators.

### 3. Idea recommendation

A later flow may let the Idea Agent propose project ideas. The user can select one and start the same build pipeline without manually writing a full prompt.

## Web control plane

The root Playground web application becomes the control plane for the builder.

The first web product surfaces:

- idea input;
- template selection;
- platform selection;
- feature requirements;
- project list and project detail;
- Agent/task progress;
- blockers and clarification requests;
- build/test/review evidence;
- GitHub repository, branch, commit, and PR references;
- preview/release status.

Existing apps under `/apps/*` can remain available during migration. They may later become examples, generated outputs, or archived legacy apps, but they are no longer the main portal concept.

## Runtime architecture

The browser must not directly execute Git, GitHub CLI, Codex App Server, worktree, or filesystem mutation commands.

The target architecture is:

```text
Web Client
   |
   v
Builder API / Project Orchestrator
   |
   +--> Project state + durable history
   |
   +--> Agent Scheduler
           |
           +--> isolated worker/worktree
           +--> Codex App Server session
           +--> GitHub repository / branch / PR
           +--> build / review / QA evidence
   |
   v
Preview / Deployment
```

The existing Tauri Agent Runtime is preserved during migration because it contains working orchestration behavior and safety gates. It becomes a reference/worker implementation while OS-bound commands are extracted behind server/worker interfaces. The Tauri desktop shell is not the target user-facing product.

## Agent organization

The current independent-Agent model is retained.

Core roles include:

- Idea / Intake
- PM
- Design System
- Designer
- Frontend
- Backend
- Data & Marketing
- Code Review
- Reviewer
- QA
- Documentation
- Debug / Problem Router
- User simulation roles
- Process evaluation

Agents keep independent judgment. Review findings are evidence, not unquestionable authority. Repository-changing Agents keep isolated branches/worktrees and verifiable commit/PR output.

## Authentication: 꽃다발

꽃다발 remains the shared authentication standard.

### Builder platform authentication

The builder web platform should use 꽃다발 for its own account/session flow once the reusable auth service/package is available. Platform account state owns the user's projects, GitHub connection metadata, build history, and deployment references.

### Generated project authentication

If a generated project requires login or sign-up, PM must use 꽃다발 by default rather than inventing a project-specific auth architecture.

The existing `needsAuth=true` policy remains valid:

- Backend server-session contract;
- dependent Frontend auth/session UI contract;
- server-owned sessions;
- secure cookie requirements;
- redirect validation;
- session rotation;
- secret isolation;
- stable auth errors;
- provider adapters when needed.

Provider choice remains project-specific. 꽃다발 is the shared contract/runtime, not a requirement that every project use the same social provider.

## MVP scope

The first production target is **web application generation**.

MVP includes:

- idea input and template starts;
- Web target;
- project planning and Task DAG;
- real repository creation;
- Frontend/Backend/Design Agent execution;
- shared 꽃다발 injection when auth is required;
- Code Review / Reviewer / QA / Documentation gates;
- build evidence;
- project progress UI;
- preview/deployment path.

Mobile generation follows after the Web flow is reliable. Expo/React Native is the preferred initial mobile target unless project evidence requires another stack.

## Product states

A project should expose understandable product states rather than raw orchestration internals:

```text
draft
clarification-required
planning
building
reviewing
testing
release-ready
blocked
stopped
released
```

Detailed Agent, task, branch, commit, PR, evidence, and session data remains available in the project detail view for advanced users.

## Migration policy

### Keep

- Project Intake and clarification
- PM planning and dependency DAG
- Agent teams and independent roles
- bounded parallel scheduling
- GitHub repository/branch/PR runtime
- evidence gates
- failure routing/replanning
- durable orchestration history
- pause/resume/stop at safe boundaries
- terminal Agent reconciliation
- worktree cleanup/archive
- 꽃다발 policy/runtime

### Deprecate from the user-facing product

- Luna branding
- desktop pet window
- character customization
- pet behavior engine as a product feature
- inventory/shop
- companion/focus-room positioning

### Preserve temporarily for migration

`apps/desktop` remains in the repository until its OS-bound Agent Runtime has been extracted or replaced by server/worker equivalents. Removing the desktop shell before that extraction would destroy already-verified runtime behavior and safety checks.

## Non-goals for the first pivot release

The first pivot does not claim:

- that a browser alone can run the current Tauri/Git worker runtime;
- that mobile generation is already production-ready;
- that every generated project can deploy without credentials or provider setup;
- that live in-flight Codex process reconnect is implemented;
- that 꽃다발 is already a hosted universal provider implementation.

The product should show blockers and required external setup instead of inventing successful state.
