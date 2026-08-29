# BloomBouquet Project Showcase Design Transplant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Premium Bento BloomBouquet presentation with the uploaded editorial Project Showcase visual system while keeping all existing BloomBouquet APIs, Bouquet auth, Luna handoff, evaluator, and deployment contracts unchanged.

**Architecture:** Keep `BloomApp.tsx` as the query-string router, split public views into Showcase, Project Detail, and Evaluation Report components, and reuse the current real public APIs. Rework `BouquetUI.tsx` and Bloom CSS into a thin-border, white, restrained-green editorial system, then migrate Auth, Luna registration, and Owner Console onto the same primitives without changing behavior.

**Tech Stack:** React 18, TypeScript, Vite, plain CSS, Node policy tests, Spring Boot backend APIs (unchanged), GitHub Actions Harness.

**Spec:** `docs/superpowers/specs/2026-08-29-bloombouquet-showcase-design-transplant-design.md`

## Global Constraints

- Do not add Tailwind to `bloom-web`.
- Do not change backend schema or public API contracts unless a concrete mismatch is discovered; stop before any such API change.
- Do not add third-party screenshot/image fetches or mock thumbnail URLs.
- Do not fabricate tags, technology stacks, category scores, grades, strengths, or improvements absent from real APIs.
- Public Showcase must not expose `?mode=manage` or `?mode=auth` entry CTAs.
- Preserve `?mode=auth`, `?mode=manage`, `?mode=manage&luna=<handoff>`, and `?mode=builder` behavior.
- Public navigation uses `/?project=<projectId>` and `/?project=<projectId>&report=<evaluationRunId>`.
- Preserve Bouquet cookie auth, bounded Luna handoff, Team/Project/Submission fallback management, OAuth, and EvaluationRun behavior.
- Keep `:focus-visible`, `prefers-reduced-motion`, keyboard accessibility, and responsive behavior.
- Git commit messages are English.

---

### Task 1: Lock the new public information architecture with RED policy tests

**Files:**
- Modify: `scripts/bloom-management.policy-test.js`
- Test: `scripts/bloom-management.policy-test.js`

**Interfaces:**
- Consumes: current `BloomApp.tsx`, `BouquetShowcaseApp.tsx`, owner/auth/Luna source files.
- Produces: policy assertions that require `BouquetProjectDetailApp.tsx`, `BouquetEvaluationReportApp.tsx`, public query routing, real public API calls, no mock image URLs, and no public owner/auth links.

- [ ] **Step 1: Add failing public-view policy tests**

Add paths and assertions equivalent to:

```js
const detailPath = 'bloom-web/src/app/BouquetProjectDetailApp.tsx';
const reportPath = 'bloom-web/src/app/BouquetEvaluationReportApp.tsx';

const detail = fs.existsSync(detailPath) ? source(detailPath) : '';
const report = fs.existsSync(reportPath) ? source(reportPath) : '';

assert.match(app, /searchParams\.get\(['"]project['"]\)/);
assert.match(app, /searchParams\.get\(['"]report['"]\)/);
assert.match(app, /<BouquetProjectDetailApp/);
assert.match(app, /<BouquetEvaluationReportApp/);
assert.match(showcase, /teamFilter/);
assert.match(showcase, /sortMode/);
assert.match(detail, /\/api\/bloom-bouquet\/public\/projects\/\$\{projectId\}/);
assert.match(report, /\/api\/bloom-bouquet\/public\/evaluations\/\$\{runId\}/);
assert.doesNotMatch(showcase, /unsplash|images\.unsplash|picsum/i);
assert.doesNotMatch(showcase, /\?mode=manage|\?mode=auth/);
```

Also assert the reference-only Bento contract is removed from the final Showcase:

```js
assert.doesNotMatch(showcase, /cardSize\(/);
assert.doesNotMatch(showcase, /bouquet-bento-grid/);
```

