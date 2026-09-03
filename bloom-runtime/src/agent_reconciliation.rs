use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::File,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Output},
};

const MAX_JSONL_LINE_BYTES: usize = 10 * 1024 * 1024;
const WRITER_ROLES: &[&str] = &[
    "design-system",
    "designer",
    "ux-research",
    "frontend",
    "backend",
    "database",
    "security",
    "devops",
    "accessibility",
    "performance",
    "api-integration",
    "test-automation",
    "data-marketing",
    "documentation",
    "debug-router",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileInterruptedAgentTaskInput {
    pub project_id: String,
    pub team_id: String,
    pub role: String,
    pub agent_id: String,
    pub task_id: String,
    pub task_slug: String,
    pub repository_full_name: String,
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationResult {
    pub name: String,
    pub status: String,
    pub details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTaskReport {
    pub status: String,
    pub summary: String,
    pub rationale_summary: String,
    pub evidence: Vec<String>,
    pub verification: Vec<VerificationResult>,
    pub commit_sha: Option<String>,
    pub pull_request_number: Option<u64>,
    pub pull_request_url: Option<String>,
    pub reviewed_pull_requests: Vec<u64>,
    pub blockers: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveredAgentTaskRunResult {
    pub project_id: String,
    pub task_id: String,
    pub role: String,
    pub agent_id: String,
    pub branch_name: Option<String>,
    pub worktree_path: String,
    pub thread_id: String,
    pub session_id: String,
    pub turn_id: String,
    pub events_path: String,
    pub stderr_path: String,
    pub report: AgentTaskReport,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileInterruptedAgentTaskResult {
    pub outcome: String,
    pub reason: String,
    pub result: Option<RecoveredAgentTaskRunResult>,
}

#[derive(Default)]
struct EventEvidence {
    thread_id: Option<String>,
    turn_id: Option<String>,
    final_message: Option<String>,
    turn_status: Option<String>,
    turn_error: Option<String>,
}

fn output_detail(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stderr.is_empty() { stderr } else { stdout }
}

fn run_command(program: &str, args: &[String]) -> Result<Output, String> {
    Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("{program} 실행 실패: {error}"))
}

fn run_checked(program: &str, args: &[String]) -> Result<Output, String> {
    let output = run_command(program, args)?;
    if output.status.success() {
        return Ok(output);
    }
    let detail = output_detail(&output);
    Err(if detail.is_empty() {
        format!("{program} 명령이 실패했습니다.")
    } else {
        format!("{program} 명령 실패: {detail}")
    })
}

fn git_args(workspace: &Path, tail: &[&str]) -> Vec<String> {
    let mut args = vec!["-C".to_string(), workspace.to_string_lossy().to_string()];
    args.extend(tail.iter().map(|value| value.to_string()));
    args
}

fn is_kebab(value: &str) -> bool {
    let mut seen = false;
    let mut previous_dash = false;
    for character in value.chars() {
        if character.is_ascii_lowercase() || character.is_ascii_digit() {
            seen = true;
            previous_dash = false;
        } else if character == '-' && seen && !previous_dash {
            previous_dash = true;
        } else {
            return false;
        }
    }
    seen && !previous_dash
}

fn validate_segment(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 64 || !is_kebab(value) {
        return Err(format!("{label}은 lowercase ASCII kebab-case여야 합니다: {value}"));
    }
    Ok(())
}

fn validate_project_id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 100
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("Project ID 형식이 잘못되었습니다.".to_string());
    }
    Ok(())
}

fn validate_task_id(value: &str) -> Result<(), String> {
    let Some((prefix, number)) = value.rsplit_once('-') else {
        return Err(format!("Task ID 형식이 잘못되었습니다: {value}"));
    };
    if prefix.is_empty()
        || !prefix.chars().all(|character| character.is_ascii_uppercase())
        || number.len() != 3
        || !number.chars().all(|character| character.is_ascii_digit())
    {
        return Err(format!("Task ID 형식이 잘못되었습니다: {value}"));
    }
    Ok(())
}

fn validate_repository(value: &str) -> Result<(), String> {
    let Some((owner, repository)) = value.trim().split_once('/') else {
        return Err("Repository는 owner/name 형식이어야 합니다.".to_string());
    };
    if owner.is_empty()
        || repository.is_empty()
        || repository.contains('/')
        || !owner.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        || !repository
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err("Repository 형식이 잘못되었습니다.".to_string());
    }
    Ok(())
}

fn strip_pool_instance(identity: &str) -> &str {
    if let Some((base, suffix)) = identity.rsplit_once('-') {
        if !base.is_empty() && !suffix.is_empty() && suffix.chars().all(|character| character.is_ascii_digit()) {
            return base;
        }
    }
    identity
}

fn runtime_role_for_agent_identity(identity: &str) -> &str {
    match strip_pool_instance(identity) {
        "database" | "security" | "devops" | "performance" | "api-integration" => "backend",
        "accessibility" | "test-automation" => "frontend",
        "ux-research" => "designer",
        role => role,
    }
}

fn validate_agent_identity(input: &ReconcileInterruptedAgentTaskInput) -> Result<(), String> {
    let prefix = format!("{}:", input.team_id.trim());
    let identity = input
        .agent_id
        .trim()
        .strip_prefix(&prefix)
        .ok_or_else(|| "Agent ID가 project team 범위와 일치하지 않습니다.".to_string())?;
    validate_segment(identity, "Agent identity")?;

    let runtime_role = runtime_role_for_agent_identity(identity);
    if runtime_role != input.role.trim() {
        return Err(format!(
            "Agent ID 역할과 Runtime role이 일치하지 않습니다. agent={} runtimeRole={}",
            input.agent_id.trim(),
            input.role.trim()
        ));
    }
    Ok(())
}

fn validate_input(input: &ReconcileInterruptedAgentTaskInput) -> Result<(), String> {
    validate_project_id(input.project_id.trim())?;
    validate_task_id(input.task_id.trim())?;
    validate_segment(input.team_id.trim(), "Team ID")?;
    validate_segment(input.role.trim(), "Agent role")?;
    validate_segment(input.task_slug.trim(), "Task slug")?;
    validate_repository(input.repository_full_name.trim())?;
    validate_agent_identity(input)?;
    if input.workspace_path.trim().is_empty() {
        return Err("Project workspace path가 비어 있습니다.".to_string());
    }
    Ok(())
}

fn writer_role(role: &str) -> bool {
    WRITER_ROLES.contains(&role)
}

fn runtime_paths(input: &ReconcileInterruptedAgentTaskInput) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let workspace = PathBuf::from(input.workspace_path.trim());
    if !workspace.join(".git").exists() {
        return Err("Project workspace가 Git repository가 아닙니다.".to_string());
    }
    let workspace_root = workspace
        .parent()
        .ok_or_else(|| "Project workspace 상위 경로를 확인할 수 없습니다.".to_string())?;
    let runtime_dir = workspace_root
        .join(".luna-runtime")
        .join("projects")
        .join(input.project_id.trim())
        .join("agents")
        .join(input.agent_id.trim())
        .join(input.task_id.trim());
    Ok((
        runtime_dir.join("app-server-events.jsonl"),
        runtime_dir.join("app-server.stderr.log"),
        workspace_root
            .join(".luna-worktrees")
            .join(input.project_id.trim())
            .join(input.task_id.trim()),
    ))
}

