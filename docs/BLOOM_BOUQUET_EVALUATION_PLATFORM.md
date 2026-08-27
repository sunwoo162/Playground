# BloomBouquet Evaluation Platform

BloomBouquet is a Playground-style showcase for web projects. Teams publish independently deployed web services into one catalog, and BloomBouquet evaluates each submitted version through independent senior agents.

## Product boundary

- Playground server infrastructure remains the deployment base.
- Each project keeps its own runtime and URL; BloomBouquet stores metadata, versions, evaluation runs, reports, and evidence.
- All projects that require authentication use the shared Bouquet sign-up/login flow. Project-specific auth UX is not supported.
- Existing autonomous builder code remains available during migration, but new BloomBouquet project flows are evaluator-only.

## Core domain

- Team: a named project group such as Lily or Rose.
- Project: a web service owned by one team.
- Submission: an immutable project version containing demo URL, repository URLs, release metadata, and Bouquet auth requirement.
- EvaluationRun: one evaluation attempt for one submission.
- AgentEvaluation: one agent's independent findings, score, star rating, severity-tagged issues, evidence, recommendations, and confidence.
- EvaluationReport: the Process Evaluator aggregate created only after independent agent evaluations are available.

## Evaluation agents

All evaluator identities operate as independent 10+ year senior practitioners. They use domain terminology when it improves precision and always connect terminology to concrete evidence and impact.

Initial evaluation roster:

- User Agent A: first-time user usability and comprehension.
- User Agent B: repeat/power-user efficiency and interaction cost.
- UX Research: information architecture, cognitive load, affordance, journey, task completion risk.
- Frontend: rendering strategy, component boundaries, state ownership, Core Web Vitals, resilience.
- Backend: API contract, transaction boundaries, idempotency, failure isolation, persistence and scalability.
- Security: trust boundaries, attack surface, authorization, session handling, CSP/XSS/CSRF, secret exposure.
- Accessibility: semantic structure, keyboard flow, focus management, ARIA, contrast, assistive technology compatibility.
- Performance: latency, bundle/runtime cost, cache behavior, throughput and bottlenecks.
- QA: regression risk, edge cases, failure states, cross-device/browser behavior.
- Documentation: implementation/documentation drift and operational clarity.
- Code Review: source quality and maintainability when repository access is available.
- Process Evaluator: aggregates independent findings into the final report; it does not replace another agent's evidence.

## Report contract

Each AgentEvaluation records Assessment, Evidence, Severity, Impact, Recommendation, Priority, Confidence, score from 0 to 100, and star rating from 1.0 to 5.0.

The final report contains overall score, overall stars, category scores, production-readiness assessment, technical maturity, strengths, weaknesses, critical issues, and ordered remediation priorities.

## Version history

Submissions are append-only. Publishing a new project version creates a new Submission and a new EvaluationRun. Previous scores and reports remain visible so BloomBouquet can show project and team growth over time.

## Independence rules

- Evaluation agents do not read other agents' conclusions before submitting their own evaluation.
- An agent may flag a concern outside its specialty but delegates authoritative assessment to the relevant specialist.
- The Process Evaluator runs only after independent evaluations for the run are complete or explicitly unavailable.
- Every score and recommendation includes evidence and rationale.

## Bouquet authentication

Authentication-required projects use the shared Bouquet auth policy. Evaluators may test sign-up, login, session restoration, logout, authorization boundaries, and authenticated journeys, but projects must not introduce incompatible project-specific authentication flows.
