use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
};

const MARKET_SCHEMA: &str = r#"{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["marketSummary", "searchQueries", "sources", "signals", "opportunities", "gaps", "rationaleSummary"],
  "properties": {
    "marketSummary": { "type": "string", "minLength": 1, "maxLength": 1800 },
    "searchQueries": {
      "type": "array",
      "minItems": 2,
      "maxItems": 20,
      "items": { "type": "string", "minLength": 1, "maxLength": 300 }
    },
    "sources": {
      "type": "array",
      "minItems": 3,
      "maxItems": 30,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "title", "url", "checkedAt", "supports"],
        "properties": {
          "id": { "type": "string", "pattern": "^SRC-[0-9]{3}$" },
          "title": { "type": "string", "minLength": 1, "maxLength": 300 },
          "url": { "type": "string", "minLength": 8, "maxLength": 1200 },
          "checkedAt": { "type": "string", "minLength": 10, "maxLength": 80 },
          "supports": { "type": "string", "minLength": 1, "maxLength": 800 }
        }
      }
    },
    "signals": {
      "type": "array",
      "minItems": 3,
      "maxItems": 30,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["category", "summary", "sourceIds"],
        "properties": {
          "category": { "type": "string", "enum": ["pain", "demand", "competition", "distribution", "monetization", "constraint"] },
          "summary": { "type": "string", "minLength": 1, "maxLength": 1000 },
          "sourceIds": {
            "type": "array",
            "minItems": 1,
            "maxItems": 10,
            "items": { "type": "string", "pattern": "^SRC-[0-9]{3}$" }
          }
        }
      }
    },
    "opportunities": {
      "type": "array",
      "minItems": 3,
      "maxItems": 8,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "problem", "targetUser", "jobToBeDone", "evidenceSummary", "sourceIds", "competitionSummary", "distributionAngles", "monetizationHypotheses", "risks"],
        "properties": {
          "id": { "type": "string", "pattern": "^OPP-[0-9]{3}$" },
          "problem": { "type": "string", "minLength": 1, "maxLength": 700 },
          "targetUser": { "type": "string", "minLength": 1, "maxLength": 400 },
          "jobToBeDone": { "type": "string", "minLength": 1, "maxLength": 600 },
          "evidenceSummary": { "type": "string", "minLength": 1, "maxLength": 1200 },
          "sourceIds": {
            "type": "array",
            "minItems": 1,
            "maxItems": 12,
            "items": { "type": "string", "pattern": "^SRC-[0-9]{3}$" }
          },
          "competitionSummary": { "type": "string", "minLength": 1, "maxLength": 900 },
          "distributionAngles": {
            "type": "array",
            "maxItems": 8,
            "items": { "type": "string", "minLength": 1, "maxLength": 400 }
          },
          "monetizationHypotheses": {
            "type": "array",
            "maxItems": 6,
            "items": { "type": "string", "minLength": 1, "maxLength": 400 }
          },
          "risks": {
            "type": "array",
            "maxItems": 10,
            "items": { "type": "string", "minLength": 1, "maxLength": 500 }
          }
        }
      }
    },
    "gaps": {
      "type": "array",
      "maxItems": 15,
      "items": { "type": "string", "minLength": 1, "maxLength": 600 }
    },
    "rationaleSummary": { "type": "string", "minLength": 1, "maxLength": 1600 }
  }
}"#;

