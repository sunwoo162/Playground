# Bloom Harness v1 Design

Status: proposed for implementation
Date: 2026-09-04
Scope: Bloom runtime and repository integration; Luna remains a separate desktop-pet product.

## Problem

Bloom already has PM planning, agent orchestration, worker/session recovery, Git/GitHub/Codex execution, review gates, and QA policy. The missing layer is a stable harness that tells those capabilities how to operate consistently across different repositories and task types.

Without that layer, repository conventions, permissions, verification commands, evidence formats, and agent behavior are inferred repeatedly. That makes runs harder to reproduce, compare, audit, and extend.

## Goals

1. Make repository behavior explicit through a machine-readable project manifest.
2. Make reusable workflows explicit through task packs instead of hard-coded orchestration branches.
3. Give every agent the same input/output contract.
4. Treat execution evidence as first-class data rather than prose attached to a result.
5. Persist reproducible run artifacts that support recovery and audit.
6. Add an evaluation harness so Bloom changes can be measured against stable benchmark tasks.
7. Keep Luna as an optional user-facing interface over Bloom, not part of the Bloom runtime.

## Non-goals

- Replacing the existing Bloom PM, worker, bridge, or Git runtime in v1.
- Building a general plugin marketplace.
- Adding arbitrary third-party code execution beyond existing runtime permissions.
- Moving Bloom runtime code into `apps/desktop`.

## Chosen approach

Bloom Harness v1 is contract-first. Human-readable documentation explains the rules, while versioned schemas/config files are the executable source of truth. Runtime code consumes those contracts instead of embedding repository-specific policy.

Alternative approaches considered:

- Documentation-only: cheapest initially, but cannot enforce drift or produce deterministic behavior.
- Runtime-first refactor: flexible, but risks rewriting working Bloom internals before contracts are stable.
- Contract-first harness: smallest change that standardizes behavior while preserving the current runtime. This is the selected approach.

## Architecture

```text
User / Luna / API
       |
       v
Bloom Harness
  |- Project Manifest
  |- Pack Resolver
  |- Agent Contract
  |- Evidence Contract
  |- Run Artifact Store
  `- Evaluator
       |
       v
Existing Bloom Runtime
  PM -> Agents -> Review -> QA -> Integration
       |
       v
Repository / GitHub / Codex / CI
```

The harness is a policy and contract layer. Existing runtime components remain responsible for side effects and execution.

## 1. Project Manifest

Each repository may expose `.bloom/project.yaml`. If it is absent, Bloom may perform discovery, but discovered values are recorded as inferred and never silently treated as explicit permission.

Required v1 fields:

```yaml
version: 1
project:
  type: web
commands:
  install: pnpm install
  lint: pnpm lint
  typecheck: pnpm typecheck
  test: pnpm test
  build: pnpm build
git:
  baseBranch: develop
  branchPrefix: agent/
quality:
  requireReview: true
  requireTests: true
  requireBuild: true
permissions:
  filesystem: write
  git: write
  github: write
  deploy: deny