fn read_event_evidence(events_path: &Path) -> Result<EventEvidence, String> {
    let file = File::open(events_path)
        .map_err(|error| format!("Agent App Server event log를 열 수 없습니다: {error}"))?;
    let reader = BufReader::new(file);
    let mut evidence = EventEvidence::default();

    for line_result in reader.lines() {
        let line = line_result.map_err(|error| format!("Agent event log 읽기 실패: {error}"))?;
        if line.len() > MAX_JSONL_LINE_BYTES {
            return Err("Agent event log JSONL 메시지가 10MB 안전 한도를 초과했습니다.".to_string());
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let value: Value = serde_json::from_str(trimmed)
            .map_err(|error| format!("Agent event log JSONL 파싱 실패: {error}"))?;

        if value.get("id").and_then(Value::as_i64) == Some(1) {
            evidence.thread_id = value
                .get("result")
                .and_then(|result| result.get("thread"))
                .and_then(|thread| thread.get("id"))
                .and_then(Value::as_str)
                .map(str::to_string);
        }
        if value.get("id").and_then(Value::as_i64) == Some(2) {
            evidence.turn_id = value
                .get("result")
                .and_then(|result| result.get("turn"))
                .and_then(|turn| turn.get("id"))
                .and_then(Value::as_str)
                .map(str::to_string);
        }

        let method = value.get("method").and_then(Value::as_str).unwrap_or_default();
        if method == "item/completed" {
            if let Some(item) = value.get("params").and_then(|params| params.get("item")) {
                if item.get("type").and_then(Value::as_str) == Some("agentMessage") {
                    if let Some(text) = item.get("text").and_then(Value::as_str) {
                        evidence.final_message = Some(text.to_string());
                    }
                }
            }
        }
        if method == "turn/completed" {
            if let Some(turn) = value.get("params").and_then(|params| params.get("turn")) {
                let completed_turn_id = turn.get("id").and_then(Value::as_str);
                if evidence.turn_id.as_deref().is_some_and(|turn_id| Some(turn_id) == completed_turn_id) {
                    evidence.turn_status = turn.get("status").and_then(Value::as_str).map(str::to_string);
                    evidence.turn_error = turn
                        .get("error")
                        .and_then(|error| error.get("message"))
                        .and_then(Value::as_str)
                        .map(str::to_string);
                }
            }
        }
    }

    Ok(evidence)
}

fn verify_writer_result(
    input: &ReconcileInterruptedAgentTaskInput,
    worktree: &Path,
    branch: &str,
    report: &mut AgentTaskReport,
) -> Result<(), String> {
    if report.status != "completed" {
        return Ok(());
    }
    if !worktree.exists() || !worktree.join(".git").exists() {
        return Err("완료된 writer Agent의 worktree를 찾을 수 없습니다.".to_string());
    }

    let current_branch = run_checked("git", &git_args(worktree, &["branch", "--show-current"]))?;
    let current_branch = String::from_utf8_lossy(&current_branch.stdout).trim().to_string();
    if current_branch != branch {
        return Err(format!(
            "복구 대상 worktree branch가 예상과 다릅니다. expected={branch}, actual={current_branch}"
        ));
    }

    let status = run_checked(
        "git",
        &git_args(worktree, &["status", "--porcelain", "--untracked-files=all"]),
    )?;
    if !String::from_utf8_lossy(&status.stdout).trim().is_empty() {
        return Err("복구 대상 worktree에 커밋되지 않은 변경 또는 untracked 파일이 남아 있습니다.".to_string());
    }

    let head = run_checked("git", &git_args(worktree, &["rev-parse", "HEAD"]))?;
    let head_sha = String::from_utf8_lossy(&head.stdout).trim().to_string();
    let remote = run_checked(
        "git",
        &git_args(worktree, &["ls-remote", "--heads", "origin", branch]),
    )?;
    let remote_line = String::from_utf8_lossy(&remote.stdout).trim().to_string();
    let remote_sha = remote_line
        .split_whitespace()
        .next()
        .ok_or_else(|| "복구 대상 원격 branch를 찾을 수 없습니다.".to_string())?;
    if remote_sha != head_sha {
        return Err(format!(
            "복구 대상 local HEAD와 remote branch SHA가 다릅니다. local={head_sha}, remote={remote_sha}"
        ));
    }

    let pr_output = run_checked(
        "gh",
        &[
            "pr".to_string(),
            "list".to_string(),
            "--repo".to_string(),
            input.repository_full_name.clone(),
            "--head".to_string(),
            branch.to_string(),
            "--base".to_string(),
            "develop".to_string(),
            "--state".to_string(),
            "open".to_string(),
            "--limit".to_string(),
            "1".to_string(),
            "--json".to_string(),
            "number,url".to_string(),
        ],
    )?;
    let prs: Vec<Value> = serde_json::from_slice(&pr_output.stdout)
        .map_err(|error| format!("복구 대상 PR 검증 결과 파싱 실패: {error}"))?;
    let pr = prs.first().ok_or_else(|| {
        "완료된 writer Agent의 open develop 대상 PR을 찾을 수 없습니다.".to_string()
    })?;
    let pr_number = pr
        .get("number")
        .and_then(Value::as_u64)
        .ok_or_else(|| "복구 대상 PR number를 확인할 수 없습니다.".to_string())?;
    let pr_url = pr
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| "복구 대상 PR URL을 확인할 수 없습니다.".to_string())?
        .to_string();

    report.commit_sha = Some(head_sha);
    report.pull_request_number = Some(pr_number);
    report.pull_request_url = Some(pr_url);
    Ok(())
}

