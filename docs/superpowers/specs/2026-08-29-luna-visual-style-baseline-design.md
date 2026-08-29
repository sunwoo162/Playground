# Luna Visual Style Baseline Design

## Status

Approved product direction: **every future Luna Agent System project with a user-facing interface should inherit the current BloomBouquet visual style by default, while its information architecture and page layout remain product-specific.**

This is an organization-level Luna policy, not a shared page template. The goal is that different Luna products can look like members of the same product family without becoming copies of BloomBouquet.

## Goals

1. Make the approved BloomBouquet visual language the persistent default for future Luna user-facing projects.
2. Re-apply the baseline automatically on every fresh Luna planning/task execution instead of relying on chat memory or a one-off prompt.
3. Keep layout, navigation model, information hierarchy, page composition, and content structure specific to each product.
4. Document the policy in `.github` so manual Codex/GitHub Agent work and repository contributors see the same rule.
5. Give Design System, Designer, Frontend, Code Review, Reviewer, Accessibility, and PM enough role-specific guidance to apply or verify the baseline.
6. Prevent documentation/runtime drift with policy tests.
7. Preserve Product Owner overrides: an explicit user-provided brand/style direction takes precedence over the default baseline.

## Non-goals

- Do not force the BloomBouquet Showcase layout, 3-column gallery, hero placement, 1280px container, detail-page structure, or report-page structure onto other products.
- Do not copy BloomBouquet React components or DOM structure into every generated project.
- Do not create a mandatory shared React/CSS package that all generated repositories depend on.
- Do not restyle all existing Luna projects retroactively in this change.
- Do not make every product use identical component dimensions where product context requires a different density or interaction model.
- Do not add a new unattended BloomBouquet machine-registration protocol in this change; the existing Luna → BloomBouquet registration handoff remains a separate concern.
- Do not let the baseline override accessibility, security, native-platform conventions, or an explicit Product Owner design decision.

## Why this belongs in runtime policy

Today the headless executor injects `seniorAgentContext(role)` into each Agent task summary before dispatch. That makes senior behavior persistent across new runs, but there is no equivalent persistent visual-style instruction. A design preference remembered in one chat therefore cannot be relied on for a later builder run.

The runtime also exposes dedicated `design-system`, `designer`, `frontend`, `code-review`, `reviewer`, and `accessibility` roles. The visual baseline should be injected selectively into the roles that design, implement, or verify user-facing UI instead of being pasted into unrelated backend/DevOps work.

## Visual language

The default Luna product-family style is derived from the currently approved BloomBouquet UI.

### Color

Default web palette:

- page/background: `#ffffff`
- primary text: `#171719`
- muted text: `#6b6b6e`
- subtle secondary text may use a lighter neutral such as `#979799`
- primary divider/border: `#dfe0e2`
- soft neutral surface: approximately `#f2f2f2` to `#f6f6f5`
- restrained accent green: `#2d5a3d`

The green is an accent, not a page-filling brand color. Semantic success/warning/error colors remain allowed when the product needs them.

An explicit Product Owner brand palette can replace these colors. Reviewers should then preserve the baseline's restrained contrast, hierarchy, and surface principles rather than forcing the BloomBouquet hex values back in.

### Typography

Preferred web font family:

- Pretendard when Korean UI is primary and font delivery is already supported by the project
- Inter or a compatible modern system sans fallback where appropriate

Default principles:

- compact product typography rather than oversized marketing typography
- primary heading weight generally around 600–650
- body text should remain comfortably readable; do not shrink supporting UI below practical readability merely to increase density
- tight negative tracking is allowed on large Latin headings but should be restrained for Korean text
- line height should follow reading length and content density rather than a fixed universal value

BloomBouquet's current scale is a reference, not a mandatory template:

- large web hero: roughly up to the low/mid-60px range on wide screens when the page genuinely needs a hero
- mobile hero: roughly low/mid-40px range
- body/copy: roughly 14–16px
- normal card/list title: roughly 18–22px
- dense supporting text: generally 10–13px; avoid pushing important information below this range