```

The manifest schema is versioned. Unknown required versions fail closed. Missing optional fields use documented defaults and are included in the run snapshot.

## 2. Task Packs

A pack describes how a class of work is planned and verified. Packs do not own repository side effects; they produce policy and task definitions consumed by the existing runtime.

Initial v1 packs:

- `feature-development`
- `bug-fix`
- `code-review`
- `documentation`
- `deployment`

Each pack declares:

- supported intents and selection hints
- required agent roles
- task ordering and dependency rules
- required evidence
- verification gates
- escalation/replan conditions

Pack selection is deterministic when an explicit pack is requested. Automatic selection records both the chosen pack and selection reason in the run artifact.

## 3. Agent Contract

Every agent receives the same envelope: objective, repository context, allowed scope, dependencies, acceptance criteria, permissions, and required evidence.

Every agent returns: status, summary, changed files, commands executed, evidence references, risks, unresolved issues, and suggested next actions.

Role-specific data lives under a versioned `payload` field so new roles do not require changes to the orchestration envelope.

## 4. Evidence Contract

A completion claim is valid only when its required evidence exists. Evidence is structured and referenced by ID instead of embedded only in free-form summaries.

V1 evidence kinds:

- command result: command, exit code, duration, stdout/stderr digest
- test result: suite, passed/failed/skipped counts
- build result: command and outcome
- file change: paths and diff/commit reference
- review result: reviewer, findings, disposition
- GitHub result: branch, commit, PR, check status
- deployment result: environment, revision, smoke result, rollback state

Secrets and raw credentials must never be written to evidence artifacts. Large logs are stored separately and referenced by digest/path.

## 5. Run Artifacts

Each run receives an immutable run ID and a persisted directory or equivalent durable store containing:

```text
request.json
manifest.snapshot.json
pack.snapshot.json
plan.json
dag.json
events.jsonl
evidence.json
review.json
qa.json
result.json
retrospective.md
```

Mutable runtime state may be checkpointed separately, but completed evidence and snapshots are append-only. Recovery reconciles repository/session evidence before resuming side effects.

## 6. Evaluation Harness

Bloom changes must be evaluated against stable benchmark scenarios rather than judged only by anecdotal successful runs.

Initial benchmark classes:

- simple bug fix with a regression test
- small frontend feature
- backend/API change
- failing CI repair
- merge conflict handling
- documentation-only task
- deployment with smoke verification
- interrupted-run recovery
- malicious or out-of-scope instruction rejection

Metrics include task success, first-pass success, human intervention count, replan count, verification pass rate, review escape rate, rollback rate, runtime, and model/tool cost when available.

Evaluation fixtures must not write to production resources. External integrations use test repositories, mocks, or explicitly designated sandbox environments.

## Error handling and permissions

- Invalid manifests fail before repository mutation.
- Permission denial is a terminal or escalation result, never an instruction to bypass policy.
- Pack/agent contract version mismatches fail closed.
- Interrupted writer tasks reconcile Git, GitHub, workspace, and session evidence before retrying.
- Deployment requires explicit manifest permission plus deployment-pack gates.
- Repeated identical failures trigger replan/escalation instead of an unbounded retry loop.

## Luna boundary

Luna may submit Bloom requests and render run state/evidence, but `apps/desktop` must not import Bloom worker/runtime code. Communication occurs through the same public request/status contract used by other clients.

## Delivery sequence

V1 is delivered without replacing working runtime paths:

1. Add versioned TypeScript contracts and schema validation.
2. Add project-manifest loader with explicit/inferred provenance.
3. Add pack registry and convert one existing workflow to `bug-fix` as the reference pack.
4. Normalize agent outputs into the common contract.
5. Persist evidence and run artifacts through the existing snapshot boundary.
6. Add benchmark fixtures and an evaluator CLI.
7. Migrate additional workflows only after the reference pack passes regression tests.

## Testing strategy

- Unit tests for manifest, pack, agent, and evidence schema validation.
- Contract tests for serialization/backward-compatible reads.
- Policy tests proving denied permissions prevent side effects.
- Recovery tests for interrupted writer runs.
- Golden run-artifact tests that detect accidental schema drift.
- Existing Bloom policy tests remain required.
- At least one clean local E2E must pass before enabling a migrated pack by default.

## Success criteria

Bloom Harness v1 is complete when:

- a repository can declare its commands, Git policy, quality gates, and permissions in one manifest;
- a `bug-fix` run can be selected through a pack rather than a repository-specific orchestration branch;
- all participating agents emit the common contract;
- completion is rejected when required evidence is missing;
- a run can be reconstructed from persisted snapshots/events/evidence;
- the evaluator can execute a stable benchmark set and report comparable metrics;
- Luna remains independently buildable with no Bloom runtime dependency.

## YAGNI boundary

V1 intentionally uses a small built-in pack registry and local/versioned contracts. Remote pack installation, public marketplaces, arbitrary scripting hooks, and cross-organization policy distribution are deferred until real usage proves they are necessary.
