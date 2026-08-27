# Beriday MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent, production-deployable Beriday web app that lets a user select a Korean administrative area and see source-backed household-waste schedules for Today, Weekly, and item disposal search without GPS, login, payment, or waste collection/intermediation.

**Architecture:** A React + TypeScript + Vite client consumes a versioned normalized JSON artifact produced by a Node/TypeScript importer from the official LocalData household-waste dataset. Pure domain modules own parsing, normalization, schedule evaluation, conflict handling, item-to-category joins, and provenance; UI routes only compose those outputs. MVP persistence is browser-local and no server/database is introduced.

**Tech Stack:** pnpm, React 19, TypeScript, Vite, React Router, Vitest, Testing Library, Playwright, `csv-parse`, `tsx`, ESLint.

**Spec:** `docs/superpowers/specs/2026-08-27-beriday-design.md`

## Global Constraints

- Independent repository target: `sunwoo162/beriday`; do not add Beriday product code to BloomBouquet/Playground.
- Working product name `버리데이 (Beriday)` must remain provisional until pre-release trademark/name review.
- MVP uses no GPS/geolocation, detailed home address, server-side location history, separate email/password auth, payment, waste collection, carrier/intermediary assignment, or advertising push.
- Primary schedule source: 행정안전부 생활쓰레기배출정보 via the official LocalData download URL `https://file.localdata.go.kr/file/household_waste_info/info` and source page metadata from data.go.kr.
- Schedule decisions must preserve source provenance and return `needs-verification` rather than fabricate certainty for incomplete/conflicting rules.
- Local schedule calculation uses `Asia/Seoul` semantics and correctly handles windows crossing midnight.
- Repository-writing Agent branches follow `agent/cherry-blossom/<role>/<task>` and use English commit messages.
- Tests are written first for behavior changes; every production module task follows Red → Green → Refactor.

---

## File Structure

```text
beriday/
├─ .github/workflows/ci.yml
├─ data/
│  ├─ raw/.gitkeep
│  ├─ fixtures/household-waste.sample.csv
│  ├─ normalized/regions.json
│  └─ normalized/validation-report.json
├─ scripts/
│  ├─ fetch-source.ts
│  ├─ normalize-source.ts
│  └─ lib/source-schema.ts
├─ src/
│  ├─ app/router.tsx
│  ├─ domain/waste/types.ts
│  ├─ domain/waste/parse.ts
│  ├─ domain/waste/normalize.ts
│  ├─ domain/schedule/evaluateSchedule.ts
│  ├─ domain/schedule/nextAvailable.ts
│  ├─ domain/items/items.ts
│  ├─ domain/items/searchItems.ts
│  ├─ data/loadDataset.ts
│  ├─ storage/savedRegion.ts
│  ├─ features/region/RegionSetupPage.tsx
│  ├─ features/today/TodayPage.tsx
│  ├─ features/weekly/WeeklyPage.tsx
│  ├─ features/search/ItemSearchPage.tsx
│  ├─ features/settings/SettingsPage.tsx
│  ├─ components/ProvenanceDetails.tsx
│  ├─ components/AppShell.tsx
│  └─ main.tsx
├─ tests/
│  ├─ unit/parse.test.ts
│  ├─ unit/normalize.test.ts
│  ├─ unit/evaluateSchedule.test.ts
│  ├─ unit/searchItems.test.ts
│  ├─ unit/savedRegion.test.ts
│  ├─ integration/source-to-today.test.ts
│  └─ ui/region-today.test.tsx
├─ e2e/critical-flow.spec.ts
├─ PRODUCT.md
├─ README.md
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
└─ playwright.config.ts
```

### Task 1: Repository Bootstrap and Quality Baseline

**Owner:** PM + DevOps

**Files:** create the repository root, `package.json`, Vite/TS files, `README.md`, `PRODUCT.md`, `.gitignore`, `.github/workflows/ci.yml`.

**Interfaces:** Produces `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm test:e2e`, `pnpm data:normalize`, and the directory contract used by all later tasks.

- [ ] Create an isolated local workspace outside Playground, initialize Git, then create/push `sunwoo162/beriday` with default branch `main`.
- [ ] Scaffold React + TypeScript with Vite and install runtime `react-router-dom`; install dev dependencies `vitest @testing-library/react @testing-library/jest-dom jsdom @playwright/test tsx csv-parse eslint`.
- [ ] Define scripts exactly: `dev=vite`, `build=tsc -b && vite build`, `test=vitest run`, `test:watch=vitest`, `lint=eslint .`, `test:e2e=playwright test`, `data:fetch=tsx scripts/fetch-source.ts`, `data:normalize=tsx scripts/normalize-source.ts`.
- [ ] Add a smoke test `src/app/App.test.tsx` asserting the application heading `오늘 뭐 버리지?` renders; run it before creating `App.tsx` and verify RED because the component/export does not exist.
- [ ] Implement the minimal App shell and verify the smoke test passes.
- [ ] Add CI that runs `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm build`, then Playwright after browser install.
- [ ] Commit with `chore: bootstrap Beriday web app` and push `main` only for initial repository bootstrap; all subsequent feature work uses Agent branches.

