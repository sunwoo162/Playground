# BloomBouquet Product Baseline

Updated: 2026-08-27

This document supersedes the former multi-app Playground product baseline.

## Product

BloomBouquet is a public project showcase and evaluation platform. Teams publish real web projects as versioned submissions, independent 10+ year senior Agents evaluate each submission, and BloomBouquet stores the resulting score, star rating, evidence, technical findings, recommendations, and history.

Production root: `https://playground.https.gsmsv.site/`

## Core model

```text
Team
  → Project
    → Submission (append-only version)
      → EvaluationRun
        → AgentEvaluation × N
        → Process Evaluator aggregate
```

A new submission never overwrites an older evaluation. Project and team pages can therefore show technical growth over time.

## Evaluation policy

Independent evaluators include user, UX research, frontend, backend, security, accessibility, performance, QA, documentation, and code-review roles. They do not copy one another's judgment. The Process Evaluator aggregates only after required independent evidence exists.

Every specialist report uses the senior review contract:

- Assessment
- Evidence
- Severity
- Impact
- Recommendation
- Priority
- Confidence
- technical terminology appropriate to the Agent's specialty
- score and star rating

## Authentication

All published projects that need accounts use the shared **꽃다발** Identity Provider. Each authenticated submission receives a dedicated OAuth client. The project uses Authorization Code + PKCE S256 and keeps its own application session after server-side code exchange; it must not create a separate email/password credential store.

## Public web architecture

- `bloom-web/`: the only public root frontend.
- `server/`: serves `dist/`, proxies backend traffic, and preserves only the Builder GitHub-auth boundary while legacy Builder mode exists.
- `backend/`: BloomBouquet persistence/API and 꽃다발 Identity Provider.
- `bloom-runtime/`, `bloom-worker/`: Agent execution policies and headless runtime.
- `apps/desktop/`: retained internal runtime tooling only.

The former `playground-web/` source, `/apps/<id>` hosting model, and legacy hosted application directories are removed.

## Deployment contract

`pnpm run build:bloom-web` must generate `dist/index.html` with root-relative assets. The existing PM2/Nginx server topology remains in place. A production deployment is successful only when the local root smoke check returns the BloomBouquet shell.

## Current next milestone

After the public cutover, the next product milestone is the evaluator worker that actually opens a submitted project, executes the independent user/specialist review roles, persists AgentEvaluation evidence, and lets the Process Evaluator finalize the report.
