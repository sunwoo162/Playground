# BloomBouquet Premium Bento Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign BloomBouquet's public showcase, evaluation report, Bouquet auth, Luna one-click registration, and owner console into one premium editorial/bento visual system without changing backend/API behavior.

**Architecture:** Add one lightweight shared React/CSS design system inside `bloom-web/src/app`, then migrate each existing surface onto those primitives while preserving the current route/query contracts and fetch calls. Keep screen-specific CSS for composition, but centralize tokens, buttons, badges, fields, surfaces, empty/loading states, and generated project visuals to prevent the current style drift.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6, plain CSS, Node test runner policy tests, existing pnpm/Harness workflows.

**Spec:** `docs/superpowers/specs/2026-08-29-bloombouquet-premium-bento-redesign-design.md`

## Global Constraints

- No backend schema or API redesign.
- No new runtime dependency unless a concrete missing capability is proven.
- Preserve current public routes and `?mode=` compatibility.
- Preserve Luna handoff query behavior and Bouquet auth return flow.
- Preserve the existing evaluation report data contract.
- Keep manage/login calls-to-action hidden from the public launcher.
- Do not copy MORU or any reference site's exact assets, illustrations, typography lockups, or layout measurements.
- Use warm off-white, near-black typography, muted plum/lilac accent, semantic muted green/amber/red.
- Desktop uses a 12-column visual grid; tablet/mobile collapses to a predictable single-column semantic order.
- Maintain keyboard focus visibility, WCAG AA text contrast, and practical 44px interactive targets.

---

### Task 1: Shared BloomBouquet visual system and policy test

**Files:**
- Create: `bloom-web/src/app/BouquetUI.tsx`
- Create: `bloom-web/src/app/bouquet-system.css`
- Create: `scripts/bloombouquet-ui.policy-test.js`
- Modify: `package.json`
- Modify: `bloom-web/src/app/BloomApp.tsx`

**Interfaces:**
- Produces `BouquetWordmark`, `Surface`, `Metric`, `StatusBadge`, `ScoreBadge`, `PrimaryButton`, `SecondaryButton`, `Field`, `EmptyState`, `ProjectVisual`.
- `StatusBadge` consumes `{ status: string | null; children?: ReactNode }` and maps completed/running/queued/failed/none to semantic classes.
- `ProjectVisual` consumes `{ name: string; teamName: string; status: string | null; featured?: boolean }` and renders a deterministic CSS-only branded preview, never a remote screenshot fetch.

- [ ] **Step 1: Write the failing UI policy test**

Create `scripts/bloombouquet-ui.policy-test.js` with Node tests that assert:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const ui = fs.readFileSync('bloom-web/src/app/BouquetUI.tsx', 'utf8')
const css = fs.readFileSync('bloom-web/src/app/bouquet-system.css', 'utf8')
const showcase = fs.readFileSync('bloom-web/src/app/BouquetShowcaseApp.tsx', 'utf8')
const auth = fs.readFileSync('bloom-web/src/app/BouquetAuthApp.tsx', 'utf8')
const luna = fs.readFileSync('bloom-web/src/app/LunaBouquetRegisterApp.tsx', 'utf8')
const manage = fs.readFileSync('bloom-web/src/app/BouquetManageApp.tsx', 'utf8')

test('BloomBouquet shares one premium visual system', () => {
  for (const name of ['BouquetWordmark', 'Surface', 'Metric', 'StatusBadge', 'ScoreBadge', 'PrimaryButton', 'SecondaryButton', 'Field', 'EmptyState', 'ProjectVisual']) {
    assert.match(ui, new RegExp(`export function ${name}`))
  }
  assert.match(css, /--bouquet-bg:/)
  assert.match(css, /--bouquet-ink:/)
  assert.match(css, /--bouquet-accent:/)
  assert.match(css, /:focus-visible/)
  assert.match(showcase, /ProjectVisual/)
  assert.match(auth, /BouquetWordmark/)
  assert.match(luna, /Surface/)
  assert.match(manage, /StatusBadge/)
})

