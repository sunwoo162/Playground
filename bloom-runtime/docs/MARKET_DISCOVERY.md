# Luna Market Discovery

## Goal

Market Discovery lets Luna start from a market, user problem, industry, or keyword instead of requiring the Product Owner to arrive with a finished product idea.

The purpose is not to auto-generate random startup ideas. It is to collect current public evidence, identify defensible opportunity spaces, let an independent Idea Agent convert those opportunities into concrete software-product candidates, and then require Product Owner selection before normal Project Intake begins.

## Actors

### organization:data-marketing

Organization-level Data & Marketing Agent. It is separate from all five delivery-team Data & Marketing Agents and therefore cannot preselect or favor a team.

Responsibilities:

- search current public evidence using Codex hosted web search
- record search queries
- preserve source title, URL, checked date, and what each source supports
- identify repeated user pain and demand signals
- identify existing alternatives and competition
- identify plausible distribution angles
- distinguish monetization evidence from monetization hypotheses
- identify platform, privacy, legal, data-access, seasonality, and acquisition constraints when relevant
- expose evidence gaps instead of filling them with fabricated numbers
- output multiple opportunity spaces, not a single predetermined product

### organization:idea

Independent Idea Agent. It receives the structured market report but does not automatically trust every conclusion.

Responsibilities:

- inspect the market report for weak or contradictory evidence
- produce 3–5 concrete software-product candidates
- keep each candidate tied to source IDs from the market report
- define target user, problem, proposed solution, initial feature scope, differentiation, GTM angle, monetization hypotheses, complexity, and risks
- classify each candidate as `build`, `explore`, or `watch`
- recommend one candidate for Product Owner consideration without starting it automatically

## Runtime flow

```text
Market Discovery Tool
  ↓
Product Owner topic
  ↓
organization:data-marketing
  ↓
Codex hosted web search
  ↓
market.json + source evidence
  ↓
organization:idea
  ↓
ideas.json
  ↓
Market Discovery UI
  ↓
Product Owner selects a candidate
  ↓
normal Organization Project Intake
  ↓
team allocation
  ↓
team PM / Agent runtime
```

Runtime artifacts are written outside project repositories under:

```text
<workspace-root>/.luna-runtime/market-discovery/<discovery-id>/
```

Expected files:

- `market.schema.json`
- `market.json`
- `market.events.jsonl`
- `ideas.schema.json`
- `ideas.json`
- `ideas.events.jsonl`

The discovery is also persisted in Luna local state for recent-history display. A project repository does not exist at this stage, so organization-level discovery must not create Git branches, commits, PRs, issues, deployments, or accounts.

## Evidence requirements

Market Discovery must not claim more than its sources support.

At minimum:

- three public sources
- source IDs are unique
- every signal references one or more known source IDs
- every opportunity references one or more known source IDs
- every project idea references one or more known source IDs
- source URLs use HTTP or HTTPS
- external facts preserve a checked date

The following must not be invented when reliable evidence is unavailable:

- market size
- search volume
- MAU/DAU
- traffic
- revenue
- conversion rate
- CAC
- LTV
- retention
- growth rate
- competitor performance
- user-research results
- legal permission or API/data access

When a number or external condition cannot be verified, the report should record an evidence gap or a validation experiment.

## Product handoff

When the Product Owner selects an idea, Luna converts it into a Project Intake request containing:

- discovery ID and original topic
- selected product concept
- target user and problem
- proposed solution and core features
- differentiation hypothesis
- initial GTM angle
- known risks and validation needs
- exact market source references used by the idea
- market and Idea Agent rationale summaries

Downstream Project Intake and PM must independently recheck those claims. Market Discovery evidence is not a Product Owner guarantee and does not bypass technical, legal, data, security, or production validation.

## Product Owner gate

Luna does not automatically create the recommended idea merely because an Agent marks it `build`.

`build` means the current evidence is strong enough to justify Product Owner consideration. The Product Owner still chooses which candidate, if any, enters Project Intake.

This keeps market research and idea generation autonomous while preserving final product-direction authority for the human owner.
