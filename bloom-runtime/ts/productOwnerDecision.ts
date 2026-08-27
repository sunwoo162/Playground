import { recordAgentDecision } from "./store";
import type { AgentDecision, ProjectTeamsState } from "./types";

const PRODUCT_OWNER_AGENT_ID = "product-owner";
const ACTION_PREFIX = "resolve-needs-human:";

export function getProductOwnerDecision(
  state: ProjectTeamsState,
  projectId: string,
  routeId: string,
): AgentDecision | null {
  return state.decisions.find(
    (decision) =>
      decision.projectId === projectId
      && decision.agentId === PRODUCT_OWNER_AGENT_ID
      && decision.action === `${ACTION_PREFIX}${routeId}`,
  ) ?? null;
}

export function recordProductOwnerRecoveryDecision(
  state: ProjectTeamsState,
  projectId: string,
  routeId: string,
  decisionText: string,
) {
  const normalizedDecision = decisionText.trim();
  if (!normalizedDecision) {
    throw new Error("Product Owner 결정을 입력해 주세요.");
  }
  if (normalizedDecision.length > 2000) {
    throw new Error("Product Owner 결정은 2000자 이하로 입력해 주세요.");
  }

  const project = state.projects.find((item) => item.id === projectId);
  const route = project?.failureRoutes?.find((item) => item.id === routeId) ?? null;
  if (!project || !route || route.route !== "needs-human") {
    throw new Error("Product Owner 결정을 기다리는 Failure Route를 찾을 수 없습니다.");
  }

  return recordAgentDecision(state, {
    projectId,
    agentId: PRODUCT_OWNER_AGENT_ID,
    action: `${ACTION_PREFIX}${route.id}`,
    rationaleSummary: normalizedDecision,
    evidence: [
      `Failure route ${route.id}: ${route.summary}`,
      `Requested decision: ${route.recommendedAction}`,
    ],
    alternativesConsidered: [],
    sourceAgentIds: [route.routerAgentId],
  });
}
