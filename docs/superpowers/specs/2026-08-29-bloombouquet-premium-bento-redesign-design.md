# BloomBouquet Premium Bento Redesign

## Goal
Rebuild BloomBouquet's visual system so it feels like a premium project platform rather than an internal admin dashboard. The reference direction is MORU's clean, editorial presentation combined with modern bento-style portfolio and product showcase patterns, but the result must remain recognizably BloomBouquet and must not copy any single site one-to-one.

## Scope
This redesign covers the public Showcase, evaluation report experience, Bouquet authentication screens, Luna one-click registration, and the owner management console. Backend behavior, API contracts, registration semantics, evaluation semantics, and app gateway behavior stay unchanged unless a UI-only compatibility fix is required.

## Visual Direction
Use a warm off-white canvas, near-black typography, restrained plum/lilac accents, and occasional muted green or amber only for semantic status. Prefer large editorial typography, high contrast, generous whitespace, fewer containers, and asymmetric composition. Rounded corners remain part of the brand, but not every text block should sit inside a pill or card.

The interface should use a 12-column responsive grid on desktop and a single-column flow on mobile. Cards may span different column and row sizes. Featured projects receive large visual cards; metadata and status use smaller supporting tiles. Shadows are subtle and soft; borders are thin and low-contrast.

## Design Tokens
- Background: warm off-white, not gray-pink.
- Primary text: near-black.
- Secondary text: cool neutral gray.
- Accent: muted plum / lilac.
- Success: muted green.
- Warning: warm amber.
- Danger: restrained red.
- Radius scale: 12 / 18 / 28 / 40px, used intentionally by hierarchy.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 72 / 96px.
- Typography: Inter/Pretendard fallback stack; display headlines use tight tracking and high weight, body copy uses comfortable Korean line-height.
- Motion: 140-220ms for hover/focus transitions; no gratuitous animation.

## Public Showcase
The top of the page becomes a compact editorial header rather than a giant empty hero. It contains the BloomBouquet wordmark, one strong sentence explaining the platform, and compact live metrics integrated into the layout instead of three isolated statistic cards.

The project list becomes an asymmetric bento grid. The first eligible project is a Featured Project card spanning more columns and rows. Other cards vary in size based on order and available content. Each card prioritizes project identity and launch intent in this order: team, project name, short description, visual/preview treatment, evaluation score/status, version/auth chips, then actions.

If a project screenshot is unavailable, render a branded generated preview surface from project name, team, and status rather than a blank white card. Do not fetch arbitrary remote screenshots from the browser at runtime.

Project cards use explicit buttons/links for `프로젝트 보기` and `평가 보기`. The entire card must not become a giant ambiguous click target.

## Evaluation Report
Replace the current dense admin-style modal with a premium review panel. Desktop uses a large centered sheet or right-weighted panel with a sticky report header. Mobile uses a full-screen sheet.

The report hierarchy is:
1. Overall score and star rating.
2. One-paragraph evaluator summary.
3. Key findings grouped by severity/priority.
4. Agent review cards.
5. Evidence and technical terminology details.

Agent reviews should expose assessment and recommendation first. Evidence, impact, confidence, and technical terms become secondary expandable or lower-emphasis content. Severity is communicated by label and restrained semantic color, never by large saturated blocks.

## Bouquet Authentication
Authentication screens use the same typography, surfaces, button styles, form controls, and spacing tokens as the public site. The auth experience should feel like a focused product entry screen, not a separate legacy page. Avoid oversized form cards; use a two-column editorial layout on wide screens and a single column on mobile.

## Luna One-click Registration
The Luna registration surface remains intentionally simple. It becomes a single premium confirmation sheet containing project identity, repository, deployment URL, authentication requirement, and team. The primary action remains `BloomBouquet에 등록하고 평가 시작` and is visually dominant. `직접 수정해서 등록` remains a low-emphasis secondary action.

The screen must make it obvious that Luna already filled the data. Users should not feel they are entering a management console.

## Owner Management Console
Keep all existing functionality but change the presentation from a long wizard-like stack into a dashboard workspace. Desktop structure:
- Slim left navigation or contextual rail.
- Main content area.
- Team/project selection in compact controls near the page header.
- Creation/edit forms appear as focused panels or drawers rather than permanently occupying the whole page.
- Submission history appears as a clean table/list with evaluation status.

The manual Team → Project → Submission flow still exists as fallback, but the page should not force all three forms into view simultaneously.

## Shared Components
Create a small shared visual system rather than duplicating CSS between screens. Expected primitives:
- `BouquetShell`
- `BouquetHeader`
- `Surface`
- `Metric`
- `StatusBadge`
- `ScoreBadge`
- `PrimaryButton` / `SecondaryButton`
- `Field`
- `EmptyState`
- `ProjectVisual`

Implementation may keep these as lightweight React components and CSS classes; do not introduce a UI framework solely for this redesign.

## Accessibility and Responsive Rules
- Maintain WCAG AA text contrast.
- All hover-only affordances also have keyboard focus states.
- Buttons and links use at least 44px comfortable touch targets where practical.
- Modals/sheets retain accessible labels and close controls.
- Bento layout collapses to a predictable single-column sequence under tablet width.
- Information order in mobile must match semantic importance, not desktop grid placement.

## Error, Loading, and Empty States
Loading states use understated skeleton/surface placeholders instead of plain text in the middle of an empty page. Errors are shown inline with a clear retry or recovery action where available. Empty project state should still look intentional and branded, with concise copy explaining what will appear after first publication.

## Technical Constraints
- No backend schema or API redesign.
- No new runtime dependency unless justified by a concrete missing capability.
- Preserve current public routes and `?mode=` compatibility.
- Preserve Luna handoff query behavior and Bouquet auth return flow.
- Preserve existing evaluation report data contract.
- Do not expose manage/login calls-to-action on the public launcher when product policy says they are hidden.
- Avoid copying MORU or another reference site's exact assets, typography lockups, illustrations, or layout measurements.

## Testing
The redesign is complete only when:
- BloomBouquet root web builds.
- Existing production runtime policy tests pass.
- Existing Bloom management and Luna registration policy tests pass.
- New UI structure tests pin the presence of the shared design system and bento showcase hierarchy.
- Public showcase, auth, Luna registration, and owner console remain usable at desktop and mobile breakpoints.
- Existing API requests and registration/evaluation flows are unchanged.
- Full repository Harness passes on the exact PR head before merge.

## Success Criteria
A first-time visitor should understand within a few seconds that BloomBouquet is a curated project showcase with senior-agent evaluation. The first screen should lead visually with projects, not platform statistics. Luna-created projects should look native to the showcase after one-click registration. The management area should feel like the same product while remaining operationally efficient.
