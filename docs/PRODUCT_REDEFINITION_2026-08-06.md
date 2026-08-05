# Playground Product Redefinition

Date: 2026-08-06

This document resets the standard for every app in `Playground`. Treat each app as a product that could be shipped to real users, not as a one-off demo. New work must start from product definition, required inputs, technical choices, and verification.

## Operating Rule

When a user asks for a project, do not start by generating files. Start by defining:

- Target user and primary job-to-be-done
- MVP scope that is useful without hidden manual steps
- Required external inputs: API keys, accounts, real data, brand assets, legal copy, domain, OAuth setup
- Technical stack and why each part is needed
- Data model and persistence strategy
- Failure states, empty states, loading states, and permission states
- Local run command, build command, and deployment path
- Acceptance checklist before calling the task complete

If an input is missing, build only a clearly marked local/demo mode and document the production blocker. Do not pretend a missing API, database, account, model, or legal requirement exists.

## Standard Stack Policy

Default web app stack:

- React + TypeScript + Vite for small to medium client apps already matching this repo
- Express for shared server routes already present in this repo
- LocalStorage only for personal, single-device tools where data loss is acceptable
- Server persistence for any app involving accounts, cross-device use, collaboration, trading simulation history, study groups, notifications, or user-generated content that must survive browser clearing
- Chrome Manifest V3 for browser extensions
- .NET native messaging bridge only where Windows app automation is required

Avoid adding new frameworks until there is a real product reason. If a new app needs auth, database, realtime sync, payments, AI, or storage, define that dependency first and record what the user must provide.

## Quality Gates

Every shippable app must pass these gates:

- `npm run build` succeeds for the app or the app has a documented non-Node build command
- Main page opens without a blank screen
- Desktop and mobile layouts are usable
- Primary workflow can be completed from an empty state
- Data persistence behavior is explicit
- API failures and permission denials show useful UI
- No template README remains as the app README
- Deployment path is known and asset base paths work under `/apps/<id>/`
- Required secrets are listed in `.env.example` or the app README
- Known product gaps are documented instead of hidden

## Portfolio Map

### Tier 1: Core Products To Harden First

These apps have enough product direction to justify cleanup before expansion.

| App | Product Definition | Current Stack | Production Requirement | User Inputs Needed |
| --- | --- | --- | --- | --- |
| `study-planner` | Personal study operating system: timer, subjects, notes, statistics, daily progress. | React, TypeScript, Vite, LocalStorage, FSD-style structure. | Keep as flagship local-first app, then add optional account sync if cross-device use matters. | Subject presets, target audience, whether cloud sync is required. |
| `school-meal` | School dashboard for meals and timetable lookup. | React, TypeScript, Vite. | Needs reliable public data integration, school search, error handling, and region-specific API docs. | School name/region defaults, API key if required by data provider. |
| `mock-invest` | Practice trading simulator with watchlist, portfolio, orders, and learning flow. | React, TypeScript, Vite. | Needs market data source, server-side portfolio ledger, auth, and clear disclaimer. | Market universe, data provider/API key, starting cash rules, whether real-time data is required. |
| `dev-notes` | Product planning workspace for project overview, specs, API design, and user analysis. | React, TypeScript, Vite, internal API hooks. | Needs durable storage, export/import, project templates, and auth if shared. | Preferred templates, storage target, whether collaboration is needed. |
| `site-macro-extension` | User-controlled browser automation for repeated web actions. | Chrome MV3 extension, optional native bridge. | Needs safety policy, permission UX, audit logs, export/import, robust selector testing. | Target websites/actions, acceptable automation boundaries. |
| `webbridge` | Rule-based connector for websites without APIs. | Chrome MV3 extension. | Needs rule validation, secrets handling, webhook safety, test runner, and onboarding examples. | Target sites, webhook destinations, data schemas. |
| `voice-studio` | Browser voice utility for mic effects, pitch tools, singing mode, and TTS workflows. | React, TypeScript, Vite, browser audio APIs. | Needs actual audio pipeline validation, permission states, latency handling, presets, and extension integration. | Desired voice effects, TTS provider/API keys if cloud voices are needed. |
| `virtual-study-room` | Shared online study room with camera, screen sharing, timers, and ambient controls. | React, TypeScript, Vite. | Needs realtime backend, auth, room lifecycle, moderation, media permission UX. | Realtime provider, login policy, room privacy model. |

### Tier 2: Useful Utilities To Consolidate

These can be good products, but should be merged into coherent suites or hardened after Tier 1.