### Task 2: Canonical Data Contract and Source Normalizer

**Owner:** Data/API Integration

**Files:** create `src/domain/waste/types.ts`, `scripts/lib/source-schema.ts`, `src/domain/waste/parse.ts`, `src/domain/waste/normalize.ts`, `tests/unit/parse.test.ts`, `tests/unit/normalize.test.ts`, fixture CSV, `scripts/normalize-source.ts`.

**Interfaces:**
- Produces `Region`, `CollectionRule`, `RuleProvenance`, `TimeWindow`, `WasteCategory` from the approved spec.
- Produces `normalizeRows(rows: RawWasteRow[], importedAt: string): { regions: Region[]; rules: CollectionRule[]; report: ValidationReport }`.
- `ValidationReport = { totalRows:number; acceptedRows:number; rejectedRows:number; ambiguousRows:number; regionsCovered:number; importedAt:string; errors:Array<{row:number;code:string;message:string}> }`.

- [ ] Write failing parser tests for weekday tokens (`월`, `월요일`, `매일`, mixed comma/slash delimiters), empty weekday, `20:00~02:00`, `18시 이후`, malformed time, and missing region key.
- [ ] Run `pnpm vitest run tests/unit/parse.test.ts` and verify failures are caused by missing parser functions.
- [ ] Implement `parseWeekdays(raw:string): number[] | null`, `parseTimeWindows(raw:string): TimeWindow[] | null`, and `makeRegionId(sido,sigungu,areaName): string` with deterministic normalization.
- [ ] Write failing normalizer tests proving malformed rows are rejected, parseable rows preserve instructions/provenance, and conflicting same-region/category source rows become `confidence:"ambiguous"` instead of silently overwriting.
- [ ] Implement `normalizeRows` minimally until tests pass.
- [ ] Add a small UTF-8 CSV fixture with at least three different municipalities and one intentionally malformed/conflicting row; fixture values must be labeled test data and not represented as live production truth.
- [ ] Implement `scripts/normalize-source.ts --input <csv> --output-dir data/normalized` to parse with `csv-parse/sync`, write `regions.json` plus `validation-report.json`, and exit non-zero only for critical schema errors; ambiguous source data remains representable.
- [ ] Commit `feat: add waste data normalization pipeline`.

### Task 3: Official Dataset Fetch and Provenance Artifact

**Owner:** API Integration + Security

**Files:** create `scripts/fetch-source.ts`, modify `PRODUCT.md`, `.gitignore`, CI data-validation step.

**Interfaces:** Produces `data/raw/household-waste.csv` plus `data/raw/source-metadata.json` with `{ sourceUrl, sourcePageUrl, fetchedAt, contentType, sha256 }`.

- [ ] Write a failing test around a pure helper `validateSourceResponse({status,contentType,byteLength})` proving non-2xx, HTML error pages, and implausibly tiny payloads are rejected.
- [ ] Implement the helper and fetch script using only the allowed official HTTPS source URL.
- [ ] Compute SHA-256 with Node `crypto` and store metadata next to the raw file; raw downloaded data remains gitignored while normalized versioned artifacts and reports are committed.
- [ ] Execute the real official download once; inspect status/content type and confirm the saved payload is parseable. If the provider changes the download shape, adapt only the fetch adapter and preserve the canonical normalizer contract.
- [ ] Run normalization on the actual fetched source and record row counts/ambiguous/rejected counts in `PRODUCT.md` as dated verification evidence, never as permanent hard-coded assumptions.
- [ ] Add CI `pnpm data:normalize -- --input data/fixtures/household-waste.sample.csv` so PRs always validate parser behavior without external-network dependency.
- [ ] Commit `feat: ingest official household waste dataset`.

### Task 4: Schedule Engine

**Owner:** Backend/Domain + Test Automation

**Files:** create `src/domain/schedule/evaluateSchedule.ts`, `src/domain/schedule/nextAvailable.ts`, `tests/unit/evaluateSchedule.test.ts`.

**Interfaces:** Implement the spec signature `evaluateSchedule(rules: CollectionRule[], now: Date): ScheduleResult[]` and `findNextAvailable(ruleSet: CollectionRule[], now: Date, maxDays?: number): string | null`.

