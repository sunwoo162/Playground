import { invoke } from "@tauri-apps/api/core";

import type { OrganizationRuntimeSettings } from "./organization";

const STORAGE_KEY = "luna.market-discovery.v1";
const MAX_STORED_DISCOVERIES = 10;

export type MarketSource = {
  id: string;
  title: string;
  url: string;
  checkedAt: string;
  supports: string;
};

export type MarketSignal = {
  category: "pain" | "demand" | "competition" | "distribution" | "monetization" | "constraint";
  summary: string;
  sourceIds: string[];
};

export type MarketOpportunity = {
  id: string;
  problem: string;
  targetUser: string;
  jobToBeDone: string;
  evidenceSummary: string;
  sourceIds: string[];
  competitionSummary: string;
  distributionAngles: string[];
  monetizationHypotheses: string[];
  risks: string[];
};

export type MarketDiscoveryAnalysis = {
  marketSummary: string;
  searchQueries: string[];
  sources: MarketSource[];
  signals: MarketSignal[];
  opportunities: MarketOpportunity[];
  gaps: string[];
  rationaleSummary: string;
};

export type ProductIdea = {
  id: string;
  title: string;
  oneLiner: string;
  targetUser: string;
  problem: string;
  solution: string;
  coreFeatures: string[];
  differentiation: string;
  marketEvidenceSourceIds: string[];
  goToMarketAngle: string;
  monetizationHypotheses: string[];
  buildComplexity: "small" | "medium" | "large";
  decision: "build" | "explore" | "watch";
  risks: string[];
  rationaleSummary: string;
};

export type IdeaPortfolio = {
  ideas: ProductIdea[];
  recommendedIdeaId: string;
  portfolioRationale: string;
};

export type MarketDiscoveryResult = {
  discoveryId: string;
  topic: string;
  market: MarketDiscoveryAnalysis;
  portfolio: IdeaPortfolio;
  marketSessionId: string | null;
  ideaSessionId: string | null;
  marketEventsPath: string;
  marketOutputPath: string;
  ideaEventsPath: string;
  ideaOutputPath: string;
};

export type StoredMarketDiscovery = MarketDiscoveryResult & {
  createdAt: string;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function createDiscoveryId() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DISCOVERY-${time}-${random}`;
}

export function loadMarketDiscoveries(): StoredMarketDiscovery[] {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredMarketDiscovery[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) =>
      Boolean(item?.discoveryId && item?.topic && item?.market && item?.portfolio),
    );
  } catch {
    return [];
  }
}

export function saveMarketDiscovery(result: MarketDiscoveryResult): StoredMarketDiscovery {
  const stored: StoredMarketDiscovery = {
    ...result,
    createdAt: new Date().toISOString(),
  };
  if (canUseStorage()) {
    const existing = loadMarketDiscoveries().filter(
      (item) => item.discoveryId !== result.discoveryId,
    );
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([stored, ...existing].slice(0, MAX_STORED_DISCOVERIES)),
    );
  }
  return stored;
}

export async function runMarketDiscovery(
  runtimeSettings: OrganizationRuntimeSettings,
  topic: string,
): Promise<StoredMarketDiscovery> {
  const normalizedTopic = topic.trim();
  if (!normalizedTopic) {
    throw new Error("시장 탐색 주제를 입력해 주세요.");
  }
  if (!runtimeSettings.workspaceRoot.trim()) {
    throw new Error("Workspace root를 먼저 설정해 주세요.");
  }

  const discoveryId = createDiscoveryId();
  const result = await invoke<MarketDiscoveryResult>("run_market_discovery", {
    organization: runtimeSettings.organization,
    workspaceRoot: runtimeSettings.workspaceRoot,
    discoveryId,
    topic: normalizedTopic,
  });

  if (result.discoveryId !== discoveryId) {
    throw new Error("Market Discovery Runtime 결과 ID가 요청과 일치하지 않습니다.");
  }
  if (!result.portfolio.ideas.some((idea) => idea.id === result.portfolio.recommendedIdeaId)) {
    throw new Error("Market Discovery 추천 아이디어가 후보 목록에 존재하지 않습니다.");
  }

  return saveMarketDiscovery(result);
}

export function marketSourceById(
  discovery: StoredMarketDiscovery,
  sourceId: string,
) {
  return discovery.market.sources.find((source) => source.id === sourceId) ?? null;
}

export function buildDiscoveryProjectRequest(
  discovery: StoredMarketDiscovery,
  idea: ProductIdea,
) {
  const sources = idea.marketEvidenceSourceIds
    .map((sourceId) => marketSourceById(discovery, sourceId))
    .filter((source): source is MarketSource => Boolean(source));

  return [
    `[Luna Market Discovery ${discovery.discoveryId}]`,
    `Discovery topic: ${discovery.topic}`,
    `Selected idea: ${idea.title}`,
    `Decision signal: ${idea.decision}`,
    `Build complexity hypothesis: ${idea.buildComplexity}`,
    "",
    "Product concept:",
    idea.oneLiner,
    "",
    `Primary user: ${idea.targetUser}`,
    `Problem: ${idea.problem}`,
    `Proposed solution: ${idea.solution}`,
    `Differentiation hypothesis: ${idea.differentiation}`,
    `Initial go-to-market angle: ${idea.goToMarketAngle}`,
    "",
    "Core features:",
    ...idea.coreFeatures.map((feature) => `- ${feature}`),
    "",
    "Known risks / validation needs:",
    ...(idea.risks.length > 0 ? idea.risks.map((risk) => `- ${risk}`) : ["- none recorded"]),
    "",
    "Market evidence references (must be rechecked by downstream Agents; not Product Owner guarantees):",
    ...sources.map(
      (source) => `- ${source.id} ${source.title} | ${source.url} | checked ${source.checkedAt} | ${source.supports}`,
    ),
    "",
    `Idea Agent rationale: ${idea.rationaleSummary}`,
    `Market Agent rationale: ${discovery.market.rationaleSummary}`,
    "",
    "Product Owner selected this candidate for project intake. Preserve the concept, but independently verify market claims, technical feasibility, legal/data constraints, external APIs, and production assumptions before implementation.",
  ].join("\n");
}