| App | Product Definition | Current Stack | Rework Direction |
| --- | --- | --- | --- |
| `todo` | Minimal daily task board. | React, TypeScript, Vite, local state/persistence. | Merge into `study-planner` or position as a fast standalone task tool. |
| `day-schedule` | Time-block planner for one day. | React, TypeScript, Vite. | Merge with `study-planner` calendar/timer or define a distinct time-blocking product. |
| `cornell-notes` | Structured Cornell note editor. | React, TypeScript, Vite, react-markdown. | Merge into study suite or support export, templates, and search. |
| `coding-log` | Coding practice journal for Baekjoon/Programmers. | React, TypeScript, Vite, auth/storage utilities. | Connect to problem sources or make manual logging excellent. |
| `code-run-visualizer` | Step-by-step code execution visualizer. | React, TypeScript, Vite. | Needs a real parser/interpreter strategy; otherwise constrain to educational pseudocode. |
| `focus-room` | Immersive 360-degree study environment. | React, TypeScript, Vite, Three.js. | Needs verified panorama assets, mobile performance, and accessible fallback. |
| `virtual-avatar` | Camera-driven avatar and expression controller. | React, TypeScript, Vite. | Needs face tracking library, model assets, calibration, and streaming/export story. |
| `life-tracker` | Personal reflection tracker for failures, wasted time, and small wins. | React, TypeScript, Vite. | Decide whether this is private journal, analytics tool, or part of broader life dashboard. |
| `commute-alarm` | Location-based transit arrival alarm. | React, TypeScript, Vite. | Needs geolocation background constraints, transit data, notification reliability, mobile-first UX. |
| `voice-phishing` | Training simulator for voice-phishing awareness. | React, TypeScript, Vite. | Needs scenario content, safety framing, localization, and clear educational outcomes. |
| `action-notifier` | GitHub Actions completion notification client. | React, TypeScript, Vite, server push dependency. | Needs GitHub auth, repo selection, webhook/polling design, push subscription reliability. |
| `dev-action-hub` | Developer operations dashboard for notes, GitHub Actions, and notifications. | React, TypeScript, Vite. | Merge with `dev-notes` and `action-notifier`, or make it the dev suite shell. |
| `dev-term-roulette` | Developer terminology learning game. | React, TypeScript, Vite. | Needs content database, spaced repetition, difficulty levels, and progress tracking. |
| `idea-mixer` | Product/content idea generator from word combinations. | React, TypeScript, Vite. | Needs better prompt/data engine, save/share, and evaluation flow. |

### Tier 3: Companion Extensions And Bridges

These should not be treated as isolated products unless their host web app is stable.

| App | Role | Current State | Rework Direction |
| --- | --- | --- | --- |
| `school-meal-extension` | Opens school meal web app from Chrome. | Static Chrome extension with README. | Keep only if `school-meal` is stable and hosted. |
| `mock-invest-extension` | Portfolio/watchlist popup for `mock-invest`. | Static Chrome extension with README. | Requires authenticated backend from `mock-invest`. |
| `voice-studio-extension` | Launcher for `voice-studio`. | Static Chrome extension with README. | Keep as launcher after voice permissions and hosted URL are stable. |
| `focustime-extension` | Tracks website usage and limits. | Chrome extension plus local tracker docs. | Could become standalone productivity product; needs privacy-first onboarding and data controls. |
| `focustime-tracker` | Windows local tracker executable/source. | Native executable and C# source. | Pair with `focustime-extension`; document build and trust model. |
| `site-macro-native-bridge` | Windows native messaging host for `site-macro-extension`. | .NET bridge with scripts. | Keep as advanced optional component with explicit install and safety checks. |

### Tier 4: Coming Soon Ideas

The portal includes placeholder ideas such as habit tracker, reading log, budget, workout log, diary, goal manager, link vault, recipe notes, retrospectives, mood diary, and travel log. These must not be implemented as shallow clones. Before building any of them, define whether they belong inside an existing suite or deserve a standalone product.

## Product Suites

To reduce random app sprawl, future work should organize around suites:

- Study Suite: `study-planner`, `todo`, `day-schedule`, `cornell-notes`, `coding-log`, `focus-room`, `virtual-study-room`
- Developer Suite: `dev-notes`, `dev-action-hub`, `action-notifier`, `code-run-visualizer`, `dev-term-roulette`, `idea-mixer`
- Automation Suite: `site-macro-extension`, `site-macro-native-bridge`, `webbridge`
- Life Utility Suite: `school-meal`, `commute-alarm`, `life-tracker`, `focustime-extension`
- Voice/Avatar Suite: `voice-studio`, `voice-studio-extension`, `virtual-avatar`, `voice-phishing`
- Finance/Security Suite: `mock-invest`, `mock-invest-extension`, `voice-phishing`

Suites are planning boundaries, not mandatory UI merges. Merge only where it improves the user workflow.

## New Project Intake Template

Use this before creating files:

```md
## Product Definition
- User:
- Problem:
- MVP workflow:
- Non-goals:

## Proposed Stack
- Frontend:
- Backend:
- Persistence:
- Auth:
- External APIs:
- Deployment:

## Required Inputs
- From user:
- From environment:
- Can be stubbed locally:

## Build Plan
- Data model:
- Screens:
- Primary workflows:
- Error/empty/loading states:
- Verification:

## Production Blockers
- Blocker:
- Temporary local behavior:
```

## Immediate Cleanup Backlog

1. Replace template READMEs in `life-tracker`, `dev-notes`, and other Vite-generated apps with product READMEs.
2. Add a per-app `PRODUCT.md` for Tier 1 apps before changing features.
3. Normalize Vite/React/TypeScript versions; the repo currently mixes Vite 6/8, TypeScript 5.7/6.0, and React 19.0/19.2.
4. Separate web apps, extensions, and native tools in root scripts so `build:apps` reflects actual product groups.
5. Add a machine-readable app registry with status: `prototype`, `local-ready`, `beta`, `production-candidate`, `deprecated`.
6. Verify every active portal URL under `/apps/<id>/` after build.
7. Document every API route used by apps in `server/index.js`.
8. Decide which apps need real backend persistence and stop relying on LocalStorage for collaborative/account-based products.

## Verification Snapshot

Checked on 2026-08-06:

- `npm run build`: passed for the root portal.
- `npm run build:apps`: passed for the 20 Node/Vite apps included in the root script.
- `docs/app-registry.json`: valid JSON.

This does not mean the products are market-ready. It only proves the current scripted builds complete. Remaining verification requires local run checks, browser QA, mobile layout checks, extension install checks, API failure checks, and hosted `/apps/<id>/` asset-path checks.