Dashboard, mobile, desktop-native, data-heavy, and content-heavy products may use a different scale when the task requires it.

### Surfaces and controls

Default feel:

- flat surfaces
- 1px neutral borders
- square or small-radius controls/cards
- little or no box shadow
- black/near-black primary actions
- white or neutral secondary actions
- clear focus-visible states
- restrained transitions
- strong information hierarchy through spacing, typography, border, and alignment rather than decorative effects

Avoid by default:

- glassmorphism
- decorative blur layers
- heavy shadows
- excessive gradients
- large-radius rounded-card/Bento styling as a generic default
- excessive pills for ordinary buttons or metadata
- giant hero typography that dominates the usable interface
- arbitrary decoration that is not tied to product meaning

These are defaults, not bans. A Product Owner request or a product concept can justify a different treatment when the Agent records the reason.

## Layout freedom

The baseline intentionally does **not** define layout.

Examples:

- commerce: product catalog, filters, cart, product-detail layout appropriate to shopping
- dashboard: sidebar/topbar, dense table, charts, workspace panels
- community: feed, composer, profile, thread hierarchy
- booking/service: search, availability, detail, checkout/reservation flow
- landing site: hero and narrative sections when a landing page is actually needed
- developer tool: compact workspace, editor/table/console patterns

Agents must derive layout from the user's job, interaction frequency, content type, device, and workflow. A Code Review or Reviewer finding must not say “make it look more like BloomBouquet” merely because the layout differs.

## Policy precedence

The application order is:

1. Safety, security, accessibility, platform constraints, and objective usability requirements.
2. Explicit Product Owner design/brand/reference-site decisions.
3. Project-specific design-system decisions supported by product requirements.
4. Luna Visual Style Baseline as the default when the higher-priority layers do not specify otherwise.

If the Product Owner gives a reference site or visual direction, Agents follow that direction where it conflicts with the baseline and retain the baseline only for unspecified details.

## Runtime architecture

### New policy module

Add:

`bloom-runtime/ts/lunaVisualStyle.ts`

It will export a versioned `LUNA_VISUAL_STYLE_BASELINE` object and helpers that produce concise role instructions.

The module owns machine-consumable policy facts such as:

- baseline version
- default palette
- typography principles
- surface/control principles
- explicit layout-freedom rule
- Product Owner override precedence
- roles that receive implementation guidance
- roles that receive review guidance

The runtime prompt should be concise enough to avoid drowning out the task-specific contract.

### PM planning context

The PM must know that a user-facing plan needs product-specific layout plus the Luna visual baseline. The implementation should add a concise planning constraint to the PM request/context for user-facing web builds so PM can include Design System/Designer/Frontend work appropriately without copying BloomBouquet page composition.

The original Product Owner request remains separately available and must not be rewritten or treated as lower priority.

### Task dispatch context

`bloom-runtime/ts/headlessBuilderExecutor.ts` currently composes each task summary from the common senior context plus the PM task summary.

Change that composition to include role-specific Luna visual-style context when applicable.

Implementation-focused UI roles:

- `design-system`
- `designer`
- `frontend`
- `accessibility` when the task is user-interface work

Review-focused roles:

- `code-review`
- `reviewer`
- `qa` when reviewing the user-facing release

The review guidance should verify consistency, readability, responsive behavior, focus/accessibility, restrained visual effects, and whether any deviation is justified by the Product Owner/project. It must not mechanically require exact BloomBouquet dimensions.

Backend/database/security/DevOps/API-integration/Data & Marketing/Documentation tasks do not need the full style prompt unless the concrete task itself owns user-facing UI.

### Existing workers and future runs

The baseline is applied at prompt composition time. Therefore every fresh Luna builder task after the runtime update receives the current version automatically.

Already-running Codex turns are not mutated in place. Existing repositories are not silently restyled. A later task on an existing project can opt into the current baseline, while explicit project-local design decisions remain evidence that Reviewers must consider.

