use crate::local_inference_runtime;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
};

const MAX_ROUTE_ATTEMPTS: u32 = 3;

const FAILURE_ROUTE_SCHEMA: &str = r#"{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "route",
    "failureType",
    "severity",
    "ownerTaskId",
    "ownerRole",
    "summary",
    "rationaleSummary",
    "evidence",
    "recommendedAction"
  ],
  "properties": {
    "route": {
      "type": "string",
      "enum": ["retry-owner", "escalate-pm", "needs-human"]
    },
    "failureType": {
      "type": "string",
      "enum": [
        "implementation",
        "test",
        "build",
        "dependency",
        "environment",
        "requirements",
        "security",
        "external-service",
        "unknown"
      ]
    },
    "severity": {
      "type": "string",
      "enum": ["low", "medium", "high", "critical"]
    },
    "ownerTaskId": { "type": ["string", "null"] },
    "ownerRole": { "type": ["string", "null"] },
    "summary": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "rationaleSummary": { "type": "string", "minLength": 1, "maxLength": 1600 },
    "evidence": {
      "type": "array",
      "maxItems": 30,
      "items": { "type": "string", "minLength": 1, "maxLength": 600 }
    },
    "recommendedAction": { "type": "string", "minLength": 1, "maxLength": 1200 }
  }
}"#;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailureOwnerCandidate {
    pub task_id: String,
    pub role: String,
    pub title: String,
    pub summary: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailureVerification {
    pub name: String,
    pub status: String,
    pub details: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteAgentFailureInput {
    pub project_id: String,
    pub team_id: String,
    pub team_name: String,
    pub repository_full_name: String,
    pub workspace_path: String,
    pub failed_task_id: String,
    pub failed_role: String,
    pub failure_reason: String,
    #[serde(default)]
    pub blockers: Vec<String>,
    #[serde(default)]
    pub verification: Vec<FailureVerification>,
    pub candidate_owners: Vec<FailureOwnerCandidate>,
    pub route_attempt: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailureRouteDecision {
    pub route: String,
    pub failure_type: String,
    pub severity: String,
    pub owner_task_id: Option<String>,
    pub owner_role: Option<String>,
    pub summary: String,
    pub rationale_summary: String,
    pub evidence: Vec<String>,
    pub recommended_action: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteAgentFailureResult {
    pub project_id: String,
    pub failed_task_id: String,
    pub router_agent_id: String,
    pub session_id: Option<String>,
    pub events_path: String,
    pub output_path: String,
    pub decision: FailureRouteDecision,
}

fn validate_segment(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty()
        || value.len() > 100
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ':'))
    {
        return Err(format!("{label} 형식이 잘못되었습니다."));
    }
    Ok(())
}

fn validate_workspace(workspace: &Path) -> Result<(), String> {
    if !workspace.exists() || !workspace.join(".git").exists() {
        return Err("Failure Router workspace가 Git 저장소가 아닙니다.".to_string());
    }
    Ok(())
}

fn candidates_text(candidates: &[FailureOwnerCandidate]) -> String {
    candidates
        .iter()
        .map(|candidate| {
            format!(
                "- {} [{}] {}\n  {}",
                candidate.task_id, candidate.role, candidate.title, candidate.summary
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn verification_text(items: &[FailureVerification]) -> String {
    if items.is_empty() {
        return "- 없음".to_string();
    }
    items
        .iter()
        .map(|item| format!("- {} [{}] {}", item.name, item.status, item.details))
        .collect::<Vec<_>>()
        .join("\n")
}

fn blockers_text(items: &[String]) -> String {
    if items.is_empty() {
        return "- 없음".to_string();
    }
    items.iter().map(|item| format!("- {item}")).collect::<Vec<_>>().join("\n")
}

fn router_prompt(input: &RouteAgentFailureInput) -> String {
    format!(
        r#"You are Luna Agent `{team_id}:debug-router`, the independent Debug / Problem Router for team {team_name}.

Project: {project_id}
Repository: {repository}
Failed task: {failed_task_id} [{failed_role}]
Failure routing attempt: {route_attempt}/{max_attempts}

Observed failure:
{failure_reason}

Blockers:
{blockers}

Verification evidence:
{verification}

Candidate owner tasks that Luna can safely rewind to:
{candidates}

Your job is diagnosis and routing only. Do not modify files, branches, commits, PRs, tests, or deployment state in this turn.

Independent routing contract:
- Do not blindly trust the failed Agent's summary. Base the decision only on the supplied failure evidence and repository evidence you can inspect read-only.
- Choose `retry-owner` only when one listed candidate task is the defensible repair owner. `ownerTaskId` and `ownerRole` must exactly match that candidate.
- Use `escalate-pm` when the plan/DAG/requirements need replanning or no listed task owns the repair.
- Use `needs-human` for Product Owner decisions, unavailable credentials, destructive/high-risk production actions, legal/compliance choices, or ambiguous product direction.
- Environment/transient failures may route back to the failed task itself if retrying that task is justified.
- For failures found by Code Review/Reviewer/QA, prefer the nearest upstream implementation/documentation task that owns the defect rather than retrying the verifier when evidence identifies a concrete code owner.
- At routing attempt {route_attempt}, if this is the third attempt or later, do not choose `retry-owner`; escalate instead.
- `evidence` must contain concise auditable facts, commands, file/PR/log references, or explicit limitations. Do not expose private chain-of-thought.
- Return only JSON matching the provided output schema.
"#,
        team_id = input.team_id,
        team_name = input.team_name,
        project_id = input.project_id,
        repository = input.repository_full_name,
        failed_task_id = input.failed_task_id,
        failed_role = input.failed_role,
        route_attempt = input.route_attempt,
        max_attempts = MAX_ROUTE_ATTEMPTS,
        failure_reason = input.failure_reason,
        blockers = blockers_text(&input.blockers),
        verification = verification_text(&input.verification),
        candidates = candidates_text(&input.candidate_owners),
    )
}

fn validate_decision(input: &RouteAgentFailureInput, decision: &FailureRouteDecision) -> Result<(), String> {
    if input.route_attempt >= MAX_ROUTE_ATTEMPTS && decision.route == "retry-owner" {
        return Err(format!(
            "Failure Router가 자동 라우팅 한도({MAX_ROUTE_ATTEMPTS}) 이후 retry-owner를 반환했습니다."
        ));
    }

    match decision.route.as_str() {
        "retry-owner" => {
            let owner_task_id = decision
                .owner_task_id
                .as_deref()
                .ok_or_else(|| "retry-owner 결과에 ownerTaskId가 없습니다.".to_string())?;
            let owner_role = decision
                .owner_role
                .as_deref()
                .ok_or_else(|| "retry-owner 결과에 ownerRole이 없습니다.".to_string())?;
            let matched = input
                .candidate_owners
                .iter()
                .any(|candidate| candidate.task_id == owner_task_id && candidate.role == owner_role);
            if !matched {
                return Err(format!(
                    "Failure Router가 허용되지 않은 owner를 선택했습니다: {owner_task_id} [{owner_role}]"
                ));
            }
        }
        "escalate-pm" | "needs-human" => {
            if decision.owner_task_id.is_some() || decision.owner_role.is_some() {
                return Err("escalation 결과에는 ownerTaskId/ownerRole이 null이어야 합니다.".to_string());
            }
        }
        other => return Err(format!("알 수 없는 Failure Router route입니다: {other}")),
    }
    Ok(())
}

fn run_failure_router_blocking(input: RouteAgentFailureInput) -> Result<RouteAgentFailureResult, String> {
    validate_segment(&input.project_id, "Project ID")?;
    validate_segment(&input.team_id, "Team ID")?;
    validate_segment(&input.failed_task_id, "Task ID")?;
    if input.failure_reason.trim().is_empty() {
        return Err("Failure Router에 전달할 실패 원인이 비어 있습니다.".to_string());
    }
    if input.candidate_owners.is_empty() {
        return Err("Failure Router owner 후보가 없습니다.".to_string());
    }
    if input.route_attempt == 0 {
        return Err("Failure Router routeAttempt는 1 이상이어야 합니다.".to_string());
    }

    let workspace = PathBuf::from(input.workspace_path.trim());
    validate_workspace(&workspace)?;

    let runtime_dir = workspace
        .parent()
        .ok_or_else(|| "Project workspace 상위 경로를 찾을 수 없습니다.".to_string())?
        .join(".luna-runtime")
        .join("projects")
        .join(&input.project_id)
        .join("failure-router")
        .join(format!("{}-{}", input.failed_task_id, input.route_attempt));
    fs::create_dir_all(&runtime_dir)
        .map_err(|error| format!("Failure Router runtime directory 생성 실패: {error}"))?;

    let schema_path = runtime_dir.join("failure-route.schema.json");
    let output_path = runtime_dir.join("failure-route.json");
    let events_path = runtime_dir.join("failure-route.events.jsonl");
    fs::write(&schema_path, FAILURE_ROUTE_SCHEMA)
        .map_err(|error| format!("Failure Router schema 저장 실패: {error}"))?;

    let prompt = router_prompt(&input);
    let inference = local_inference_runtime::run_structured_json(
        "failure-router",
        &prompt,
        FAILURE_ROUTE_SCHEMA,
        &workspace,
    )?;
    fs::write(
        &output_path,
        serde_json::to_vec_pretty(&inference.output)
            .map_err(|error| format!("Failure Router serialization failed: {error}"))?,
    )
    .map_err(|error| format!("Failure Router output write failed: {error}"))?;
    fs::write(&events_path, &inference.events_jsonl)
        .map_err(|error| format!("Failure Router event write failed: {error}"))?;
    let decision: FailureRouteDecision = serde_json::from_value(inference.output)
        .map_err(|error| format!("Failure Router JSON parsing failed: {error}"))?;
    validate_decision(&input, &decision)?;

    Ok(RouteAgentFailureResult {
        project_id: input.project_id.clone(),
        failed_task_id: input.failed_task_id.clone(),
        router_agent_id: format!("{}:debug-router", input.team_id),
        session_id: inference.session_id,
        events_path: events_path.to_string_lossy().to_string(),
        output_path: output_path.to_string_lossy().to_string(),
        decision,
    })
}

#[tauri::command]
pub async fn route_agent_failure(
    input: RouteAgentFailureInput,
) -> Result<RouteAgentFailureResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_failure_router_blocking(input))
        .await
        .map_err(|error| format!("Failure Router Runtime join 실패: {error}"))?
}
