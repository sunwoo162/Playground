# Luna Live E2E Canary

## Purpose

The Live E2E Canary proves that Luna can take one real product from Organization Intake through team allocation, PM planning, independent Agent work, marketing/documentation governance, PR integration, retrospective, and Team Evolution.

This is intentionally different from CI. A green TypeScript build or Rust `cargo check` proves that Luna compiles. The Canary proves that the local orchestration can actually use the Product Owner's ChatGPT-authenticated Codex session and local GitHub authentication to create and integrate a real BloomBouquet project.

## Canary product

The fixed product is **PulseNote**, a deliberately small full-stack notes application:

- React web UI
- backend HTTP API
- SQLite persistence
- create/edit/delete/list notes
- required title, optional body, tags, timestamps
- loading, empty, validation, success, and recoverable error states
- health endpoint and backend input validation
- frontend/backend automated tests
- reproducible local setup/run path
- basic keyboard/accessibility semantics
- no auth, payments, realtime, third-party API, or external production secret

The scope is narrow on purpose. The test is Luna's project organization, not the novelty of the sample app.

Every run uses an isolated repository. Given Luna Project ID `PROJECT-ABC-123`, the PM must choose exactly:

```text
pulsenote-canary-project-abc-123
```

The Project ID makes the repository deterministic and unique per run. Reusing a prior `pulsenote` or prior Canary repository can leave stale branches, commits, PRs, documentation, or test artifacts and therefore does not qualify as a valid fresh E2E run. Luna validates the planned repository name before Agent execution continues.

## Actual flow

```text
Live E2E Canary
  ↓
Runtime preflight
  ↓
Organization Project Intake
  ↓
equal-team allocation
  ↓
team PM Codex
  ↓
fresh BloomBouquet repository bootstrap
  ↓
Frontend + Backend Agent work
  ↓
independent branches / worktrees / commits / PRs
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
develop PR integration
  ↓
participating Agent retrospectives
  ↓
Team Evolution
  ↓
project completed / team idle
```

The existing Project Teams runtime performs the work. The Canary does not use a mock Agent runtime or a fake GitHub repository.

## Starting the run

1. Open Luna → Tools → **Live E2E Canary**.
2. Ensure Project Teams Runtime has a valid Workspace root.
3. Press **실제 E2E Canary 시작**.
4. Luna checks Git, GitHub CLI/authentication, ChatGPT Codex authentication, and BloomBouquet access. Any missing prerequisite blocks the run before Intake.
5. Organization Intake runs and a real idle team is allocated.
6. Luna moves to Project Teams with the Canary project selected.
7. Press **PM Runtime 실행** for the newly queued project.
8. PM must return the exact isolated Canary repository name and include real Frontend + Backend implementation work. Luna's normal marketing policy appends the Data & Marketing → Documentation → Code Review → Reviewer → QA governance chain.
9. The existing PM → Agent queue → integration → retrospective flow continues automatically until completion or an explicit blocker.
10. Return to Tools → Live E2E Canary and press **E2E 상태 새로고침** to inspect the final report.

The second explicit PM click exists because a project arriving from another Luna tool is intentionally queued before repository mutation. It preserves the same boundary used by Market Discovery handoff rather than silently creating a repository from a navigation action.

## Pass criteria

The Canary has 12 evidence stages. **Every stage must be PASS**:

1. Organization Intake
2. team allocation
3. PM / repository bootstrap
4. Frontend + Backend development
5. Data & Marketing
6. Documentation
7. Code Review
8. Reviewer
9. QA
10. develop integration
11. Agent retrospective
12. Team Evolution

A Canary is PASS only when the stored project is `completed`, all required stages are evidence-backed, the repository name matches the Project-ID-derived isolated name, and no required-plan blocker remains.

The report also records:

- actual BloomBouquet repository name
- actual Agent PR numbers
- actual commit SHAs
- failure-route count
- PM replan count
- current blocker details

## What does not count as a pass

The following do **not** independently prove E2E success:

- `pnpm build`
- policy tests
- `cargo check`
- Harness workflow success
- a PM plan without Agent execution
- Agent text claiming that a test passed
- local files without pushed branches/PR evidence
- reuse of a previous Canary repository
- PRs that never pass the review/QA integration gate
- completed application code without Data & Marketing / Documentation governance
- merged PRs without retrospective and Team Evolution completion

## Environment prerequisites

The live run requires the same runtime prerequisites as normal Luna project work:

- Codex CLI installed
- `codex login status` reports ChatGPT authentication
- `gh` installed and authenticated for the target BloomBouquet organization
- access to create/use the intended project repository
- a writable Luna Workspace root
- Git available
- network access required by GitHub/package tooling

Missing prerequisites are blockers. They must be surfaced; they are not replaced with fake success.

## Failure policy

Canary failures use the normal production failure path:

```text
Agent failure
  ↓
Debug / Problem Router
  ├─ retry-owner
  ├─ escalate-pm
  └─ needs-human
```

A recovered Canary may still pass. The final report preserves failure-route and replan counts so recovery is visible rather than erased.

## Why the Canary is versioned

The request includes `[LUNA-E2E-CANARY:v1]`. The marker lets Luna distinguish this controlled product from normal user projects and evolve the test deliberately when the orchestration contract changes.

Changing the Canary product or required stages should increment the marker version and update the policy test so historical runs are not silently reinterpreted under different pass criteria.
