# Luna Live E2E Smoke

## Goal

This is Luna's first production-path smoke test. It is intentionally different from a unit test, policy test, or mocked orchestration test.

The run must use the same local Runtime and GitHub flow that a real project uses:

```text
/start
  ↓
Organization Project Intake
  ↓
team allocation
  ↓
team PM Codex
  ↓
BloomBouquet repository bootstrap
  ↓
Frontend + Backend Agent work
  ↓
agent branches / worktrees / commits / pull requests
  ↓
Data & Marketing
  ↓
Documentation
  ↓
Code Review
  ↓
Reviewer
  ↓
QA
  ↓
develop integration
  ↓
Agent retrospectives
  ↓
Team Evolution
  ↓
team returns to idle
```

Passing GitHub CI alone is not a Live E2E pass.

## Fixture product

The fixture is **Pulseboard**, a deliberately small full-stack feedback board.

It requires:

- web frontend
- API
- SQLite persistence
- create feedback with title, details, and category
- list feedback
- category/status filters
- status transitions: open, planned, done
- no authentication
- no external API
- no paid service
- no realtime infrastructure
- responsive/accessibility basics
- loading/error/empty states
- meaningful automated tests
- reproducible setup

The fixture intentionally requires both Frontend and Backend work so a successful run proves more than a single static page path.

## Starting a run

Open:

```text
Tools → Live E2E Smoke
```

The page generates a unique repository name and a `[LUNA-E2E-SMOKE]` `/start` command.

Use **명령 복사하고 Project Teams 열기**, paste the copied command into Project Teams, and run it.

The smoke command does not use a hidden shortcut. It enters the normal `/start` path so Organization Intake and team allocation are exercised exactly as they are for a real project.

## Required local preconditions

Before running:

1. Luna workspace root is configured.
2. `codex --version` works locally.
3. `codex login status` confirms ChatGPT authentication.
4. `gh auth status` succeeds with access to the BloomBouquet organization.
5. Git is installed and can fetch/push GitHub repositories.
6. The machine can create sibling `.luna-worktrees` and `.luna-runtime` directories.
7. No secret values are pasted into the project request or documentation.

If a prerequisite is unavailable, the smoke run should block honestly rather than being marked passed.

## Audit contract

The Live E2E page scans the latest project containing `[LUNA-E2E-SMOKE]` and checks eleven milestones:

1. Organization Intake record and real Codex session
2. auditable team allocation
3. PM plan, PM session, repository and workspace
4. Frontend and Backend Tasks both complete
5. every repository-writing Task has verified commit and PR evidence
6. Data & Marketing and Documentation complete
7. Data Marketing → Documentation → Code Review → Reviewer → QA governance complete
8. Code Review evidence covers every writer PR
9. project reaches the post-integration state
10. retrospectives and Team Evolution complete
11. assigned team returns to idle

The smoke is `ALL PASS` only when every check passes.

## Expected repository artifacts

At minimum the generated product repository should contain normal application code plus:

```text
docs/marketing/MARKETING_ANALYSIS.md
docs/marketing/GO_TO_MARKET.md
```

The marketing files must describe the product that was actually built. Unsupported market metrics remain hypotheses or gaps rather than fabricated facts.

## What to inspect when a run stops

Do not reset the project immediately. Preserve the evidence first.

Inspect:

- Project Teams runtime message
- blocked Task ID and Agent role
- `.luna-runtime` event/output/stderr paths
- Agent worktree
- local branch and HEAD
- remote branch
- open PR and base branch
- PR checks
- Debug Router result
- PM replan record, if any
- Product Owner decision request, if any

The failure itself is useful E2E evidence. Fix the responsible Runtime layer, rerun the blocked path, and keep the smoke project until the root cause is understood.

## Failure-injection follow-up

After one clean Live E2E run passes, repeat with deliberate failures one at a time:

- close Luna while an Agent is running
- temporarily break GitHub connectivity
- force one build/test failure
- create an already-existing branch/worktree condition
- make one Agent return blocked
- make QA reject a change

Each injected failure must demonstrate the intended recovery path instead of being silently ignored.

## Scope note

GitHub Actions still runs the deterministic E2E audit policy scenario so changes to the audit contract are typechecked and regression-tested. That CI scenario does **not** replace the local Live E2E run because CI does not have the user's ChatGPT-authenticated Codex session and Luna's local GitHub Runtime credentials.