fn unrecoverable(reason: impl Into<String>) -> ReconcileInterruptedAgentTaskResult {
    ReconcileInterruptedAgentTaskResult {
        outcome: "blocked".to_string(),
        reason: reason.into(),
        result: None,
    }
}

fn retryable(reason: impl Into<String>) -> ReconcileInterruptedAgentTaskResult {
    ReconcileInterruptedAgentTaskResult {
        outcome: "retryable".to_string(),
        reason: reason.into(),
        result: None,
    }
}

fn retryable_or_blocked_before_terminal(
    input: &ReconcileInterruptedAgentTaskInput,
    reason: impl Into<String>,
) -> ReconcileInterruptedAgentTaskResult {
    let reason = reason.into();
    if writer_role(input.role.trim()) {
        unrecoverable(reason)
    } else {
        retryable(reason)
    }
}

fn reconcile_interrupted_agent_task_blocking(
    input: ReconcileInterruptedAgentTaskInput,
) -> Result<ReconcileInterruptedAgentTaskResult, String> {
    validate_input(&input)?;
    let (events_path, stderr_path, worktree) = runtime_paths(&input)?;
    if !events_path.exists() {
        return Ok(retryable_or_blocked_before_terminal(
            &input,
            "Interrupted Agent has no App Server event log, so no terminal result can be proven.",
        ));
    }

    let evidence = read_event_evidence(&events_path)?;
    let Some(thread_id) = evidence.thread_id else {
        return Ok(retryable_or_blocked_before_terminal(
            &input,
            "Interrupted Agent has no completed thread/start evidence.",
        ));
    };
    let Some(turn_id) = evidence.turn_id else {
        return Ok(retryable_or_blocked_before_terminal(
            &input,
            "Interrupted Agent has no completed turn/start evidence.",
        ));
    };
    if evidence.turn_status.as_deref() != Some("completed") {
        let detail = evidence
            .turn_error
            .clone()
            .unwrap_or_else(|| "turn/completed evidence missing".to_string());
        if evidence.turn_status.is_none() && !writer_role(input.role.trim()) {
            return Ok(retryable(format!(
                "Interrupted non-writer Agent turn has no terminal evidence and may be retried: {detail}"
            )));
        }
        return Ok(unrecoverable(format!(
            "Interrupted Agent turn did not complete successfully: {detail}"
        )));
    }
    let Some(final_message) = evidence.final_message else {
        return Ok(unrecoverable(
            "turn은 completed지만 최종 structured agentMessage가 없어 결과를 복구할 수 없습니다.",
        ));
    };

    let mut report: AgentTaskReport = serde_json::from_str(&final_message)
        .map_err(|error| format!("중단된 Agent 최종 결과 JSON 파싱 실패: {error}"))?;
    if !matches!(report.status.as_str(), "completed" | "blocked") {
        return Ok(unrecoverable(format!(
            "중단된 Agent 최종 report status가 유효하지 않습니다: {}",
            report.status
        )));
    }

    let branch = writer_role(input.role.trim()).then(|| {
        format!(
            "agent/{}/{}/{}-{}",
            input.team_id.trim(),
            input.role.trim(),
            input.project_id.trim(),
            input.task_slug.trim()
        )
    });
    if let Some(branch_name) = branch.as_deref() {
        if let Err(reason) = verify_writer_result(&input, &worktree, branch_name, &mut report) {
            return Ok(unrecoverable(format!(
                "완료 report는 발견했지만 repository evidence 재검증에 실패했습니다: {reason}"
            )));
        }
    }

    let session_id = format!("{thread_id}-{turn_id}");
    Ok(ReconcileInterruptedAgentTaskResult {
        outcome: "recovered".to_string(),
        reason: "App Server event log와 현재 repository evidence로 중단 Task의 최종 결과를 복구했습니다.".to_string(),
        result: Some(RecoveredAgentTaskRunResult {
            project_id: input.project_id,
            task_id: input.task_id,
            role: input.role,
            agent_id: input.agent_id,
            branch_name: branch,
            worktree_path: worktree.to_string_lossy().to_string(),
            thread_id,
            session_id,
            turn_id,
            events_path: events_path.to_string_lossy().to_string(),
            stderr_path: stderr_path.to_string_lossy().to_string(),
            report,
        }),
    })
}

pub async fn reconcile_interrupted_agent_task(
    input: ReconcileInterruptedAgentTaskInput,
) -> Result<ReconcileInterruptedAgentTaskResult, String> {
    tauri::async_runtime::spawn_blocking(move || reconcile_interrupted_agent_task_blocking(input))
        .await
        .map_err(|error| format!("Agent reconciliation Runtime join 실패: {error}"))?
}
