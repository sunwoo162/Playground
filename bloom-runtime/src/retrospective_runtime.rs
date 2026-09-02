use crate::local_inference_runtime;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
};

const AGENT_RETROSPECTIVE_SCHEMA: &str = r#"{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["wentWell", "problems", "evidence", "nextChanges"],
  "properties": {
    "wentWell": {
      "type": "array",
      "maxItems": 12,
      "items": { "type": "string", "minLength": 1, "maxLength": 500 }
    },
    "problems": {
      "type": "array",
      "maxItems": 12,
      "items": { "type": "string", "minLength": 1, "maxLength": 500 }
    },
    "evidence": {
      "type": "array",
      "maxItems": 20,
      "items": { "type": "string", "minLength": 1, "maxLength": 600 }
    },
    "nextChanges": {
      "type": "array",
      "maxItems": 12,
      "items": { "type": "string", "minLength": 1, "maxLength": 500 }
    }
  }
}"#;

const TEAM_EVOLUTION_SCHEMA: &str = r#"{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["summary", "strengths", "recurringProblems", "playbookChanges", "agentVersionChanges", "evidence"],
  "properties": {
    "summary": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "strengths": {
      "type": "array",
      "maxItems": 12,
      "items": { "type": "string", "minLength": 1, "maxLength": 500 }
    },
    "recurringProblems": {
      "type": "array",
      "maxItems": 12,
      "items": { "type": "string", "minLength": 1, "maxLength": 500 }
    },
    "playbookChanges": {
      "type": "array",
      "maxItems": 12,
      "items": { "type": "string", "minLength": 1, "maxLength": 600 }
    },
    "agentVersionChanges": {
      "type": "array",
      "maxItems": 20,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["agentId", "currentVersion", "recommendedVersion", "reason"],
        "properties": {
          "agentId": { "type": "string", "minLength": 1, "maxLength": 120 },
          "currentVersion": { "type": "string", "minLength": 1, "maxLength": 32 },
          "recommendedVersion": { "type": "string", "minLength": 1, "maxLength": 32 },
          "reason": { "type": "string", "minLength": 1, "maxLength": 600 }
        }
      }
    },
    "evidence": {
      "type": "array",
      "maxItems": 20,
      "items": { "type": "string", "minLength": 1, "maxLength": 600 }
    }
  }
}"#;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrospectiveParticipantInput {
    pub agent_id: String,
    pub role: String,
    pub version: String,
    #[serde(default)]
    pub task_summaries: Vec<String>,
    #[serde(default)]
    pub evidence: Vec<String>,
    #[serde(default)]
    pub pull_request_numbers: Vec<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunProjectRetrospectivesInput {
    pub project_id: String,
    pub team_id: String,
    pub team_name: String,
    pub repository_full_name: String,
    pub workspace_path: String,
    pub user_request: String,
    pub product_summary: String,
    pub playbook_version: String,
    pub evolution_agent_version: String,
    pub participants: Vec<RetrospectiveParticipantInput>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRetrospectiveReport {
    pub went_well: Vec<String>,
    pub problems: Vec<String>,
    pub evidence: Vec<String>,
    pub next_changes: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRetrospectiveResult {
    pub agent_id: String,
    pub role: String,
    pub version: String,
    pub report: AgentRetrospectiveReport,
    pub events_path: String,
    pub output_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentVersionChangeProposal {
    pub agent_id: String,
    pub current_version: String,
    pub recommended_version: String,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamEvolutionProposal {
    pub summary: String,
    pub strengths: Vec<String>,
    pub recurring_problems: Vec<String>,
    pub playbook_changes: Vec<String>,
    pub agent_version_changes: Vec<AgentVersionChangeProposal>,
    pub evidence: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunProjectRetrospectivesResult {
    pub project_id: String,
    pub team_id: String,
    pub retrospectives: Vec<AgentRetrospectiveResult>,
    pub evolution: TeamEvolutionProposal,
    pub evolution_events_path: String,
    pub evolution_output_path: String,
}

fn output_detail(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stderr.is_empty() { stderr } else { stdout }
}

fn run_checked_with_stdin(program: &str, args: &[String], input: &str) -> Result<Output, String> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("{program} 실행 실패: {error}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(input.as_bytes())
            .map_err(|error| format!("{program} 입력 전달 실패: {error}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("{program} 실행 결과 확인 실패: {error}"))?;
    if output.status.success() {
        Ok(output)
    } else {
        let detail = output_detail(&output);
        Err(if detail.is_empty() {
            format!("{program} 명령이 실패했습니다.")
        } else {
            format!("{program} 명령 실패: {detail}")
        })
    }
}

fn validate_safe_text(value: &str, label: &str, max_len: usize) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > max_len || trimmed.contains('\0') {
        return Err(format!("{label} 값이 올바르지 않습니다."));
    }
    Ok(())
}

fn validate_repository(value: &str) -> Result<(), String> {
    let Some((owner, name)) = value.split_once('/') else {
        return Err("Repository는 owner/name 형식이어야 합니다.".to_string());
    };
    let valid = |segment: &str| {
        !segment.is_empty()
            && segment.len() <= 100
            && segment
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    };
    if value.matches('/').count() != 1 || !valid(owner) || !valid(name) {
        return Err("Repository 이름 형식이 잘못되었습니다.".to_string());
    }
    Ok(())
}

fn validate_input(input: &RunProjectRetrospectivesInput) -> Result<PathBuf, String> {
    validate_safe_text(&input.project_id, "Project ID", 120)?;
    validate_safe_text(&input.team_id, "Team ID", 80)?;
    validate_safe_text(&input.team_name, "Team name", 120)?;
    validate_repository(&input.repository_full_name)?;
    validate_safe_text(&input.user_request, "User request", 12_000)?;
    validate_safe_text(&input.product_summary, "Product summary", 4_000)?;
    validate_safe_text(&input.playbook_version, "Playbook version", 32)?;
    validate_safe_text(&input.evolution_agent_version, "Evolution Agent version", 32)?;

    if input.participants.is_empty() || input.participants.len() > 20 {
        return Err("회고 참여 Agent 수는 1~20명이어야 합니다.".to_string());
    }

    for participant in &input.participants {
        validate_safe_text(&participant.agent_id, "Agent ID", 120)?;
        validate_safe_text(&participant.role, "Agent role", 80)?;
        validate_safe_text(&participant.version, "Agent version", 32)?;
        if participant.task_summaries.len() > 20
            || participant.evidence.len() > 40
            || participant.pull_request_numbers.len() > 40
        {
            return Err(format!("{} 회고 입력 항목이 허용 범위를 초과했습니다.", participant.agent_id));
        }
    }

    let workspace = PathBuf::from(input.workspace_path.trim());
    if !workspace.join(".git").exists() {
        return Err("프로젝트 workspace가 Git 저장소가 아닙니다.".to_string());
    }
    Ok(workspace)
}

fn format_lines(values: &[String], empty: &str) -> String {
    if values.is_empty() {
        empty.to_string()
    } else {
        values
            .iter()
            .map(|value| format!("- {}", value.trim()))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

fn run_agent_retrospective(
    input: &RunProjectRetrospectivesInput,
    participant: &RetrospectiveParticipantInput,
    workspace: &Path,
    runtime_root: &Path,
) -> Result<AgentRetrospectiveResult, String> {
    let agent_dir = runtime_root.join("agents").join(participant.agent_id.replace(':', "__"));
    fs::create_dir_all(&agent_dir)
        .map_err(|error| format!("Agent 회고 디렉터리 생성 실패: {error}"))?;

    let schema_path = agent_dir.join("retrospective.schema.json");
    let output_path = agent_dir.join("retrospective.json");
    let events_path = agent_dir.join("retrospective-events.jsonl");
    fs::write(&schema_path, AGENT_RETROSPECTIVE_SCHEMA)
        .map_err(|error| format!("Agent 회고 schema 저장 실패: {error}"))?;

    let tasks = format_lines(&participant.task_summaries, "- 참여 Task 기록 없음");
    let evidence = format_lines(&participant.evidence, "- 별도 증거 없음");
    let prs = if participant.pull_request_numbers.is_empty() {
        "- 없음".to_string()
    } else {
        participant
            .pull_request_numbers
            .iter()
            .map(|number| format!("- PR #{number}"))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let prompt = format!(
        r#"You are Luna Agent `{agent_id}`, an independent `{role}` Agent writing your own retrospective after project work.

Project: {project_id}
Team: {team_name} ({team_id})
Repository: {repository}
Agent version: {version}
Team playbook version: {playbook_version}

Original user request:
{user_request}

Product summary:
{product_summary}

Your project participation:
{tasks}

Observed evidence:
{evidence}

PR evidence:
{prs}

Retrospective contract:
- Judge your own work independently. Do not copy the PM, reviewer, or another Agent's opinion as truth.
- Ground claims in the supplied project evidence. Do not invent test results, incidents, PRs, or user feedback.
- `wentWell` should identify repeatable practices that actually helped.
- `problems` should identify misses, rework, ambiguity, quality problems, or process friction you can support with evidence.
- `evidence` should cite concise observable facts from this project input.
- `nextChanges` should propose concrete behavior/process changes for your next project.
- Do not mutate your own prompt/version in this turn. Version changes are proposals evaluated by Team Evolution later.
- Return only the JSON object required by the supplied schema.
"#,
        agent_id = participant.agent_id,
        role = participant.role,
        project_id = input.project_id,
        team_name = input.team_name,
        team_id = input.team_id,
        repository = input.repository_full_name,
        version = participant.version,
        playbook_version = input.playbook_version,
        user_request = input.user_request,
        product_summary = input.product_summary,
        tasks = tasks,
        evidence = evidence,
        prs = prs,
    );

    let inference = local_inference_runtime::run_structured_json(
        "agent-retrospective",
        &prompt,
        AGENT_RETROSPECTIVE_SCHEMA,
        workspace,
    )?;
    fs::write(
        &output_path,
        serde_json::to_vec_pretty(&inference.output)
            .map_err(|error| format!("Agent retrospective serialization failed: {error}"))?,
    )
    .map_err(|error| format!("Agent retrospective output write failed: {error}"))?;
    fs::write(&events_path, &inference.events_jsonl)
        .map_err(|error| format!("Agent retrospective event write failed: {error}"))?;
    let report: AgentRetrospectiveReport = serde_json::from_value(inference.output)
        .map_err(|error| format!("Agent retrospective JSON parsing failed: {error}"))?;

    Ok(AgentRetrospectiveResult {
        agent_id: participant.agent_id.clone(),
        role: participant.role.clone(),
        version: participant.version.clone(),
        report,
        events_path: events_path.to_string_lossy().to_string(),
        output_path: output_path.to_string_lossy().to_string(),
    })
}

fn evolution_prompt(
    input: &RunProjectRetrospectivesInput,
    retrospectives: &[AgentRetrospectiveResult],
) -> Result<String, String> {
    let retrospective_json = serde_json::to_string_pretty(retrospectives)
        .map_err(|error| format!("회고 묶음 직렬화 실패: {error}"))?;

    Ok(format!(
        r#"You are Luna's organization-level Team Evolution Agent v{evolution_version}.
You are not a member of team {team_name}; independently evaluate this team's project evidence and Agent retrospectives.

Project: {project_id}
Team: {team_name} ({team_id})
Repository: {repository}
Current team playbook version: {playbook_version}

Original user request:
{user_request}

Product summary:
{product_summary}

Independent Agent retrospectives:
{retrospectives}

Evolution contract:
- Treat retrospectives as evidence, not authority. Cross-check recurring claims against the evidence included in the reports.
- Do not claim a long-term pattern from a single project. Put single-project observations in `strengths` or `recurringProblems` only when multiple Agent reports independently support them; otherwise keep the proposal conservative.
- `playbookChanges` are draft experiments for a future project, not immediate irreversible prompt mutations.
- `agentVersionChanges` may recommend keeping the same version. Use conservative SemVer-style recommendations and explain why.
- Do not recommend changing an Agent merely because another Agent disagreed with it. Prefer measurable process/quality evidence.
- Do not invent metrics, deployments, test results, or user feedback.
- Return only the JSON object required by the supplied schema.
"#,
        evolution_version = input.evolution_agent_version,
        team_name = input.team_name,
        project_id = input.project_id,
        team_id = input.team_id,
        repository = input.repository_full_name,
        playbook_version = input.playbook_version,
        user_request = input.user_request,
        product_summary = input.product_summary,
        retrospectives = retrospective_json,
    ))
}

fn run_team_evolution(
    input: &RunProjectRetrospectivesInput,
    retrospectives: &[AgentRetrospectiveResult],
    workspace: &Path,
    runtime_root: &Path,
) -> Result<(TeamEvolutionProposal, String, String), String> {
    let evolution_dir = runtime_root.join("team-evolution");
    fs::create_dir_all(&evolution_dir)
        .map_err(|error| format!("Team Evolution 디렉터리 생성 실패: {error}"))?;

    let schema_path = evolution_dir.join("evolution.schema.json");
    let output_path = evolution_dir.join("evolution-proposal.json");
    let events_path = evolution_dir.join("evolution-events.jsonl");
    fs::write(&schema_path, TEAM_EVOLUTION_SCHEMA)
        .map_err(|error| format!("Team Evolution schema 저장 실패: {error}"))?;

    let prompt = evolution_prompt(input, retrospectives)?;
    let inference = local_inference_runtime::run_structured_json(
        "team-evolution",
        &prompt,
        TEAM_EVOLUTION_SCHEMA,
        workspace,
    )?;
    fs::write(
        &output_path,
        serde_json::to_vec_pretty(&inference.output)
            .map_err(|error| format!("Team Evolution serialization failed: {error}"))?,
    )
    .map_err(|error| format!("Team Evolution output write failed: {error}"))?;
    fs::write(&events_path, &inference.events_jsonl)
        .map_err(|error| format!("Team Evolution event write failed: {error}"))?;
    let proposal: TeamEvolutionProposal = serde_json::from_value(inference.output)
        .map_err(|error| format!("Team Evolution JSON parsing failed: {error}"))?;

    Ok((
        proposal,
        events_path.to_string_lossy().to_string(),
        output_path.to_string_lossy().to_string(),
    ))
}

fn run_project_retrospectives_blocking(
    input: RunProjectRetrospectivesInput,
) -> Result<RunProjectRetrospectivesResult, String> {
    let workspace = validate_input(&input)?;

    let workspace_root = workspace
        .parent()
        .ok_or_else(|| "workspace 상위 경로를 확인할 수 없습니다.".to_string())?;
    let runtime_root = workspace_root
        .join(".luna-runtime")
        .join("projects")
        .join(&input.project_id)
        .join("retrospectives");
    fs::create_dir_all(&runtime_root)
        .map_err(|error| format!("Project 회고 Runtime 디렉터리 생성 실패: {error}"))?;

    let mut retrospectives = Vec::with_capacity(input.participants.len());
    for participant in &input.participants {
        retrospectives.push(run_agent_retrospective(
            &input,
            participant,
            &workspace,
            &runtime_root,
        )?);
    }

    let (evolution, evolution_events_path, evolution_output_path) =
        run_team_evolution(&input, &retrospectives, &workspace, &runtime_root)?;

    Ok(RunProjectRetrospectivesResult {
        project_id: input.project_id,
        team_id: input.team_id,
        retrospectives,
        evolution,
        evolution_events_path,
        evolution_output_path,
    })
}

#[tauri::command]
pub async fn run_project_retrospectives(
    input: RunProjectRetrospectivesInput,
) -> Result<RunProjectRetrospectivesResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_project_retrospectives_blocking(input))
        .await
        .map_err(|error| format!("Project 회고 Runtime join 실패: {error}"))?
}