const IDEA_SCHEMA: &str = r#"{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["ideas", "recommendedIdeaId", "portfolioRationale"],
  "properties": {
    "ideas": {
      "type": "array",
      "minItems": 3,
      "maxItems": 5,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "title", "oneLiner", "targetUser", "problem", "solution", "coreFeatures", "differentiation", "marketEvidenceSourceIds", "goToMarketAngle", "monetizationHypotheses", "buildComplexity", "decision", "risks", "rationaleSummary"],
        "properties": {
          "id": { "type": "string", "pattern": "^IDEA-[0-9]{3}$" },
          "title": { "type": "string", "minLength": 1, "maxLength": 120 },
          "oneLiner": { "type": "string", "minLength": 1, "maxLength": 300 },
          "targetUser": { "type": "string", "minLength": 1, "maxLength": 400 },
          "problem": { "type": "string", "minLength": 1, "maxLength": 700 },
          "solution": { "type": "string", "minLength": 1, "maxLength": 900 },
          "coreFeatures": {
            "type": "array",
            "minItems": 2,
            "maxItems": 8,
            "items": { "type": "string", "minLength": 1, "maxLength": 300 }
          },
          "differentiation": { "type": "string", "minLength": 1, "maxLength": 800 },
          "marketEvidenceSourceIds": {
            "type": "array",
            "minItems": 1,
            "maxItems": 12,
            "items": { "type": "string", "pattern": "^SRC-[0-9]{3}$" }
          },
          "goToMarketAngle": { "type": "string", "minLength": 1, "maxLength": 800 },
          "monetizationHypotheses": {
            "type": "array",
            "maxItems": 6,
            "items": { "type": "string", "minLength": 1, "maxLength": 400 }
          },
          "buildComplexity": { "type": "string", "enum": ["small", "medium", "large"] },
          "decision": { "type": "string", "enum": ["build", "explore", "watch"] },
          "risks": {
            "type": "array",
            "maxItems": 10,
            "items": { "type": "string", "minLength": 1, "maxLength": 500 }
          },
          "rationaleSummary": { "type": "string", "minLength": 1, "maxLength": 1200 }
        }
      }
    },
    "recommendedIdeaId": { "type": "string", "pattern": "^IDEA-[0-9]{3}$" },
    "portfolioRationale": { "type": "string", "minLength": 1, "maxLength": 1600 }
  }
}"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSource {
    id: String,
    title: String,
    url: String,
    checked_at: String,
    supports: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSignal {
    category: String,
    summary: String,
    source_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketOpportunity {
    id: String,
    problem: String,
    target_user: String,
    job_to_be_done: String,
    evidence_summary: String,
    source_ids: Vec<String>,
    competition_summary: String,
    distribution_angles: Vec<String>,
    monetization_hypotheses: Vec<String>,
    risks: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketDiscoveryAnalysis {
    market_summary: String,
    search_queries: Vec<String>,
    sources: Vec<MarketSource>,
    signals: Vec<MarketSignal>,
    opportunities: Vec<MarketOpportunity>,
    gaps: Vec<String>,
    rationale_summary: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductIdea {
    id: String,
    title: String,
    one_liner: String,
    target_user: String,
    problem: String,
    solution: String,
    core_features: Vec<String>,
    differentiation: String,
    market_evidence_source_ids: Vec<String>,
    go_to_market_angle: String,
    monetization_hypotheses: Vec<String>,
    build_complexity: String,
    decision: String,
    risks: Vec<String>,
    rationale_summary: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeaPortfolio {
    ideas: Vec<ProductIdea>,
    recommended_idea_id: String,
    portfolio_rationale: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketDiscoveryResult {
    discovery_id: String,
    topic: String,
    market: MarketDiscoveryAnalysis,
    portfolio: IdeaPortfolio,
    market_session_id: Option<String>,
    idea_session_id: Option<String>,
    market_events_path: String,
    market_output_path: String,
    idea_events_path: String,
    idea_output_path: String,
}

fn validate_identifier(value: &str, label: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 120 {
        return Err(format!("{label} 값이 올바르지 않습니다."));
    }
    if !value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err(format!("{label} 값에 사용할 수 없는 문자가 있습니다."));
    }
    Ok(())
}

fn valid_http_url(value: &str) -> bool {
    value.starts_with("https://") || value.starts_with("http://")
}

fn validate_market(market: &MarketDiscoveryAnalysis) -> Result<(), String> {
    if market.sources.len() < 3 {
        return Err("Market Discovery는 최소 3개 공개 출처가 필요합니다.".to_string());
    }
    if market.opportunities.len() < 3 {
        return Err("Market Discovery는 최소 3개 시장 기회를 반환해야 합니다.".to_string());
    }

    let source_ids = market.sources.iter().map(|source| source.id.as_str()).collect::<HashSet<_>>();
    if source_ids.len() != market.sources.len() {
        return Err("Market Discovery source ID가 중복되었습니다.".to_string());
    }
    for source in &market.sources {
        if !valid_http_url(&source.url) {
            return Err(format!("Market Discovery source URL 형식이 잘못되었습니다: {}", source.url));
        }
    }
    for signal in &market.signals {
        if signal.source_ids.iter().any(|id| !source_ids.contains(id.as_str())) {
            return Err("Market signal이 존재하지 않는 source ID를 참조합니다.".to_string());
        }
    }
    for opportunity in &market.opportunities {
        if opportunity.source_ids.is_empty()
            || opportunity.source_ids.iter().any(|id| !source_ids.contains(id.as_str()))
        {
            return Err(format!("{} 시장 기회의 source 근거가 유효하지 않습니다.", opportunity.id));
        }
    }
    Ok(())
}

fn validate_portfolio(portfolio: &IdeaPortfolio, market: &MarketDiscoveryAnalysis) -> Result<(), String> {
    if !(3..=5).contains(&portfolio.ideas.len()) {
        return Err("Idea Agent는 3~5개 프로젝트 후보를 반환해야 합니다.".to_string());
    }
    if !portfolio.ideas.iter().any(|idea| idea.id == portfolio.recommended_idea_id) {
        return Err("recommendedIdeaId가 ideas에 존재하지 않습니다.".to_string());
    }
    let source_ids = market.sources.iter().map(|source| source.id.as_str()).collect::<HashSet<_>>();
    let mut idea_ids = HashSet::new();
    for idea in &portfolio.ideas {
        if !idea_ids.insert(idea.id.as_str()) {
            return Err("Idea ID가 중복되었습니다.".to_string());
        }
        if idea.market_evidence_source_ids.is_empty()
            || idea.market_evidence_source_ids.iter().any(|id| !source_ids.contains(id.as_str()))
        {
            return Err(format!("{} 프로젝트 아이디어의 시장 evidence 참조가 유효하지 않습니다.", idea.id));
        }
    }
    Ok(())
}

fn market_prompt(organization: &str, discovery_id: &str, topic: &str) -> String {
    format!(
        r#"You are Luna organization-level Data & Marketing Agent `organization:data-marketing`.
Operate at the quality bar expected from a practitioner with at least 10 years of relevant product-growth, market-research, analytics, and go-to-market experience. This is an operating standard, not permission to invent human employment history or evidence.

Discovery ID: {discovery_id}
Organization: {organization}
Product Owner discovery topic:
{topic}

This is market discovery before a delivery team or project repository exists. Do not fabricate live web evidence in the local runtime to inspect current public evidence. Search broadly enough to avoid anchoring on one result, but keep the report decision-useful.

Required research behavior:
- Find repeated user pains, demand/search/community signals, existing alternatives and competition, distribution opportunities, monetization evidence/hypotheses, and meaningful constraints.
- Prefer primary sources, official documentation/data, reputable research, product pages, and direct community evidence over SEO farms or unsourced summaries.
- Record every external source with a stable URL and the date/time checked. Never invent a URL or source.
- Distinguish observed source facts from inference and experiment hypotheses.
- Never invent market size, traffic, MAU, revenue, conversion, CAC, LTV, retention, growth, search volume, or competitor performance.
- If reliable numeric evidence is unavailable, say so in gaps instead of estimating a fake number.
- Do not create a project yet. Identify evidence-backed opportunity spaces for the independent Idea Agent.
- Do not modify repositories, branches, PRs, issues, deployments, accounts, or external data.
- Treat privacy, legal/platform constraints, data access, seasonality, and acquisition difficulty as real risks when relevant.

Return only JSON matching the supplied schema. Every signal and opportunity must cite one or more source IDs from your own source list.
"#
    )
}

fn idea_prompt(discovery_id: &str, topic: &str, market_json: &str) -> String {
    format!(
        r#"You are Luna organization-level Idea Agent `organization:idea`.
Operate at the quality bar expected from a practitioner with at least 10 years of product discovery and software-product strategy experience. This is an operating standard, not a claim of human employment history.

Discovery ID: {discovery_id}
Original discovery topic:
{topic}

Independent-agent contract:
- The Data & Marketing analysis below is evidence input, not authority. Check internal consistency and reject weak opportunities instead of blindly turning every finding into a product.
- Do not perform a new market search in this turn. Use only the supplied market evidence so source provenance remains auditable.
- Generate 3 to 5 concrete software product ideas that a Luna delivery team could actually build and operate.
- Prefer real recurring user jobs and defensible distribution over novelty for novelty's sake.
- Each idea must cite source IDs from the market report.
- `decision=build` means evidence is strong enough for Product Owner consideration, not automatic approval or guaranteed success.
- Use `explore` when a key uncertainty should be validated first, and `watch` when timing/evidence is insufficient.
- Do not invent market metrics, user research, APIs, legal permissions, data access, or monetization proof.
- Keep MVP scope concrete, but account for production persistence, auth, failure states, security, accessibility, operations, and external dependencies when relevant.
- Product Owner retains final selection. Do not start a repository or delivery team.

Market evidence JSON:
{market_json}

Return only JSON matching the supplied schema.
"#
    )
}

fn run_market_discovery_blocking(
    organization: String,
    workspace_root: String,
    discovery_id: String,
    topic: String,
) -> Result<MarketDiscoveryResult, String> {
    validate_identifier(organization.trim(), "Organization")?;
    validate_identifier(discovery_id.trim(), "Discovery ID")?;
    if workspace_root.trim().is_empty() {
        return Err("Workspace root를 먼저 설정해 주세요.".to_string());
    }
    if topic.trim().is_empty() {
        return Err("시장 탐색 주제가 비어 있습니다.".to_string());
    }
    Err(
        "Local-only Bloom Runtime does not perform live web market research. Use ChatGPT to review current public evidence, then provide the reviewed product direction to Luna."
            .to_string(),
    )
}

#[tauri::command]
pub async fn run_market_discovery(
    organization: String,
    workspace_root: String,
    discovery_id: String,
    topic: String,
) -> Result<MarketDiscoveryResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_market_discovery_blocking(organization, workspace_root, discovery_id, topic)
    })
    .await
    .map_err(|error| format!("Market Discovery worker join 실패: {error}"))?
}
