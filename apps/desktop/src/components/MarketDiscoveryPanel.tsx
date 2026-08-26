import "../MarketDiscoveryPanel.css";

import type { ProductIdea, StoredMarketDiscovery } from "../projectTeams/marketDiscovery";

function decisionLabel(decision: ProductIdea["decision"]) {
  switch (decision) {
    case "build":
      return "빌드 후보";
    case "explore":
      return "추가 검증";
    case "watch":
    default:
      return "관찰";
  }
}

function complexityLabel(complexity: ProductIdea["buildComplexity"]) {
  switch (complexity) {
    case "small":
      return "Small";
    case "large":
      return "Large";
    case "medium":
    default:
      return "Medium";
  }
}

export function MarketDiscoveryPanel({
  discovery,
  busy,
  onBuild,
}: {
  discovery: StoredMarketDiscovery | null;
  busy: boolean;
  onBuild: (idea: ProductIdea) => void;
}) {
  if (!discovery) {
    return (
      <section className="market-discovery-panel market-discovery-empty">
        <div>
          <span className="project-policy-label">MARKET DISCOVERY</span>
          <h3>시장 근거에서 프로젝트 찾기</h3>
        </div>
        <p>
          <code>/discover 주제</code>를 입력하면 조직 Data &amp; Marketing Agent가 공개 웹 근거를 조사하고,
          독립 Idea Agent가 실제 프로젝트 후보 3~5개로 정리합니다.
        </p>
      </section>
    );
  }

  const recommended = discovery.portfolio.recommendedIdeaId;

  return (
    <section className="market-discovery-panel">
      <div className="market-discovery-heading">
        <div>
          <span className="project-policy-label">MARKET DISCOVERY</span>
          <h3>{discovery.topic}</h3>
        </div>
        <span>{discovery.market.sources.length} sources</span>
      </div>

      <p className="market-discovery-summary">{discovery.market.marketSummary}</p>
      <p className="market-discovery-rationale">{discovery.portfolio.portfolioRationale}</p>

      <div className="market-discovery-ideas" aria-label="시장 기반 프로젝트 후보">
        {discovery.portfolio.ideas.map((idea, index) => {
          const isRecommended = idea.id === recommended;
          return (
            <article className="market-discovery-idea" key={idea.id}>
              <div className="market-discovery-idea-head">
                <div>
                  <span className="market-discovery-index">#{index + 1}</span>
                  <strong>{idea.title}</strong>
                </div>
                <div className="market-discovery-tags">
                  {isRecommended && <span data-kind="recommended">추천</span>}
                  <span data-kind={idea.decision}>{decisionLabel(idea.decision)}</span>
                  <span>{complexityLabel(idea.buildComplexity)}</span>
                </div>
              </div>

              <p>{idea.oneLiner}</p>
              <dl>
                <div>
                  <dt>사용자</dt>
                  <dd>{idea.targetUser}</dd>
                </div>
                <div>
                  <dt>차별점</dt>
                  <dd>{idea.differentiation}</dd>
                </div>
                <div>
                  <dt>초기 유입</dt>
                  <dd>{idea.goToMarketAngle}</dd>
                </div>
              </dl>

              <div className="market-discovery-evidence">
                {idea.marketEvidenceSourceIds.map((sourceId) => {
                  const source = discovery.market.sources.find((item) => item.id === sourceId);
                  return source ? (
                    <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                      {source.id} · {source.title}
                    </a>
                  ) : null;
                })}
              </div>

              <button type="button" disabled={busy} onClick={() => onBuild(idea)}>
                이 아이디어로 프로젝트 시작
              </button>
            </article>
          );
        })}
      </div>

      {discovery.market.gaps.length > 0 && (
        <div className="market-discovery-gaps">
          <strong>아직 확인되지 않은 것</strong>
          <ul>
            {discovery.market.gaps.slice(0, 5).map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
