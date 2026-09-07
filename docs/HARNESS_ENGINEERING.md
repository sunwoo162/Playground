# Harness Engineering Standard

Updated: 2026-09-07

Harness Engineering is the common execution standard that Iseol will use to delegate software work. It extends the existing Bloom Harness instead of creating a second orchestration stack.

Detailed design: `docs/superpowers/specs/2026-09-07-iseol-harness-engineering-v1-design.md`
Previous foundation design: `docs/superpowers/specs/2026-09-04-bloom-harness-v1-design.md`

## Core boundary

```text
Iseol Web / Discord Bot
        |
        v
    Iseol Core
Project / Task / Approval / History
        |
        v
Engineering Harness
Plan / Build / Review / QA / Git / Deploy / Recovery
        |
        v
Repository / GitHub / CI / Server
```

Iseol decides what work should happen, tracks it, asks for approval when necessary, and presents history. The Harness performs engineering work and returns structured state/evidence. UI clients never become the source of truth for execution.

## Non-negotiable principles

1. **Evidence over claims.** Agent prose never proves completion by itself.
2. **Fail closed.** Unknown permission, missing evidence, or ambiguous revision is not success.
3. **Least privilege.** Builder, reviewer, QA, debugger, deploy, and orchestrator roles receive only required capabilities.
4. **Stable identity.** Public records are tied to `projectId`, `taskId`, `runId`, and when relevant `agentId`.
5. **History preservation.** Failed attempts, decisions, recoveries, and final results remain reconstructable.
6. **Project independence.** Framework differences live in manifest/adapter policy, not the orchestration core.
7. **UI independence.** Discord/Web may trigger and observe runs, but execution is controlled through Core/Harness contracts.
8. **Human authority.** Protected or destructive actions obey explicit approval policy.
9. **Bounded recovery.** Repeated identical failures replan/escalate instead of looping forever.
10. **Backward-safe migration.** Existing proven Bloom runtime paths stay in place until a replacement is contract-tested.

## Canonical project policy

`.bloom/project.yaml` remains the machine-readable source of truth. It declares commands, Git policy, quality gates, permissions, and later adapter/deployment metadata.

Missing write/GitHub/deploy policy defaults to deny. Discovery may infer context, but inference never grants mutation authority.

A human-readable `HARNESS.md` may explain project conventions, but it does not silently override machine policy.

## Standard runtime model

```text
Project
  -> Task
    -> Run
      -> Step
      -> Event
      -> Decision
      -> Evidence
      -> Failure
      -> Recovery
      -> Artifact
      -> Result
```

A Task describes the objective. A Run is one execution attempt. Retries create new Runs so failure history is not rewritten.

Facts, decisions, and explanations are stored separately. Facts are verifiable data; decisions capture technical choices and reasoning; explanations are user-facing summaries derived from the first two.

## Default lifecycle

```text
REQUEST -> CONTEXT -> CLASSIFY -> PLAN -> IMPLEMENT -> TEST -> REVIEW
        -> FIX LOOP -> VERIFY -> COMMIT -> PR -> DEPLOY -> E2E -> COMPLETE
```

Packs decide which stages are required for a task class. The current `bug-fix` pack is the reference implementation; `feature-development`, `code-review`, `documentation`, and `deployment` are the next built-in packs.

## Completion contract

Completion is derived from required evidence, not an agent status string. Depending on the selected pack and project manifest, required evidence can include file changes, tests, review, build, GitHub publication, deployment revision, health/smoke verification, and rollback state.

Evidence from one run cannot satisfy another run accidentally. Protected actions cannot be performed only because an agent recommended them.

## Recovery contract

Before retrying a writer/deployer, the Harness reconciles live process/session state, worktree state, Git/PR state, and persisted run identity. Healthy active work must never be reclassified as orphaned solely because a single observer lost state.

Recovery events remain part of the permanent task history so Iseol can show what failed and why the next attempt was different.

## Iseol integration contract

Iseol consumes versioned structured events and commands. It must not infer task status from raw Bloom worker logs.

Harness output must be sufficient for Iseol to render:

- current task/run/agent state;
- dated development timeline;
- task tree and branches caused by failures/rework;
- problem/observation/options/decision/reason records;
- commits, PRs, tests, builds, deployments, and E2E evidence;
- failed attempts and recovery history.

## Current implementation status

Current `main` already includes the first Harness foundation:

- `harnessContracts.ts` and validation;
- `.bloom/project.yaml` loading with deny-by-default inferred policy;
- deterministic `bug-fix` pack, pack binding, and plan policy;
- task evidence and completion gates;
- durable run snapshots/events/evidence;
- project completion enforcement;
- runtime completion adapter integration.

The next phase extends these contracts with stable project/task/run/agent identity, Decision/Failure/Recovery/Artifact/Result records, richer evidence payloads, Iseol-facing event/control contracts, additional packs, and adapter profiles.

## BloomBouquet repository invariants

The existing repository Harness still protects the current public product boundary:

- `playground-web/` must not return.
- `apps/` contains only retained internal `apps/desktop` runtime tooling.
- `build:bloom-web` emits repository-level `dist/`.
- the server has no legacy `/apps/*` static product routes.
- `bloom-web/index.html` and `dist/index.html` identify the BloomBouquet root shell.

These product-boundary checks remain valid while the engineering Harness expands; the two concerns are additive, not competing definitions of Harness.

## Verification commands

```bash
pnpm run test:bloom-runtime
pnpm run build:bloom-worker
pnpm run build:bloom-web
pnpm run harness
```

Linux/CI is authoritative for Linux-runtime path/symlink policy checks. On the Windows host, known platform-specific failures must be distinguished from Harness regressions.

## Harness Engineering v1 completion bar

The foundation is ready for Iseol integration only when:

1. multiple real project shapes use the same core with only manifest/adapter differences;
2. task/run/event/evidence identity cannot cross-contaminate runs;
3. required evidence and permissions fail closed;
4. decisions, failures, and recoveries are reconstructable from structured records;
5. review/test failure loops are bounded and traceable;
6. interrupted writers/deployers recover without duplicate side effects;
7. Iseol can build its development tree and dated timeline from public Harness contracts alone;
8. protected actions obey approval policy;
9. the existing Bloom showcase/evaluation path remains functional.

The implementation order is contract/identity first, then structured history, Iseol protocol, additional packs/adapters, recovery/approval hardening, and only then full Iseol Core/Web/Bot delegation.

## State and approval rules

Public run states use a small stable set: `QUEUED`, `PLANNING`, `RUNNING`, `TESTING`, `REVIEWING`, `DEPLOYING`, `BLOCKED`, `FAILED`, `RECOVERING`, `COMPLETE`, and `CANCELLED`.

Iseol reconstructs state from ordered public events. Events require stable IDs and per-run sequence ordering so reconnects and duplicate delivery do not corrupt the timeline.

Permissions answer whether an action is allowed at all. Approval policy separately answers whether an allowed protected action may execute automatically or must wait for the user.

External side effects such as PR creation, merge, release promotion, and deployment must be idempotent per task/run/action identity.