- [ ] RED: test a normal same-day window: Monday 19:00 rule evaluated at 19:30 returns `available`.
- [ ] GREEN: implement only same-day matching and verify pass.
- [ ] RED: test future same-day window returns `upcoming`; implement and verify.
- [ ] RED: test `20:00-02:00` at Tuesday 01:00 is still Monday's active collection window; implement cross-midnight ownership and verify.
- [ ] RED: test excluded date overrides weekday and returns no false `available`; implement and verify.
- [ ] RED: test after closing returns `closed` plus the next valid occurrence; implement bounded next-date scanning for 14 days by default and verify.
- [ ] RED: test conflicting/ambiguous rules return `needs-verification`; implement without guessing a winner.
- [ ] Use `Intl.DateTimeFormat`/explicit Korea date-part conversion helper so host machine timezone cannot silently change weekday evaluation.
- [ ] Run all unit tests and commit `feat: implement waste schedule engine`.

### Task 5: Dataset Loader and Saved Region Persistence

**Owner:** Frontend 1

**Files:** create `src/data/loadDataset.ts`, `src/storage/savedRegion.ts`, `tests/unit/savedRegion.test.ts`.

**Interfaces:** `loadDataset(): Promise<NormalizedDataset>`, `getSavedRegion(validRegionIds:Set<string>): SavedRegion | null`, `saveRegion(regionId:string, validRegionIds:Set<string>): SavedRegion`, `clearSavedRegion(): void`.

- [ ] RED: invalid/corrupt LocalStorage JSON returns null and is removed; valid known RegionId is returned.
- [ ] GREEN: implement storage validation under key `beriday:saved-region:v1`.
- [ ] RED: unknown RegionId is rejected even if JSON shape is valid; implement set membership validation.
- [ ] Implement lazy loading of normalized JSON and derived indices `regionsBySido`, `regionsBySigungu`, `rulesByRegionId` once per app session.
- [ ] Add a dataset error type that distinguishes asset-load failure from `region has no rules`.
- [ ] Commit `feat: add local region persistence and dataset loader`.

### Task 6: Region Setup and Today Page

**Owner:** Frontend 2 + Accessibility

**Files:** create `RegionSetupPage.tsx`, `TodayPage.tsx`, `AppShell.tsx`, `router.tsx`, `ProvenanceDetails.tsx`, UI tests and CSS modules/global styles.

**Interfaces:** Region setup writes only `SavedRegion`; Today calls `evaluateSchedule(rulesByRegionId[selected], new Date())` and never re-parses source strings.

- [ ] RED UI test: first visit with no saved region shows three labeled region selects and disables later levels until the parent level is selected.
- [ ] Implement cascading `시/도 → 시/군/구 → 관리구역` selection with keyboard-native `<select>` controls and data-availability text.
- [ ] RED UI test: saving a valid region navigates to `/today` and persisted region survives remount.
- [ ] Implement route guard that redirects missing/invalid saved region to `/setup`.
- [ ] RED UI test: Today renders status text, time window, next collection time, and `확인 필요` for ambiguous rules without relying on color.
- [ ] Implement three primary cards for general/food/recycling plus source disclosure via `ProvenanceDetails`.
- [ ] Add empty/data-error states and official authority/contact fallback.
- [ ] Run axe-compatible semantic assertions available through Testing Library plus keyboard flow test; commit `feat: add region setup and today experience`.

### Task 7: Weekly Schedule and Item Search

**Owner:** Frontend 3 + UX Research

**Files:** create `WeeklyPage.tsx`, `src/domain/items/items.ts`, `searchItems.ts`, `ItemSearchPage.tsx`, tests.

**Interfaces:** `searchItems(query:string): DisposalItem[]`; item results map to `WasteCategory` then reuse the same region schedule engine.

- [ ] RED: aliases such as `후라이팬`/`프라이팬` match the same item and empty query returns no result set.
- [ ] Implement a small source-backed MVP item catalog with explicit `sourceName/sourceUrl`; do not infer unknown items with AI.
- [ ] RED UI test: item result shows `버리는 방법` and separate `우리 동네 일정` sections so guidance and local schedule cannot be confused.
- [ ] Implement item search with normalized Korean whitespace/case handling and accessible result announcements.
- [ ] RED UI test: Weekly renders seven date columns/sections derived by calling the schedule engine for each date, not a duplicated weekday rule renderer.
- [ ] Implement responsive mobile list + desktop week grid while preserving DOM reading order.
- [ ] For category `bulk`, render only verified municipality official link when present; otherwise render authority contact, never a guessed URL.
- [ ] Commit `feat: add weekly schedule and disposal item search`.

### Task 8: Settings, Safety Hardening, Performance, and Accessibility

**Owner:** Security + Performance + Accessibility

**Files:** create `SettingsPage.tsx`, security URL helper/tests, update styling and build configuration.

**Interfaces:** `isAllowedOfficialUrl(value:string): boolean` accepts only HTTPS and a curated government/public authority hostname policy used by dataset fields.

