# Luna Agent Runtime Policy

This document defines the execution contract for Luna Project Teams. It is intentionally stricter than a prototype workflow because projects created by Luna are expected to be usable products, not AI demos.

## Independent Agent model

Every Agent is treated as an independent worker, even when multiple Agents use the same underlying Codex model family.

Each Agent must have its own:

- runtime/session state
- role instruction set
- task history
- project-scoped memory
- retrospective history
- semantic version
- branch or worktree when it modifies repository content
- Git identity metadata
- execution log

An Agent is not a role switch inside one shared conversation. Handoffs happen through explicit artifacts such as task records, commits, diffs, design decisions, review reports, test reports, issues, and pull requests.

## Project-scoped permissions

Agents are allowed to act autonomously inside the project they are assigned to. The runtime should expose the following capabilities when available:

- read and write repository files
- create branches and worktrees
- run shell commands and package managers
- add or change dependencies when there is a product reason
- run lint, typecheck, tests, builds, and local servers
- use a browser for product research, QA, and user testing
- inspect Figma/design-system sources when the project connects them
- create commits and push branches
- create and update issues
- open and update pull requests
- submit pull-request reviews, approvals, and change requests
- merge a pull request after repository protection rules and required Luna quality gates pass
- prepare and publish the project to the Luna apps portal after release gates pass

The PM coordinates work but does not proxy every GitHub action. A Frontend Agent can open its own PR. A Backend Agent can open its own PR. A Reviewer Agent reviews those PRs from its own independent session. A QA Agent can attach verification results or block release.

Repository credentials may be provided by one Luna GitHub App/runtime credential, but all actions must preserve the logical Agent identity in runtime logs and Git/PR metadata. If separate visible GitHub authors are required later, use dedicated bot/app identities rather than sharing human credentials.

## Dependency policy

Luna is lightweight, but generated projects are not forced to avoid libraries or frameworks.

Add a dependency when it materially improves reliability, security, accessibility, maintainability, performance, or delivery speed. Do not reimplement mature infrastructure merely to keep dependency count at zero.

Before adding a major dependency, the responsible Agent records:

- what problem it solves
- why the existing stack is insufficient
- maintenance/security considerations
- bundle/runtime cost when relevant
- why the chosen dependency is preferred over obvious alternatives

Remove or reject dependencies that only add decoration, duplicate existing functionality, or create unjustified bundle/runtime weight.

## Production-service quality policy

A Luna-generated project is expected to be a real-use service or production candidate. A mock-only implementation is not considered complete.

Before completion, the responsible team must verify or explicitly block on:

- complete primary user workflow from an empty state
- real persistence when data must survive refresh/device/session boundaries
- shared `꽃다발` authentication when login/sign-up is required
- loading, empty, error, invalid-input, permission, and retry states
- responsive behavior for the intended devices
- accessibility for core interactions
- real API/data integration when the product depends on external data
- environment-variable and secret handling
- security-sensitive input validation and authorization boundaries
- build success
- automated tests appropriate to the project
- browser/manual QA for user-facing flows
- deployment path under the Luna apps portal
- production blockers listed explicitly and prevented from being mislabeled as complete

If a required external credential, account, legal approval, paid service, or production dataset is missing, the team may build a clearly isolated local mode, but the project remains blocked for production until that dependency is resolved.

## Pull-request autonomy

Agents create their own PRs when their task produces a reviewable repository change.

Expected flow:

1. Agent inspects the current repository and project rules.
2. Agent creates or receives a dedicated branch/worktree.
3. Agent changes real files.
4. Agent runs available verification.
5. Agent creates small English commits.
6. Agent pushes its branch.
7. Agent opens or updates its own PR using the repository PR template/rules.
8. Reviewer Agent independently reviews the diff.
9. QA Agent independently verifies the integrated behavior.
10. Failures are routed to the Agent best able to resolve them.
11. Merge is allowed only after required review/QA/repository gates pass.

The PM tracks and coordinates these PRs, but does not impersonate the workers that produced them.

## Release target

User-facing web projects are published into the existing Luna/Playground apps collection rather than introducing a separate deployment platform by default.

The team should reuse the repository's existing portal conventions and `/apps/<id>/` path rules. A different deployment target requires a product reason.

## Retrospective and evolution

After a project completes, every participating Agent writes an independent retrospective. The Process Evaluator evaluates that project, then the organization-level Team Evolution Agent compares current and historical evidence before proposing Agent or Team Playbook version changes.

No Agent directly rewrites its own permanent operating rules from a single retrospective. Changes are versioned, measured on later projects, and can be rolled back when outcomes worsen.