## Repository documentation

### `.github/LUNA_VISUAL_STYLE_BASELINE.md`

Create a human- and Agent-readable policy document under `.github` containing:

- purpose
- style principles
- palette
- typography guidance
- surface/control guidance
- layout-freedom rule
- override precedence
- examples of acceptable product-specific layouts
- review checklist
- explicit statement that this is the default for future Luna Agent System UI projects

This gives repository-level agents a stable rule even when they are not being launched through the headless runtime.

### Root `AGENTS.md`

Add a short instruction that new Luna/user-facing app work must read and apply `.github/LUNA_VISUAL_STYLE_BASELINE.md`, while preserving product-specific layout and explicit Product Owner overrides.

Do not duplicate the entire baseline in `AGENTS.md`; keep one discoverable link to reduce drift.

### Runtime docs

Update:

- `bloom-runtime/docs/AGENT_RUNTIME_POLICY.md`
- `bloom-runtime/docs/PROJECT_TEAMS.md`

They should state that the visual baseline is versioned, injected into relevant runtime roles, documented under `.github`, and subordinate to explicit Product Owner direction/accessibility/platform constraints.

Any stale path references to the senior baseline encountered in the touched sections should be corrected to the actual `bloom-runtime/ts/...` location rather than copied forward.

## Drift control

The runtime module and `.github` documentation represent the same policy in two forms, so regression tests must prevent silent divergence on the core invariants.

Add `bloom-runtime/ts/lunaVisualStyle.policy-test.ts` and include it in `bloom-runtime/tsconfig.policy-tests.json`.

Minimum policy assertions:

1. Baseline is versioned.
2. Default palette contains `#ffffff`, `#171719`, `#6b6b6e`, `#dfe0e2`, and `#2d5a3d`.
3. Runtime guidance explicitly says layout is product-specific and must not copy BloomBouquet layout.
4. Runtime guidance states explicit Product Owner style direction overrides the default baseline.
5. `design-system`, `designer`, and `frontend` receive implementation guidance.
6. `code-review` and `reviewer` receive verification guidance.
7. A backend-only role does not receive the full UI implementation prompt by default.
8. Headless task composition actually carries the visual context for an eligible role.
9. Existing senior-agent context remains present.
10. `.github/LUNA_VISUAL_STYLE_BASELINE.md`, `AGENTS.md`, and runtime policy docs contain required baseline references/core anchor terms.

The test may inspect repository text for documentation anchors, but should avoid brittle byte-for-byte duplication checks.

## Testing and verification

Implementation should follow TDD:

1. Add policy tests that fail because the visual module/documentation/injection do not exist.
2. Implement the module and runtime composition.
3. Add/update documentation and integration assertions.
4. Run Bloom policy tests.
5. Build the Bloom headless worker TypeScript target.
6. Run the repository Harness.
7. Review the main diff for accidental changes to backend APIs, BloomBouquet evaluation, registration handoff, or generated-project layout assumptions.

Expected verification commands/workflows include the existing Bloom policy-test compilation/runner, worker build, and Harness rather than inventing a new test framework.

## Rollout and deployment

This change alters Luna builder runtime behavior, so merge completion requires:

- exact-head PR Harness success
- merge to `main`
- main Harness success
- Bloom Worker deployment success if triggered by the existing workflow

A web-server deployment is not required merely for documentation/runtime prompt changes unless the repository's existing workflow determines otherwise.

The new policy becomes the default for future fresh Luna Agent System runs after the runtime containing it is deployed. It does not retroactively claim that older generated apps already follow the baseline.

## Completion criteria

This feature is complete when:

- the baseline is documented in `.github`
- root Agent instructions reference it
- runtime policy exports a versioned baseline
- relevant PM/task roles receive it automatically
- review roles verify it without enforcing BloomBouquet layout
- Product Owner overrides are encoded and tested
- Bloom policy tests and worker build pass
- Harness passes before and after merge
- the deployed Luna/Bloom worker contains the merged runtime when the worker deployment workflow applies