test('public showcase stays free of management entry points', () => {
  assert.doesNotMatch(showcase, /\?mode=manage|\?mode=auth/)
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
node --test scripts/bloombouquet-ui.policy-test.js
```

Expected: FAIL because `BouquetUI.tsx` / `bouquet-system.css` do not exist yet.

- [ ] **Step 3: Add the shared primitives and tokens**

Create `BouquetUI.tsx` with small semantic components only; no API logic. Use `className` composition and native elements. `PrimaryButton`/`SecondaryButton` support either `href` or button props without introducing routing dependencies. `Field` wraps `label`, label text, optional hint, and children. `EmptyState` accepts `eyebrow`, `title`, `description`, optional action. `ProjectVisual` renders layered decorative spans with `aria-hidden="true"` and keeps the project identity in surrounding semantic text.

Create `bouquet-system.css` with:

```css
:root {
  --bouquet-bg: #f6f3ed;
  --bouquet-surface: #fffdf9;
  --bouquet-surface-strong: #171518;
  --bouquet-ink: #171518;
  --bouquet-muted: #6f6b72;
  --bouquet-line: rgba(23, 21, 24, .10);
  --bouquet-accent: #76586f;
  --bouquet-accent-soft: #e9dfe7;
  --bouquet-success: #397052;
  --bouquet-warning: #9a6c22;
  --bouquet-danger: #a54848;
  --bouquet-radius-sm: 12px;
  --bouquet-radius-md: 18px;
  --bouquet-radius-lg: 28px;
  --bouquet-radius-xl: 40px;
}
```

Also define typography, shared button, badge, field, metric, surface, project visual, skeleton, and `:focus-visible` rules. Interactive controls use minimum-height 44px except compact inline controls where semantic size remains comfortable.

- [ ] **Step 4: Import the system once**

Update `BloomApp.tsx` to import `./bouquet-system.css` before screen CSS is evaluated through child imports. Do not alter route/query branching.

- [ ] **Step 5: Wire the new policy test into production tests**

Append `scripts/bloombouquet-ui.policy-test.js` to `test:production-runtime` in `package.json`.

- [ ] **Step 6: Run focused verification**

Run:

```bash
node --test scripts/bloombouquet-ui.policy-test.js
pnpm run build:bloom-web
```

Expected: the UI policy test may still fail on screen imports until later tasks, while TypeScript/CSS build must pass after primitives compile.

- [ ] **Step 7: Commit**

```bash
git add bloom-web/src/app/BouquetUI.tsx bloom-web/src/app/bouquet-system.css bloom-web/src/app/BloomApp.tsx scripts/bloombouquet-ui.policy-test.js package.json
git commit -m "feat: add BloomBouquet premium design system"
```

### Task 2: Public showcase and evaluation report redesign

**Files:**
- Modify: `bloom-web/src/app/BouquetShowcaseApp.tsx`
- Replace styles in: `bloom-web/src/app/bouquet-showcase.css`
- Test: `scripts/bloombouquet-ui.policy-test.js`

**Interfaces:**
- Consumes `BouquetWordmark`, `Metric`, `StatusBadge`, `ScoreBadge`, `EmptyState`, `ProjectVisual`, `PrimaryButton`, `SecondaryButton` from `BouquetUI.tsx`.
- Keeps existing `/api/bloom-bouquet/public/projects` and `/api/bloom-bouquet/public/evaluations/:runId` calls unchanged.

- [ ] **Step 1: Extend the failing policy test for showcase hierarchy**

Add assertions for classes/tokens that pin the intended structure:

```js
assert.match(showcase, /bouquet-showcase-header/)
assert.match(showcase, /bouquet-bento-grid/)
assert.match(showcase, /bouquet-project-featured/)
assert.match(showcase, /프로젝트 보기/)
assert.match(showcase, /평가 보기/)
assert.match(showcase, /bouquet-report-sheet/)
assert.match(showcase, /bouquet-report-sticky/)
assert.match(showcase, /bouquet-key-findings/)
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
node --test scripts/bloombouquet-ui.policy-test.js
```

Expected: FAIL on the new showcase hierarchy assertions.

- [ ] **Step 3: Replace the hero with editorial header + inline metrics**

Refactor `BouquetShowcaseApp.tsx` so the first screen order is:

```text
Wordmark / platform label
Large two-line value proposition
Projects · Teams · Reviewed inline metrics
Project bento grid
```

Remove the separate authentication notice card. Preserve the policy copy only where it naturally supports an authenticated project chip; do not expose a login CTA.

- [ ] **Step 4: Build the asymmetric bento project layout**

Render the first project as `bouquet-project-featured` and subsequent projects with deterministic size classes based on index such as `is-wide`, `is-tall`, `is-compact`. Each card includes `ProjectVisual`, team, name, short description, status, score, version/auth metadata, and explicit `프로젝트 보기` / `평가 보기` controls.

- [ ] **Step 5: Redesign loading/error/empty states**

Use 3-4 skeleton surfaces during loading, a branded `EmptyState` when no projects exist, and an inline error surface with a reload button calling `window.location.reload()`.

- [ ] **Step 6: Redesign evaluation report hierarchy**

Keep the same `report` state and API. Change the modal body to:

```text
sticky report header + close
large overall score / rating / status
summary paragraph
key findings strip derived from agent evaluations sorted CRITICAL/HIGH/MEDIUM/LOW then priority
agent review list
```

Within each agent review show Assessment and Recommendation first. Put Impact/Evidence/technical terms/confidence in a lower-emphasis details area; native `<details>` is acceptable for evidence to reduce density.

- [ ] **Step 7: Replace showcase CSS**

Implement the 12-column desktop bento grid, featured card spanning 7-8 columns, secondary cards spanning 4-5 columns, and single-column collapse below 800px. Use CSS-only decorative preview gradients/shapes from the shared project visual and restrained hover lift. The report becomes a large premium sheet with sticky top region and full-screen mobile behavior.

- [ ] **Step 8: Verify and commit**

```bash
node --test scripts/bloombouquet-ui.policy-test.js
pnpm run build:bloom-web
git add bloom-web/src/app/BouquetShowcaseApp.tsx bloom-web/src/app/bouquet-showcase.css scripts/bloombouquet-ui.policy-test.js
git commit -m "feat: redesign BloomBouquet project showcase"
```

### Task 3: Bouquet authentication and Luna one-click confirmation

**Files:**
- Modify: `bloom-web/src/app/BouquetAuthApp.tsx`
- Replace styles in: `bloom-web/src/app/bouquet-auth.css`
- Modify: `bloom-web/src/app/LunaBouquetRegisterApp.tsx`
- Replace styles in: `bloom-web/src/app/luna-bouquet-register.css`
- Test: `scripts/bloombouquet-ui.policy-test.js`
- Existing regression test: `scripts/bloom-management.policy-test.js`

**Interfaces:**
- Consumes shared wordmark, surfaces, buttons, fields, badges.
- Must preserve `boundedLunaHandoff`, `manageReturnUrl`, OAuth params, `/api/bouquet/auth/*`, and `/api/bloom-bouquet/luna/register` behavior exactly.

- [ ] **Step 1: Add RED assertions for shared auth/Luna presentation**

Add:

```js
assert.match(auth, /bouquet-auth-editorial/)
assert.match(auth, /Field/)
assert.match(luna, /luna-register-summary-grid/)
assert.match(luna, /BloomBouquet에 등록하고 평가 시작/)
```

Run both policy tests and confirm only presentation assertions fail:

```bash
node --test scripts/bloombouquet-ui.policy-test.js scripts/bloom-management.policy-test.js
```

- [ ] **Step 2: Convert auth to an editorial two-column layout**

Use the left column for BloomBouquet identity, concise account explanation, and OAuth project context. Use the right column for login/signup/session actions. Replace bespoke card/button/input markup with shared primitives where practical while preserving form state, API calls, redirects, OAuth authorization, and error messages.

- [ ] **Step 3: Replace auth CSS**

Desktop is a balanced 5/7 or 6/6 split with no oversized floating card. Mobile stacks identity then form. Tabs look like a compact segmented control. Inputs get visible focus, neutral surfaces, and 44px+ height.

- [ ] **Step 4: Convert Luna page to premium confirmation sheet**

Keep loading, invalid payload, logged-out, result, and confirmation branches. On confirmation, render a strong project identity block, a compact summary grid for Team / Version / Auth, and secondary repository/deployment details. Preserve the primary button copy exactly. Make `직접 수정해서 등록` low emphasis.

- [ ] **Step 5: Replace Luna CSS and run regressions**

```bash
node --test scripts/bloombouquet-ui.policy-test.js scripts/bloom-management.policy-test.js
pnpm run build:bloom-web
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add bloom-web/src/app/BouquetAuthApp.tsx bloom-web/src/app/bouquet-auth.css bloom-web/src/app/LunaBouquetRegisterApp.tsx bloom-web/src/app/luna-bouquet-register.css scripts/bloombouquet-ui.policy-test.js
git commit -m "feat: unify BloomBouquet auth and Luna handoff UI"
```

### Task 4: Owner management workspace redesign

**Files:**
- Modify: `bloom-web/src/app/BouquetManageApp.tsx`
- Replace styles in: `bloom-web/src/app/bouquet-manage.css`
- Test: `scripts/bloombouquet-ui.policy-test.js`
- Existing regression test: `scripts/bloom-management.policy-test.js`

**Interfaces:**
- Keeps all existing state fields and create/publish API calls.
- Adds only local UI state: `activePanel: 'overview' | 'team' | 'project' | 'submission'` and optionally `mobileNavOpen` if necessary.
- Uses selected team/project state already present as workspace context.

- [ ] **Step 1: Add RED structure assertions**

Add:

```js
assert.match(manage, /bouquet-manage-rail/)
assert.match(manage, /bouquet-manage-workspace/)
assert.match(manage, /activePanel/)
assert.match(manage, /StatusBadge/)
assert.doesNotMatch(manage, /bouquet-manage-grid[^\n]*Project registration stages/)
```

Run:

```bash
node --test scripts/bloombouquet-ui.policy-test.js scripts/bloom-management.policy-test.js
```

Expected: new layout assertions fail; existing API/security policy remains green.

- [ ] **Step 2: Introduce workspace navigation without changing business logic**

Replace the permanent three-card wizard with a slim contextual rail containing `Overview`, `Team`, `Project`, `Submission`. Keep selected Team and Project controls in a compact context header so users always know what they are editing. Clicking a rail item only switches `activePanel`.

- [ ] **Step 3: Build focused panels**

- `overview`: account, selected team/project, latest submission status/score, shortcuts.
- `team`: existing team select + create form.
- `project`: selected-team project select + project create form.
- `submission`: selected project identity + publish form + latest submission summary.

Existing form submission handlers and validation stay unchanged.

- [ ] **Step 4: Replace manage CSS**

Desktop: 220-260px rail + fluid content. Mobile: horizontal/scrollable section navigation above content. Forms use shared field/button tokens. Disabled states remain obvious without reducing text contrast excessively. Success/evaluation state becomes a compact semantic banner rather than a giant card.

- [ ] **Step 5: Verify and commit**

```bash
node --test scripts/bloombouquet-ui.policy-test.js scripts/bloom-management.policy-test.js
pnpm run build:bloom-web
git add bloom-web/src/app/BouquetManageApp.tsx bloom-web/src/app/bouquet-manage.css scripts/bloombouquet-ui.policy-test.js
git commit -m "feat: redesign BloomBouquet owner workspace"
```

### Task 5: Responsive/accessibility polish and exact-head verification

**Files:**
- Modify as needed: `bloom-web/src/app/bouquet-system.css`
- Modify as needed: `bloom-web/src/app/bouquet-showcase.css`
- Modify as needed: `bloom-web/src/app/bouquet-auth.css`
- Modify as needed: `bloom-web/src/app/luna-bouquet-register.css`
- Modify as needed: `bloom-web/src/app/bouquet-manage.css`
- Test: `scripts/bloombouquet-ui.policy-test.js`

**Interfaces:**
- No new feature interfaces; this task closes visual and accessibility gaps discovered by builds/policy review.

- [ ] **Step 1: Add final static accessibility assertions**

Add tests requiring:

```js
assert.match(css, /prefers-reduced-motion/)
assert.match(css, /:focus-visible/)
assert.match(showcase, /aria-modal="true"/)
assert.match(showcase, /aria-label="Close report"/)
```

- [ ] **Step 2: Add reduced-motion and mobile rules**

In shared/system CSS disable transforms/transitions under `@media (prefers-reduced-motion: reduce)`. Verify all screen CSS has a <=800px collapse path. Ensure long repository/callback URLs wrap with `overflow-wrap: anywhere`.

- [ ] **Step 3: Run the full local verification set**

```bash
pnpm run build:bloom-web
pnpm run test:production-runtime
pnpm run harness
```

Expected: all PASS.

- [ ] **Step 4: Commit polish**

```bash
git add bloom-web/src/app scripts/bloombouquet-ui.policy-test.js package.json
git commit -m "fix: polish BloomBouquet responsive accessibility"
```

### Task 6: PR, CI review, merge, and production deploy verification

**Files:**
- No product code unless CI/code review finds a defect.

**Interfaces:**
- PR title must be `feat : BloomBouquet 프리미엄 Bento 디자인 개편`.
- PR body must use the repository's exact Korean PR section order.

- [ ] **Step 1: Compare branch to current main before PR**

Run repository compare against `main`. If main advanced after branch creation, merge/rebase through a safe branch update and rerun all verification before opening the PR.

- [ ] **Step 2: Open PR with exact template**

Body sections in order:

```text
# ✨ PR 내용
## 📝 코드 변경 사항
## 💡 변경 이유
## 🛠️ 구현 방법
## 📌 영향 범위
## ✅ 테스트
**테스트 결과 / 참고 사항**
## 🌿 반영 브랜치
- main
```

- [ ] **Step 3: Review changed files**

Check that no backend/API contract was changed, no public manage/auth CTA was reintroduced, no remote screenshot fetching exists, and no unrelated Builder/Luna runtime changes are present.

- [ ] **Step 4: Require exact PR-head Harness PASS**

Wait for the PR Harness run and require every step to pass: root web build, Node server check, production runtime policy, backend tests, Luna desktop build, Bloom runtime tests, worker build, Rust/Tauri checks, harness invariants.

- [ ] **Step 5: Merge only the verified head**

Use squash merge if consistent with repository practice, then record the merge SHA.

- [ ] **Step 6: Verify main deployment and post-merge Harness**

Require `Deploy to Server` success for the merge SHA and post-merge `Harness` success. Confirm the public BloomBouquet root verification step passes. Do not trigger the manual app-gateway workflow because this redesign does not change Nginx topology.
