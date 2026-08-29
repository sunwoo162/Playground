# BloomBouquet Project Showcase Design Transplant

## Status

Approved design direction: **A — import the uploaded Project Showcase Platform visual system while preserving the current BloomBouquet product, authentication, and public-navigation policies.**

This specification replaces the current Premium Bento presentation with an editorial project-showcase system derived from the uploaded `Project Showcase Platform.zip`. It does **not** copy the Figma Make/Tailwind implementation directly. The source is a design reference; production remains in the existing BloomBouquet React/Vite/CSS architecture.

## Goals

1. Make deployed projects, not decorative dashboard cards, the primary visual object.
2. Implement the uploaded design's five-page information architecture using real BloomBouquet data:
   - Showcase
   - Project Detail
   - Agent Report
   - Login/Auth
   - Owner Console
3. Keep Luna one-click registration visually consistent with the same system.
4. Preserve all existing backend, OAuth, cookie, Luna handoff, evaluation, and deployment contracts.
5. Preserve the approved public-navigation policy: the public Showcase must not expose Console or login entry CTAs.
6. Remove mock-specific concepts that are not represented by real BloomBouquet APIs instead of fabricating them.

## Non-goals

- No backend schema migration for screenshots, thumbnails, tags, or technology stacks.
- No automatic screenshot capture in this change.
- No Tailwind dependency added to `bloom-web`.
- No rewrite of Bouquet authentication or Luna registration protocols.
- No changes to Agent evaluation scoring rules.
- No changes to evaluator worker behavior.
- No public Console/login navigation links.
- No synthetic category scores copied from the reference mock.

## Design source analysis

The uploaded reference is a React/Vite/Tailwind Figma Make project whose `src/App.tsx` models five views: Showcase, Project Detail, Agent Report, Login, and Console. It uses mock project thumbnails, mock tags, mock version history, and mock evaluation categories.

The reusable visual language is:

- white page background
- narrow 1px neutral-gray borders (`#dfe0e2` family)
- square or minimally rounded surfaces
- dark neutral typography (`#171719` / `#1a1a1a` family)
- muted secondary text (`#6b6b6e` / `#979799` family)
- restrained green accent (`#2d5a3d` family)
- 1320px-class editorial container
- compact uppercase labels
- large but disciplined page headlines
- 16:10 project preview surfaces
- dense table/list presentation for version and console data
- black primary CTAs rather than saturated brand buttons

The production implementation will transplant these principles, not the Tailwind utility strings or mock data layer.

## Existing production contracts to preserve

Current public APIs already support the required real data:

- `GET /api/bloom-bouquet/public/projects`
- `GET /api/bloom-bouquet/public/projects/{projectId}`
- `GET /api/bloom-bouquet/public/evaluations/{runId}`

Owner/auth/Luna APIs remain unchanged.

`ProjectDetailResponse` already provides the project plus its submission history, so Version History can be real rather than mocked.

Existing `BloomApp` query-mode contracts remain valid:

- `?mode=auth`
- `?mode=manage`
- `?mode=manage&luna=<handoff>`
- `?mode=builder`

Public detail/report navigation will use independent public query parameters so the existing `mode` contract stays untouched:

- Showcase: `/`
- Project Detail: `/?project=<projectId>`
- Agent Report: `/?project=<projectId>&report=<evaluationRunId>`

Direct refresh of either public URL must restore the same view without requiring in-memory navigation state.

## Information architecture

### 1. Public Showcase

The public root becomes an editorial gallery rather than an asymmetric Bento dashboard.

Header:

- BloomBouquet wordmark only.
- No `CONSOLE`, login, management, or auth CTA.
- No hidden link that exposes `?mode=manage` or `?mode=auth` from the public surface.

Hero:

- compact `LUNA AGENT SYSTEM` or equivalent system label in green
- large BloomBouquet project-showcase statement
- short explanation of Luna-created projects and independent Senior Agent review
- project/team/review counts may remain, but visually subordinate to projects

Controls:

- team filter using real `teamName`
- sort toggle: newest and score
- no fake technology/tag filter because production data does not expose tags

Gallery:

- responsive three-column grid on wide screens
- 16:10 project preview surface
- two columns on medium screens, one column on mobile
- project card includes real team, project name, description, latest version, auth marker, evaluation status, overall score when available
- clicking a project opens the Project Detail view
- direct Live Demo actions may remain as secondary actions where useful, but the primary card affordance is project detail

Preview imagery:

- continue using a deterministic `ProjectVisual` abstraction
- redesign `ProjectVisual` as an editorial 16:10 preview rather than a decorative Bento illustration
- do not fetch Unsplash or other remote placeholder images
- do not pretend a project screenshot exists

### 2. Public Project Detail

A new dedicated public detail component is added instead of expanding cards or opening a report modal.

Data source:

- `GET /api/bloom-bouquet/public/projects/{projectId}`

Top section:

- breadcrumb/back to Showcase
- project name and description
- team
- latest version
- evaluation status
- latest overall score
- auth requirement marker
- 16:10 `ProjectVisual`

Actions:

- Live Demo from latest submission `demoUrl`
- GitHub actions from available frontend/backend repository URLs
- if both frontend and backend repositories exist, expose them distinctly
- if only one repository exists, render one GitHub action

Version History:

- use real `submissions`
- show version, created date, evaluation state, overall score when present
- latest submission visually marked
- no fake score when a submission has not completed evaluation
- version rows are display-only in this iteration; changing selected historical version does not mutate the project or start an evaluation

Evaluation CTA:

- when latest submission has `evaluationRunId`, show `Agent 평가 리포트 보기`
- opens the public Agent Report URL
- when no run exists, display an explicit not-yet-evaluated state

### 3. Public Agent Report

Replace the current modal/sheet report with a dedicated full-page report view.

Data source:

- `GET /api/bloom-bouquet/public/evaluations/{runId}`

Layout:

- max-width editorial report column, narrower than Showcase
- breadcrumb back to Project Detail
- report metadata and status
- large Overall Score
- report summary
- Agent evaluation sections

Each Agent section uses real fields only:

- agent role
- score and stars
- severity
- priority
- assessment
- recommendation
- impact
- confidence
- evidence
- technical terms

Severity presentation:

- neutral-first design with restrained semantic accents
- CRITICAL/HIGH must remain visually distinguishable without turning the entire report into a colorful dashboard

The reference mock's `categories`, `strengths`, `improvements`, `grade`, and single `evaluatorAgent` are not production contracts and must not be fabricated. Equivalent information is expressed through the actual independent Agent evaluations.

### 4. Bouquet Auth

Keep current authentication behavior exactly the same and replace only presentation.

Visual treatment:

- editorial single/two-column layout depending on viewport
- square neutral fields
- black primary CTA
- thin borders
- compact labels
- restrained green accent for Bouquet identity/status

Behavior preserved:

- login/register flow
- `return_to=manage`
- bounded Luna handoff preservation
- no open redirects
- existing cookie/session handling

### 5. Luna one-click registration

Preserve the one-click contract and handoff validation.

The screen becomes a compact editorial registration confirmation rather than a large rounded card stack.

It must show the real handoff values:

- team
- project name and description
- version
- live URL
- repository URL
- authentication requirement and callback when applicable
- signed-in Bouquet account

Primary CTA remains `BloomBouquet에 등록하고 평가 시작` or the existing equivalent.

No user-editable duplicate Team/Project/Submission form is introduced here. Manual management remains the fallback path.

### 6. Owner Console

The owner console adopts the reference's dense workspace/table character while preserving all current manual fallback functionality.

Top area:

- wordmark and signed-in account
- compact title and counts

Workspace structure:

- remove oversized Bento/rounded surfaces
- use a thin-border shell with simple navigation/tabs for Overview, Team, Project, Submission
- current Team and Project context stays visible but compact

Overview:

- project-focused summary
- selected project latest submission
- evaluation status and score
- clear next action

Project lists:

- table/list rows rather than large cards
- name, team, published state, version, evaluation state, score

Creation/publishing forms:

- existing Team creation
- existing Project creation
- existing Submission publishing
- existing auth callback requirements
- forms use editorial field styling with clear grouping

No owner API behavior changes.

## Shared design system

`BouquetUI.tsx` remains the reusable primitive layer but its visual contract changes.

Expected primitives include or evolve toward:

- `BouquetWordmark`
- `ProjectVisual`
- `StatusBadge`
- `ScoreBadge` or score treatment
- `PrimaryButton`
- `SecondaryButton`
- `Field`
- `Surface`
- compact metadata label/value primitive where useful

Design tokens in `bouquet-system.css` should define:

- neutral palette
- green accent
- border color
- text hierarchy
- content widths
- spacing scale
- typography scale
- focus ring
- control heights

Avoid component-specific hardcoded variants when a reusable token is appropriate.

## Component boundaries

The current public showcase component should stop owning report-dialog state.

Target public component split:

- `BouquetShowcaseApp.tsx` — list/filter/sort and public gallery
- `BouquetProjectDetailApp.tsx` — one public project and its submissions
- `BouquetEvaluationReportApp.tsx` — one evaluation report
- `BloomApp.tsx` — URL parsing and top-level view selection only

Existing components remain:

- `BouquetAuthApp.tsx`
- `LunaBouquetRegisterApp.tsx`
- `BouquetManageApp.tsx`
- `BouquetUI.tsx`

This split prevents the Showcase file from becoming another all-in-one Figma Make-style `App.tsx`.

## Data and navigation flow

### Showcase

1. Load public projects.
2. Derive team options from real projects.
3. Filter/sort locally.
4. Project click navigates to `/?project=<id>`.

### Project Detail

