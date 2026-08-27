# Luna Data & Marketing Agent

## Purpose

Every Luna delivery team has its own independent **Data & Marketing Agent**. The Agent is not a copywriter that invents launch copy after development; it studies the actual product, user workflow, release evidence, available analytics, and defensible external evidence to decide how the product should be positioned, measured, launched, and iterated.

The five teams remain equal-status peers. Marketing expertise may become an observed team strength only after completed-project evidence supports it. No team receives a predefined marketing specialty.

Luna also has an **organization-level Market Discovery pair** before a delivery team is selected:

- `organization:data-marketing` searches current public market evidence and identifies opportunity spaces.
- `organization:idea` independently turns defensible opportunities into concrete software-product candidates.

These organization-level workers do not belong to 장미/백합/튤립/해바라기/벚꽃 and therefore cannot bias team allocation. Selecting a candidate sends it through the normal Organization Project Intake and equal-team allocation flow.

## Pre-project Market Discovery

Market Discovery is optional and starts from a market/problem topic rather than an already-decided product requirement.

```text
Product Owner topic
  ↓
organization:data-marketing
  ↓
current public web evidence
  ↓
market signals / opportunities / gaps
  ↓
organization:idea
  ↓
3–5 project candidates
  ↓
Product Owner selection
  ↓
Organization Project Intake
  ↓
equal-team allocation
  ↓
team PM / normal project runtime
```

The market worker must search real public sources when Codex hosted web search is available. Every external claim used to support an opportunity must preserve a URL and checked date. Repeated pain, demand, alternatives, competition, distribution, monetization evidence/hypotheses, privacy/legal/platform constraints, data availability, and seasonality should be considered when relevant.

The Idea Agent receives the market report as evidence, not authority. It may reject weak opportunities, must cite the market source IDs it actually relies on, and must label candidates as `build`, `explore`, or `watch` instead of pretending every idea should immediately ship.

A `build` recommendation is not automatic project approval. Product Owner selection remains mandatory before the candidate enters Project Intake.

See [`MARKET_DISCOVERY.md`](./MARKET_DISCOVERY.md) for the Runtime contract and handoff details.

## Required project workflow

Every product plan receives a mandatory post-product chain:

```text
verified product work
  ↓
Data & Marketing Agent
  ↓
Documentation Agent
  ↓
Code Review Agent
  ↓
Reviewer Agent
  ↓
QA Agent
```

The Data & Marketing Agent and Documentation Agent are separate independent workers with separate Codex sessions and repository branches. They do not blindly accept each other's claims.

### 1. Data & Marketing Agent

The Data & Marketing Agent creates:

```text
docs/marketing/MARKETING_ANALYSIS.md
```

It should analyze, when applicable:

- primary user segments and jobs-to-be-done
- the problem and observable product value
- positioning and differentiation that the actual product can support
- acquisition-channel priorities and the reason for each priority
- SEO and content opportunities
- community, partnership, referral, or paid-channel hypotheses when justified
- activation, conversion, retention, and referral funnel definitions
- north-star and guardrail metrics
- analytics events required to measure those metrics
- launch experiments with success, stop, and follow-up criteria
- privacy, data-minimization, and retention considerations
- production blockers that make a marketing claim or experiment premature

If real product analytics do not exist yet, the Agent defines a measurement plan rather than fabricating results.

### 2. Documentation Agent

Documentation Agent reads the Data & Marketing PR as evidence, then independently checks it against the actual release repository and available verification results. It owns the final document:

```text
docs/marketing/GO_TO_MARKET.md
```

The final document must preserve the distinction between verified evidence and hypotheses. Documentation Agent removes unsupported claims, fixes product/document drift, records required external accounts or credentials without exposing secrets, and links the final strategy from the appropriate README or document index.

This split avoids two independent Agents editing the same marketing file before their PRs are integrated.

## Evidence rules

Marketing output must explicitly distinguish:

1. observed product/repository facts
2. actually measured first-party data
3. sourced external evidence
4. inference
5. experiment hypotheses

Market size, user counts, CTR, conversion rate, CAC, LTV, growth rate, retention, competitor performance, search volume, or similar figures must never be invented. External market or competitor evidence should record its source and date checked. When evidence is unavailable, say so and propose how to measure it.

Marketing measurement must follow data minimization. Sensitive or unnecessary personal data should not be collected merely because it could improve targeting.

## Git and review contract

Delivery-team Data & Marketing Agent is a repository-changing Agent and therefore gets its own worktree and branch:

```text
agent/<team>/data-marketing/<task>
```

It inspects the actual repository, creates the analysis document, commits with small English commits, pushes its branch, and opens its own PR to `develop`.

Organization-level Market Discovery occurs before a project repository exists, so it does not create branches, commits, PRs, repositories, issues, accounts, or deployments. Its auditable artifacts are stored under Luna Runtime state instead.

Documentation Agent then receives the delivery-team marketing PR as a dependency artifact and performs its own repository/document work in a separate branch. The downstream Code Review task depends on both PR-producing tasks so it can inspect both PRs. Reviewer and QA then verify product/marketing alignment, links, metrics, privacy assumptions, and unsupported claims before integration.

## Completion rule

A Luna project is not considered release-ready merely because application code passes. The marketing/documentation stage must either pass with evidence or remain explicitly blocked. Missing analytics, unavailable external accounts, or unverified market information are valid blockers or hypotheses; they are not permission to fabricate completion.
