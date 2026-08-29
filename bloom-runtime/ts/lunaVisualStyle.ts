import type { ExecutableAgentRole } from "./types";

const IMPLEMENTATION_ROLES = new Set<ExecutableAgentRole>([
  "design-system",
  "designer",
  "frontend",
  "accessibility",
]);

const REVIEW_ROLES = new Set<ExecutableAgentRole>([
  "code-review",
  "reviewer",
  "qa",
]);

export const LUNA_VISUAL_STYLE_BASELINE = {
  id: "luna-visual-style" as const,
  version: "1.0.0",
  palette: {
    background: "#ffffff",
    text: "#171719",
    muted: "#6b6b6e",
    border: "#dfe0e2",
    accent: "#2d5a3d",
  },
  implementationRoles: [...IMPLEMENTATION_ROLES],
  reviewRoles: [...REVIEW_ROLES],
  summary: "BloomBouquet에서 확정한 절제된 editorial visual language를 Luna user-facing 프로젝트의 기본값으로 사용하되 레이아웃은 제품별로 독립 설계합니다.",
} as const;

function baselineHeader() {
  return `[Luna visual style baseline ${LUNA_VISUAL_STYLE_BASELINE.version}]`;
}

function paletteLine() {
  const { background, text, muted, border, accent } = LUNA_VISUAL_STYLE_BASELINE.palette;
  return `Default palette when Product Owner branding is unspecified: background ${background}, text ${text}, muted ${muted}, border ${border}, restrained accent ${accent}.`;
}

const PRECEDENCE = "Explicit Product Owner design, brand, or reference-site direction overrides this default baseline where they conflict; accessibility, security, platform constraints, and objective usability requirements override aesthetic defaults.";
const LAYOUT_FREEDOM = "Use a product-specific layout derived from the user job, content, device, and workflow. Do not copy BloomBouquet layout, showcase grid, hero placement, container width, detail layout, or report layout.";
const STYLE_DEFAULTS = "Prefer compact readable typography, Pretendard for Korean-first UI when appropriate, Inter/system sans fallbacks, flat surfaces, 1px neutral borders, square or small-radius controls, little or no shadow, near-black primary actions, restrained transitions, and hierarchy through spacing/typography/alignment rather than decoration.";
const STYLE_AVOIDS = "Avoid generic glassmorphism, decorative blur, heavy shadows, excessive gradients, large-radius Bento cards everywhere, excessive pills, and giant hero typography unless the product concept or Product Owner explicitly justifies them.";

export function lunaVisualStylePlanningContext(userFacing: boolean) {
  if (!userFacing) return "";
  return [
    baselineHeader(),
    "Planning constraint for user-facing work:",
    paletteLine(),
    LAYOUT_FREEDOM,
    STYLE_DEFAULTS,
    STYLE_AVOIDS,
    PRECEDENCE,
    "Plan Design System, Designer, Frontend, Accessibility, review, and QA work only where the product actually needs it; do not manufacture a BloomBouquet-shaped information architecture.",
  ].join("\n");
}

export function lunaVisualStyleTaskContext(role: ExecutableAgentRole) {
  if (IMPLEMENTATION_ROLES.has(role)) {
    return [
      baselineHeader(),
      `Implementation guidance for role: ${role}`,
      paletteLine(),
      LAYOUT_FREEDOM,
      STYLE_DEFAULTS,
      STYLE_AVOIDS,
      PRECEDENCE,
      "Build a coherent project-local token/component layer appropriate to the chosen technology. Do not import or recreate BloomBouquet DOM/component structure merely for visual similarity.",
      "Preserve readable text, responsive behavior, practical touch targets, semantic structure, keyboard/focus behavior, and reduced-motion needs.",
    ].join("\n");
  }

  if (REVIEW_ROLES.has(role)) {
    return [
      baselineHeader(),
      `Review guidance for role: ${role}`,
      "Verify that the UI keeps a product-specific layout rather than copying BloomBouquet layout.",
      "Verify compact but readable hierarchy, consistent 1px-border/flat-surface treatment, restrained accent/effects, responsive behavior, focus/accessibility, and justification for material deviations.",
      PRECEDENCE,
      "Do not require exact BloomBouquet dimensions, page composition, or component sizes as a universal rule.",
    ].join("\n");
  }

  return "";
}