- [ ] **Step 2: Run production runtime policy tests to verify RED**

Run: `pnpm run test:production-runtime`

Expected: FAIL because detail/report files and public query routing do not exist yet and Showcase still contains Bento-specific structure.

- [ ] **Step 3: Commit the RED test contract**

```bash
git add scripts/bloom-management.policy-test.js
git commit -m "test: define BloomBouquet editorial showcase contract"
```

### Task 2: Replace shared Premium Bento primitives with the editorial design system

**Files:**
- Modify: `bloom-web/src/app/BouquetUI.tsx`
- Modify: `bloom-web/src/app/bouquet-system.css`
- Test: `scripts/bloom-management.policy-test.js`

**Interfaces:**
- Consumes: existing `BouquetWordmark`, `Surface`, `StatusBadge`, `ScoreBadge`, `PrimaryButton`, `SecondaryButton`, `Field`, `EmptyState`, `ProjectVisual` exports.
- Produces: the same stable exports with square/minimally rounded styling so existing screens keep compiling while later tasks migrate structure.

- [ ] **Step 1: Extend policy assertions for the visual-system invariants**

Assert `bouquet-system.css` contains the new neutral/green tokens and retains accessibility rules:

```js
assert.match(systemCss, /--bouquet-bg:\s*#fff/i);
assert.match(systemCss, /--bouquet-accent:\s*#2d5a3d/i);
assert.match(systemCss, /--bouquet-line:\s*#dfe0e2/i);
assert.match(systemCss, /:focus-visible/);
assert.match(systemCss, /prefers-reduced-motion/);
assert.doesNotMatch(systemCss, /--bouquet-radius-xl:\s*40px/);
```

- [ ] **Step 2: Run the policy test and verify the token assertions fail**

Run: `pnpm run test:production-runtime`

Expected: FAIL on old beige/purple Premium Bento tokens.

- [ ] **Step 3: Rework `BouquetUI.tsx` without changing export names**

Keep action and field behavior intact. Redesign `ProjectVisual` as a deterministic 16:10 editorial preview using only project/team/status text and CSS decoration. Remove featured-specific large Bento behavior. Keep `Surface` forwarding DOM/ARIA props.

Target `ProjectVisual` shape:

