# Bloom Live E2E Smoke

## Goal

This smoke test verifies Bloom's real headless project execution path, not only policy or mocked orchestration code.

The target flow is:

```text
Bloom Web project request
  ↓
Builder run queue
  ↓
Bloom worker claim
  ↓
Organization Intake
  ↓
PM plan
  ↓
repository bootstrap
  ↓
Frontend + Backend Agent work
  ↓
repository-writing Agent branches / worktrees / commits / pull requests
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
integration merge
  ↓
worker Run completed
```

A deterministic CI policy scenario protects this contract, but CI alone is not a real Live E2E pass because the production path requires the operator machine's authenticated Codex and GitHub Runtime.

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

The fixture intentionally requires both Frontend and Backend work so the run proves more than a static-page path.

## Starting a run

Open Bloom Web and choose **Live E2E**.

The panel creates a normal Bloom project whose brief contains `[BLOOM-E2E-SMOKE]` and an exact unique repository name such as:

```text
bloom-e2e-pulseboard-20260827-101112
```

Starting the smoke uses the same public project create API and run queue API as an ordinary Bloom project. There is no hidden orchestration shortcut.

## Required local worker preconditions

Before starting a real run:

1. Bloom backend is running and the browser is authenticated.
2. A Bloom worker is running and can claim the queued run.
3. `codex --version` works on the worker machine.
4. `codex login status` confirms ChatGPT authentication.
5. `gh auth status` succeeds with access to the target GitHub organization.
6. Git can fetch and push repositories.
7. `BLOOM_WORKSPACE_ROOT` points to a writable workspace root.
8. `BLOOM_GITHUB_ORGANIZATION` is configured for the intended organization.
9. The Bloom Runtime bridge can be built and launched.
10. No secrets are pasted into the project brief or generated documentation.

If one of these prerequisites is unavailable, the run must block or fail honestly instead of being marked passed.

## Audit contract

Bloom Web reads the authenticated run snapshot through:

```text
GET /api/builder/projects/{projectId}/runs/{runId}/snapshot
```

The endpoint is read-only and returns a snapshot only when the logged-in user owns the project and run.

The Live E2E audit checks ten milestones:

1. Bloom orchestration snapshot contains the E2E marker
2. Organization Intake analysis and real session evidence
3. PM plan and PM session evidence
4. repository and workspace bootstrap evidence
5. Frontend and Backend Agent Tasks complete
6. every repository-writing Task has verified commit and PR evidence
7. Data & Marketing -> Documentation -> Code Review -> Reviewer -> QA completes
8. Code Review evidence covers every writer PR
9. integration target PRs are all merged
10. worker Run and orchestration phase both reach `completed` without a blocked reason

`ALL PASS` means all ten checks pass. Missing evidence stays `pending` while the run is active and becomes `fail` when the run reaches a terminal state without satisfying the contract.

## Expected repository artifacts

At minimum the generated product repository should contain normal application code plus:

```text
docs/marketing/MARKETING_ANALYSIS.md
docs/marketing/GO_TO_MARKET.md
```

The marketing files must describe the product that was actually built. Unsupported market metrics remain hypotheses or evidence gaps rather than fabricated facts.

## What to inspect when a run stops

Preserve evidence before retrying or deleting the fixture repository.

Inspect:

- Bloom Web run state and snapshot phase
- blocked Task ID and Agent role
- snapshot `blockedReason`
- worker logs
- Agent event/stderr paths
- Agent worktree
- local and remote branches
- commit SHA and PR URL
- Code Review `reviewedPullRequests`
- integration PR set and merge evidence

Fix the responsible Runtime layer, then rerun from preserved snapshot state where possible.

## Failure-injection follow-up

After one clean Live E2E run passes, repeat with one deliberate failure at a time:

- stop the worker while an Agent is running
- temporarily break GitHub connectivity
- force one build/test failure
- create an already-existing branch/worktree condition
- make one Agent return blocked
- make QA reject a change

Each injected failure should demonstrate the intended recovery or terminal-failure path instead of being silently ignored.

## Next lifecycle extension

The current headless completion boundary ends after integration merge. Retrospective and Team Evolution will be added as a post-integration phase after this production path is stable, then the E2E contract should gain explicit checks for those milestones.
