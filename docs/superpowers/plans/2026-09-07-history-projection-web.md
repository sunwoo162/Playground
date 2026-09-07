# History Projection / Web Integration Plan

Date: 2026-09-07
Scope: Playground/Bloom web only. Discord bot work is explicitly out of scope for this branch.

## Goal

Expose trustworthy Harness development history to the unified web without making React parse raw run files or internal worker logs.

## Architecture

```text
HarnessRunArtifactBundle
  -> validate identity + references + ordered public events
  -> HarnessRunHistoryProjection
  -> web API
  -> Project Detail
       [Live Project] [Development]
                    -> dated timeline / decisions / failures / recoveries / evidence
```

## Rules

- `publicEvents.seq` is the authoritative event order.
- timestamps are display metadata, not ordering authority.
- projection is read-only and deterministic.
- every referenced decision/failure/recovery/evidence/artifact must exist in the same run.
- identity-bound runs only; legacy unbound runs do not silently become trusted history.
- React never reads `.bloom/runs` directly.
- no Discord/Bot implementation changes in this phase.

## Task 1 — Run History Projection Contract

Create `harnessRunHistoryProjection.ts` and policy tests.

Projection fields:
- identity
- status
- startedAt / completedAt
- ordered timeline entries
- decisions / failures / recoveries
- evidence / artifacts
- terminal run result

Fail closed on:
- unbound run
- identity mismatch
- missing references
- recovery -> unknown failure
- runResult references to unknown records
- invalid public event ordering

## Task 2 — Web Read API

Add a server-side endpoint that returns history projections for a project/run without exposing filesystem paths.

Initial route:
`GET /api/bloom-bouquet/public/projects/:projectId/development`

The endpoint maps a published project to available Harness run projections and returns an empty history when none exists.

## Task 3 — Project Detail Development View

Extend the existing project detail with two user-facing modes:
- `프로젝트 보기`
- `개발 과정`

Development mode renders:
- dated timeline
- current/final run status
- decisions with reason/options
- failures and linked recoveries
- commit/PR/test/deploy evidence links when available

## Task 4 — Verification

- projection policy tests
- server route tests
- web build
- full Harness workflow on Ubuntu
- no changes to Discord bot repository or bot-specific UI