1. Parse and validate positive numeric project ID.
2. Fetch public project detail.
3. Render latest submission plus all submissions.
4. Report CTA navigates to `/?project=<id>&report=<runId>`.

### Agent Report

1. Parse and validate positive numeric project and run IDs.
2. Fetch public report by run ID.
3. Render report using actual Agent evaluation fields.
4. Back action returns to `/?project=<id>`.

Invalid public IDs render an explicit not-found/error state with a Showcase return action rather than falling into owner/auth modes.

## Loading, empty, and error states

Every public view must have deliberate states consistent with the reference visual system:

- Showcase loading skeleton grid
- Showcase empty state
- Project Detail loading skeleton
- missing/404 project state
- Agent Report loading state
- missing/404 report state
- evaluation pending state
- API failure retry/return actions

Owner/Auth/Luna existing error semantics must remain visible and accessible.

## Accessibility

- semantic `main`, `header`, `nav`, `article`, `section`, and table/list structures
- all button/link interactions keyboard reachable
- `:focus-visible` retained and updated for the new neutral/green system
- no color-only evaluation status meaning
- visible labels for form controls
- responsive type must not require horizontal scrolling at normal mobile widths
- respect `prefers-reduced-motion`
- project cards implemented as valid interactive structures without nested conflicting links/buttons

## Responsive behavior

Desktop:

- approximately 1320px content width for Showcase/Console
- 3-column project gallery
- detail two-column content/score composition where appropriate

Tablet:

- 2-column gallery
- detail score panel moves into normal flow
- console tables may use controlled horizontal overflow only where unavoidable

Mobile:

- 1-column gallery
- single-column detail/report/auth/Luna layouts
- owner console navigation becomes horizontal tabs or another compact non-sidebar treatment
- touch targets at least practical mobile size

## Security and privacy constraints

- public Showcase still does not advertise owner management/auth routes
- no credentials, tokens, passwords, or handoff secrets rendered beyond existing approved Luna metadata
- `luna` query payload remains bounded and validated by existing parser/backend
- external project/GitHub URLs keep existing validation assumptions and safe link behavior
- no third-party screenshot/image fetches introduced

## Testing strategy

### UI policy tests

Extend the existing Bloom management/runtime policy test suite to assert:

- Showcase no longer contains Premium Bento-only layout contract
- public header does not expose `mode=manage` or `mode=auth`
- project gallery/detail/report components exist and are routed by public query params
- Showcase uses real project filter/sort concepts
- Project Detail calls `/api/bloom-bouquet/public/projects/{id}`
- Agent Report calls `/api/bloom-bouquet/public/evaluations/{runId}`
- no Unsplash/mock thumbnail URL is introduced
- Auth and Luna still preserve existing return/handoff contracts
- Console still contains manual Team/Project/Submission fallback functionality
- focus-visible/reduced-motion responsive policy remains

### Build and regression

Required before merge:

- `pnpm run build:bloom-web`
- `pnpm run test:production-runtime`
- backend protocol/E2E suite through Harness
- Luna runtime/desktop checks through Harness
- exact-head Harness success

Required after merge:

- main Harness success
- Deploy to Server success
- `Verify BloomBouquet public domain` success

## Expected file scope

Primary files:

- `bloom-web/src/app/BloomApp.tsx`
- `bloom-web/src/app/BouquetShowcaseApp.tsx`
- `bloom-web/src/app/BouquetProjectDetailApp.tsx` (new)
- `bloom-web/src/app/BouquetEvaluationReportApp.tsx` (new)
- `bloom-web/src/app/BouquetAuthApp.tsx`
- `bloom-web/src/app/LunaBouquetRegisterApp.tsx`
- `bloom-web/src/app/BouquetManageApp.tsx`
- `bloom-web/src/app/BouquetUI.tsx`
- `bloom-web/src/app/bouquet-system.css`
- `bloom-web/src/app/bouquet-showcase.css`
- management/auth-related Bloom CSS as currently organized
- `scripts/bloom-management.policy-test.js` and/or adjacent production runtime policy tests

Backend production code should not change unless implementation discovers a concrete mismatch between this spec and the already-existing public detail/report response contracts. Any such mismatch upgrades scope and requires stopping before changing the API.

## Acceptance criteria

The redesign is complete when:

1. The production Showcase visually follows the uploaded editorial design language rather than the existing Premium Bento system.
2. Public cards open real dedicated Project Detail views.
3. Project Detail displays real Submission version history from the existing API.
4. Agent evaluation is a dedicated public Report view, not a modal.
5. No fake thumbnails, tags, category scores, or technology metadata are shown.
6. Auth, Luna registration, and Console use the same thin-border editorial design language.
7. Public Showcase exposes no Console/login management CTA.
8. Existing auth, Luna handoff, Team/Project/Submission, OAuth, evaluation, and Builder contracts still pass regression tests.
9. Exact-head PR Harness passes.
10. Main post-merge Harness and production deploy verification pass.