```tsx
export function ProjectVisual({ name, teamName, status }: {
  name: string
  teamName: string
  status: string | null
}) {
  return (
    <div className="bouquet-project-visual" aria-hidden="true">
      <div className="bouquet-project-visual-grid" />
      <div className="bouquet-project-visual-index">BLOOM / {teamName}</div>
      <div className="bouquet-project-visual-copy">
        <small>{status ? status.replace(/_/g, ' ') : 'CURATED BUILD'}</small>
        <strong>{name}</strong>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Replace the shared CSS tokens and primitive styling**

Use exact core values:

```css
:root {
  --bouquet-bg: #fff;
  --bouquet-surface: #fff;
  --bouquet-surface-soft: #f7f7f6;
  --bouquet-surface-strong: #171719;
  --bouquet-ink: #171719;
  --bouquet-muted: #6b6b6e;
  --bouquet-subtle: #979799;
  --bouquet-line: #dfe0e2;
  --bouquet-accent: #2d5a3d;
  --bouquet-accent-soft: #edf4ef;
  --bouquet-radius-sm: 2px;
  --bouquet-radius-md: 4px;
  --bouquet-radius-lg: 6px;
  --bouquet-content: 1320px;
}
```

Make `.bouquet-surface` thin-border/no-shadow, `.bouquet-action` rectangular, fields square neutral, and `.bouquet-project-visual` `aspect-ratio: 16 / 10`.

- [ ] **Step 5: Run web build and runtime policy tests**

Run: `pnpm run build:bloom-web && pnpm run test:production-runtime`

Expected: build succeeds; Task 2 token assertions pass while Task 1 public-view assertions remain RED.

- [ ] **Step 6: Commit shared design system**

```bash
git add bloom-web/src/app/BouquetUI.tsx bloom-web/src/app/bouquet-system.css scripts/bloom-management.policy-test.js
git commit -m "feat: add BloomBouquet editorial design system"
```

### Task 3: Rebuild Showcase and top-level public routing

**Files:**
- Modify: `bloom-web/src/app/BloomApp.tsx`
- Modify: `bloom-web/src/app/BouquetShowcaseApp.tsx`
- Modify: `bloom-web/src/app/bouquet-showcase.css`
- Test: `scripts/bloom-management.policy-test.js`

**Interfaces:**
- Consumes: `GET /api/bloom-bouquet/public/projects`, shared UI primitives.
- Produces: `BouquetShowcaseApp`, query-param parsing in `BloomApp`, local `teamFilter` and `sortMode` states, navigation to `/?project=<id>`.

- [ ] **Step 1: Add/confirm RED assertions for Showcase gallery and public routing**

Require literal source concepts:

```js
assert.match(showcase, /const \[teamFilter, setTeamFilter\]/);
assert.match(showcase, /const \[sortMode, setSortMode\]/);
assert.match(showcase, /window\.location\.href\s*=\s*`\/\?project=\$\{project\.id\}`/);
assert.match(showcaseCss, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
```

- [ ] **Step 2: Run policy test and verify Showcase assertions fail**

Run: `pnpm run test:production-runtime`

Expected: FAIL on old Bento implementation.

- [ ] **Step 3: Rewrite `BouquetShowcaseApp.tsx` as an editorial gallery**

Keep existing `Project`/`Submission` real-data types. Remove report modal state and `cardSize`. Add:

```tsx
type SortMode = 'newest' | 'score'
const [teamFilter, setTeamFilter] = useState('ALL')
const [sortMode, setSortMode] = useState<SortMode>('newest')

const visibleProjects = useMemo(() => {
  const filtered = teamFilter === 'ALL'
    ? projects
    : projects.filter((project) => project.teamName === teamFilter)
  return [...filtered].sort((a, b) => sortMode === 'score'
    ? (b.latestSubmission?.overallScore ?? -1) - (a.latestSubmission?.overallScore ?? -1)
    : Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}, [projects, teamFilter, sortMode])
```

Cards render `ProjectVisual`, team, score/status, name, description, version/auth metadata and navigate to detail. Keep Live Demo only as a secondary link that does not become the card's primary interaction.

- [ ] **Step 4: Update `BloomApp.tsx` public query parsing**

Parse validated positive integers:

```tsx
const publicProjectId = parsePositiveId(searchParams.get('project'))
const publicReportId = parsePositiveId(searchParams.get('report'))
```

For now, keep Showcase fallback until Tasks 4/5 add components. Existing `mode` branches continue to take precedence over public query params.

- [ ] **Step 5: Rewrite `bouquet-showcase.css`**

Implement 1320px editorial header/hero, compact filter bar, 3-column gallery, 16:10 visuals, 2-column tablet and 1-column mobile. Remove `.bouquet-bento-grid`, `.bouquet-project-featured`, `.is-wide`, `.is-tall` contracts.

- [ ] **Step 6: Run build and policy tests**

Run: `pnpm run build:bloom-web && pnpm run test:production-runtime`

Expected: Showcase-specific assertions pass; detail/report-file assertions remain RED.

- [ ] **Step 7: Commit Showcase migration**

```bash
git add bloom-web/src/app/BloomApp.tsx bloom-web/src/app/BouquetShowcaseApp.tsx bloom-web/src/app/bouquet-showcase.css scripts/bloom-management.policy-test.js
git commit -m "feat: rebuild BloomBouquet showcase as editorial gallery"
```

### Task 4: Add real public Project Detail with Submission history

**Files:**
- Create: `bloom-web/src/app/BouquetProjectDetailApp.tsx`
- Modify: `bloom-web/src/app/BloomApp.tsx`
- Modify: `bloom-web/src/app/bouquet-showcase.css`
- Test: `scripts/bloom-management.policy-test.js`

**Interfaces:**
- Consumes: `GET /api/bloom-bouquet/public/projects/${projectId}` returning `{ project, submissions }`.
- Produces: `BouquetProjectDetailApp({ projectId }: { projectId: number })`, Live/GitHub actions, real version history, link to `/?project=<id>&report=<runId>`.

- [ ] **Step 1: Run the existing RED detail policy assertion**

Run: `pnpm run test:production-runtime`

Expected: FAIL because `BouquetProjectDetailApp.tsx` does not exist.

- [ ] **Step 2: Implement typed public project detail fetch**

Use real types matching `ProjectDetailResponse`. Fetch with abort handling:

```tsx
fetch(`/api/bloom-bouquet/public/projects/${projectId}`, { signal: controller.signal })
```

Render deliberate loading, 404/error, and success states.

- [ ] **Step 3: Render the detail layout and Version History**

Top layout includes wordmark/back link, team/name/description, `ProjectVisual`, latest score/status, version/auth, Live Demo, and one or two GitHub links according to actual repository URLs.

Render submissions without synthetic data:

```tsx
{submissions.map((submission, index) => (
  <article className="bouquet-version-row" key={submission.id}>
    <strong>v{submission.version}</strong>
    <span>{new Date(submission.createdAt).toLocaleDateString('ko-KR')}</span>
    <StatusBadge status={submission.evaluationStatus} />
    <span>{submission.overallScore == null ? '—' : `${submission.overallScore} / 100`}</span>
    {index === 0 && <small>LATEST</small>}
  </article>
))}
```

Use the latest submission evaluation run for `Agent 평가 리포트 보기`.

- [ ] **Step 4: Route Project Detail from `BloomApp.tsx`**

Import and render:

```tsx
if (!legacyBuilder && publicProjectId && !publicReportId) {
  return <BouquetProjectDetailApp projectId={publicProjectId} />
}
```

Invalid/non-positive `project` values must result in a public error/Showcase fallback, never owner mode.

- [ ] **Step 5: Run build and policy tests**

Run: `pnpm run build:bloom-web && pnpm run test:production-runtime`

Expected: detail assertions pass; report assertions remain RED.

- [ ] **Step 6: Commit Project Detail**

```bash
git add bloom-web/src/app/BloomApp.tsx bloom-web/src/app/BouquetProjectDetailApp.tsx bloom-web/src/app/bouquet-showcase.css
git commit -m "feat: add BloomBouquet public project detail"
```

### Task 5: Replace the report modal with a dedicated Agent Report view

**Files:**
- Create: `bloom-web/src/app/BouquetEvaluationReportApp.tsx`
- Modify: `bloom-web/src/app/BloomApp.tsx`
- Modify: `bloom-web/src/app/bouquet-showcase.css`
- Test: `scripts/bloom-management.policy-test.js`

**Interfaces:**
- Consumes: `GET /api/bloom-bouquet/public/evaluations/${runId}` and real `AgentEvaluationResponse` fields.
- Produces: `BouquetEvaluationReportApp({ projectId, runId }: { projectId: number; runId: number })`.

- [ ] **Step 1: Run the existing RED report policy assertion**

Run: `pnpm run test:production-runtime`

Expected: FAIL because the report component does not exist.

- [ ] **Step 2: Implement report fetch, loading, error, and success states**

Fetch:

```tsx
fetch(`/api/bloom-bouquet/public/evaluations/${runId}`, { signal: controller.signal })
```

Do not create category scores. Render only `overallScore`, `overallStars`, `reportSummary`, and `agentEvaluations` fields returned by the backend.

- [ ] **Step 3: Build editorial Agent sections**

Each agent section renders role, score/stars, severity/priority, Assessment, Recommendation, Impact, Confidence, Evidence list, and Technical Terms. Use existing severity/status semantic treatment but keep the page neutral-first.

- [ ] **Step 4: Route reports from `BloomApp.tsx`**

```tsx
if (!legacyBuilder && publicProjectId && publicReportId) {
  return <BouquetEvaluationReportApp projectId={publicProjectId} runId={publicReportId} />
}
```

Set document titles for project/report views without changing owner/auth modes.

- [ ] **Step 5: Run build and full production runtime tests**

Run: `pnpm run build:bloom-web && pnpm run test:production-runtime`

Expected: Task 1 public-view contract is fully GREEN.

- [ ] **Step 6: Commit Agent Report**

```bash
git add bloom-web/src/app/BloomApp.tsx bloom-web/src/app/BouquetEvaluationReportApp.tsx bloom-web/src/app/bouquet-showcase.css scripts/bloom-management.policy-test.js
git commit -m "feat: add dedicated BloomBouquet agent report"
```

### Task 6: Migrate Bouquet Auth and Luna registration to the editorial system

**Files:**
- Modify: `bloom-web/src/app/BouquetAuthApp.tsx`
- Modify: `bloom-web/src/app/LunaBouquetRegisterApp.tsx`
- Modify: auth/Luna-related rules in `bloom-web/src/app/bouquet-manage.css` or their existing CSS file organization
- Test: `scripts/bloom-management.policy-test.js`

**Interfaces:**
- Consumes: current auth/session and Luna handoff logic.
- Produces: unchanged behavioral contracts with thin-border editorial layout.

- [ ] **Step 1: Add RED structural assertions that do not couple to copy**

Require editorial shell classes while retaining existing security assertions:

```js
assert.match(auth, /bouquet-auth-editorial/);
assert.match(luna, /bouquet-luna-editorial/);
assert.match(luna, /\/api\/bloom-bouquet\/luna\/register/);
assert.match(auth, /params\.get\(['"]return_to['"]\)\s*===\s*['"]manage['"]/);
```

- [ ] **Step 2: Run policy test and verify RED**

Run: `pnpm run test:production-runtime`

Expected: FAIL only on the new editorial shell classes.

- [ ] **Step 3: Restructure Auth presentation only**

Keep form handlers, endpoints, symbolic return target, bounded Luna preservation, and cookie behavior untouched. Replace rounded promotional cards with a simple editorial intro + form panel, rectangular fields, black CTA, restrained green identity label.

- [ ] **Step 4: Restructure Luna confirmation presentation only**

Keep parser, account check, POST payload, idempotent evaluation-status handling, login return, and manual fallback intact. Present handoff metadata as compact label/value rows with one primary registration CTA.

- [ ] **Step 5: Run build and policy tests**

Run: `pnpm run build:bloom-web && pnpm run test:production-runtime`

Expected: PASS.

- [ ] **Step 6: Commit Auth/Luna redesign**

```bash
git add bloom-web/src/app/BouquetAuthApp.tsx bloom-web/src/app/LunaBouquetRegisterApp.tsx bloom-web/src/app/bouquet-manage.css scripts/bloom-management.policy-test.js
git commit -m "feat: restyle Bouquet auth and Luna registration"
```

### Task 7: Rebuild Owner Console as a dense editorial workspace

**Files:**
- Modify: `bloom-web/src/app/BouquetManageApp.tsx`
- Modify: `bloom-web/src/app/bouquet-manage.css`
- Test: `scripts/bloom-management.policy-test.js`

**Interfaces:**
- Consumes: existing owner cookie APIs, Team/Project/Submission creation handlers and selected context state.
- Produces: the same manual fallback capabilities in thin-border navigation, compact project rows, and editorial forms.

- [ ] **Step 1: Add RED console-layout assertions while preserving behavior assertions**

Require the new dense shell and project table/list concept:

```js
assert.match(manage, /bouquet-console-editorial/);
assert.match(manage, /bouquet-console-project-row/);
assert.match(manage, /createTeam/);
assert.match(manage, /createProject/);
assert.match(manage, /publishSubmission/);
```

Retain assertions for cookie APIs, no internal worker API, no local/session storage, and queued EvaluationRun creation.

- [ ] **Step 2: Run policy test and verify RED**

Run: `pnpm run test:production-runtime`

Expected: FAIL only on new console shell/row structure.

- [ ] **Step 3: Recompose Overview as project-first rows**

Keep `ManagePanel` state but replace large cards with a thin-border workspace. Render a compact project list showing project/team, published state, latest version, evaluation status, and score. Clicking a row updates selected project/team context.

- [ ] **Step 4: Keep Team/Project/Submission forms behavior-identical**

Do not change payloads or validation. Only change grouping/markup/classes. Keep `requiresAuth` callback requirement and success run messaging.

- [ ] **Step 5: Implement responsive console navigation**

Desktop uses compact left/top navigation with 1320px workspace. Mobile converts navigation to horizontal scroll/tabs; only data tables may use controlled horizontal overflow.

- [ ] **Step 6: Run build and production runtime tests**

Run: `pnpm run build:bloom-web && pnpm run test:production-runtime`

Expected: PASS.

- [ ] **Step 7: Commit Owner Console migration**

```bash
git add bloom-web/src/app/BouquetManageApp.tsx bloom-web/src/app/bouquet-manage.css scripts/bloom-management.policy-test.js
git commit -m "feat: rebuild BloomBouquet owner console"
```

### Task 8: Full regression, review, PR, and production verification

**Files:**
- Review all files changed from `main...feat/bloombouquet-showcase-design-transplant`
- Update PR body only; production source should not change unless review finds a defect.

**Interfaces:**
- Consumes: Tasks 1–7 complete branch.
- Produces: exact-head verified PR, squash merge, successful main Harness and production deploy.

- [ ] **Step 1: Run local/CI-equivalent web checks**

Run:

```bash
pnpm run build:bloom-web
pnpm run test:production-runtime
```

Expected: PASS.

- [ ] **Step 2: Open a Draft PR using repository conventions**

Title:

```text
feat : BloomBouquet 쇼케이스 디자인 전면 개편
```

Body section order must be exactly:

```text
# ✨ PR 내용
## 📝 코드 변경 사항
## 💡 변경 이유
## 🛠️ 구현 방법
## 📌 영향 범위
## ✅ 테스트
**테스트 결과 / 참고 사항**
## 🌿 반영 브랜치
```

- [ ] **Step 3: Verify exact-head Harness**

Require all Harness steps to pass: root web, Node server, production runtime policy, backend protocol/E2E, Luna desktop, Bloom runtime policy, worker build, Rust/Tauri, invariants.

- [ ] **Step 4: Review diff for scope and contract regressions**

Confirm:

```text
No backend production code changes.
No public ?mode=manage or ?mode=auth CTA.
No third-party/mock screenshot URLs.
No fabricated evaluation fields.
No auth/Luna endpoint or payload changes.
No Team/Project/Submission fallback removal.
```

Fix any Critical/Important finding, rerun exact-head Harness, and update the PR body with the final SHA/test result.

- [ ] **Step 5: Merge only after exact-head SUCCESS**

Use squash merge. Record the resulting main SHA.

- [ ] **Step 6: Verify post-merge main workflows**

Require:

```text
Harness: SUCCESS on merged main SHA
Deploy to Server: SUCCESS on merged main SHA
Verify BloomBouquet public domain: SUCCESS
```

- [ ] **Step 7: Report production completion only with workflow evidence**

Include PR number, merge SHA, Harness run, Deploy run, and production URL `https://bloombouquet.https.gsmsv.site`.