- [ ] RED security tests: reject `javascript:`, `data:`, plain HTTP, credential-bearing URLs, and deceptive subdomains; accept verified HTTPS authority URLs.
- [ ] Implement safe external link rendering with `target="_blank" rel="noopener noreferrer"` only after validation.
- [ ] Add Settings actions for region change, local data reset, data/source information, and explicit statement that GPS/account/payment/collection are not used in MVP.
- [ ] Run production build and record JS/data artifact sizes in `PRODUCT.md`; if the normalized dataset materially dominates first-load size, split assets by top-level region without adding a backend.
- [ ] Verify focus-visible, heading hierarchy, form labels, error association, 44px-equivalent touch targets where practical, and non-color status semantics.
- [ ] Add automated accessibility smoke using `@axe-core/playwright` if dependency impact is acceptable; otherwise document Playwright keyboard/semantic checks and add the package deliberately in this task.
- [ ] Commit `fix: harden Beriday privacy accessibility and performance`.

### Task 9: Critical E2E, CI Gate, and Production Documentation

**Owner:** Test Automation + QA + Documentation + DevOps

**Files:** create `e2e/critical-flow.spec.ts`, update CI, `README.md`, `PRODUCT.md`, add `docs/DATA_SOURCES.md` and `docs/LEGAL_BOUNDARY.md`.

**Interfaces:** E2E must prove the exact approved workflow: first visit → select region → Today → search item → Weekly → reload → saved region remains.

- [ ] Write the Playwright critical-flow test first against the fixture-backed test build and verify it fails before all selectors/routes are wired.
- [ ] Complete only missing UI wiring needed for the E2E and re-run until green.
- [ ] Add explicit E2E assertions for `확인 필요`, missing-region, and invalid external-link states.
- [ ] Run `pnpm lint && pnpm test && pnpm build && pnpm test:e2e` from a clean install.
- [ ] Document actual official source URL, fetch timestamp model, normalized artifact generation, local run/build commands, known data limitations, and exact production blockers.
- [ ] Document legal product boundary: information service only; no collection/transport/processing/intermediation/payment/GPS/detailed-address processing in MVP; state that release-time legal/licence/trademark review remains required.
- [ ] Create a draft deployment target, run public smoke once deployed, then register a versioned submission in BloomBouquet only after URL smoke passes.
- [ ] Commit `test: add Beriday production quality gates`.

### Task 10: Independent Review and Release Gate

**Owner:** Code Review 1/2 + Reviewer + QA 1/2 + User A/B + Process Evaluator

**Files:** no product code unless defects are routed back to owning Agent; review evidence belongs in PR reviews/issues and verified docs.

- [ ] Code Review independently inspects data parser, schedule math, URL handling, LocalStorage validation, route states, tests, accessibility, and bundle/data loading; it must cite concrete files/diffs.
- [ ] Reviewer checks every MVP requirement and every explicit non-goal against the built product; any scope creep is a defect, not a bonus.
- [ ] QA runs clean-install commands and the critical browser workflow on desktop and mobile viewports; do not accept developer self-report as evidence.
- [ ] User A validates first-use comprehension within the product flow; User B validates repeat-use speed after saved-region reload.
- [ ] Data & Marketing verifies public copy never claims nationwide correctness where source coverage is missing/ambiguous and prepares only source-backed SEO/launch hypotheses.
- [ ] Process Evaluator aggregates independent evidence only after required review/QA reports exist.
- [ ] Merge only with all required checks green and no unresolved high/critical finding; then tag the first submission version and submit to BloomBouquet.

## Task DAG

```text
T1 Bootstrap
 ├─> T2 Normalize ─> T3 Official Fetch
 │                 └─> T4 Schedule Engine ─┐
 └────────────────> T5 Dataset/Persistence ├─> T6 Setup + Today ─┬─> T7 Weekly/Search
                                            │                    └─> T8 Hardening
                                            └────────────────────────> T9 E2E/Docs
T7 + T8 + T9 ────────────────────────────────────────────────────> T10 Independent Review
```

Parallelism after bootstrap: T2 and T5 may start independently; T4 starts after canonical types are stable; visual polish must not outrun T4/T5 domain correctness.

## Plan Self-Review

- Spec coverage: region setup, Today, Weekly, item search, provenance, ambiguity, offline/local persistence, accessibility, performance, security, production blockers, legal boundary, and BloomBouquet submission are mapped to concrete tasks.
- Explicit non-goals remain excluded; scheduled Web Push is not reintroduced.
- Type/interface names match the approved spec, with only `ValidationReport` and loader/storage helpers added as implementation interfaces.
- No production task depends on unverified market metrics.
- Official network access is isolated to data refresh; CI remains deterministic using committed fixtures.
