use serde_json::Value;
use std::{
    path::Path,
    process::{Command, Output},
};

use crate::{agent_reconciliation, agent_runtime};

const ALLOWED_TEAMS: &[&str] = &["rose", "lily", "tulip", "sunflower", "cherry-blossom"];
const ALLOWED_ROLES: &[&str] = &[
    "idea",
    "ux-research",
    "design-system",
    "designer",
    "frontend",
    "backend",
    "database",
    "api-integration",
    "security",
    "performance",
    "devops",
    "accessibility",
    "test-automation",
    "data-marketing",
    "code-review",
    "reviewer",
    "qa",
    "documentation",
    "debug-router",
    "user-a",
    "user-b",
    "process-evaluator",
];

fn output_detail(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stderr.is_empty() { stderr } else { stdout }
}

fn run_checked(program: &str, args: &[String]) -> Result<Output, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("{program} 실행 실패: {error}"))?;
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

fn git_args(worktree: &Path, tail: &[&str]) -> Vec<String> {
    let mut args = vec!["-C".to_string(), worktree.to_string_lossy().to_string()];
    args.extend(tail.iter().map(|value| value.to_string()));
    args
}

fn normalize_repository(value: &str) -> String {
    value
        .trim()
        .trim_matches('/')
        .trim_end_matches(".git")
        .to_lowercase()
}

fn origin_matches_repository(origin: &str, repository_full_name: &str) -> bool {
    let repository = normalize_repository(repository_full_name);
    let origin = origin
        .trim()
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .to_lowercase();
    let allowed = [
        format!("https://github.com/{repository}"),
        format!("git@github.com:{repository}"),
        format!("ssh://git@github.com/{repository}"),
    ];

    allowed.iter().any(|expected| origin == *expected)
}

fn ensure_expected_origin(worktree: &Path, repository_full_name: &str) -> Result<(), String> {
    let output = run_checked("git", &git_args(worktree, &["remote", "get-url", "origin"]))?;
    let origin = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if origin_matches_repository(&origin, repository_full_name) {
        return Ok(());
    }

    Err(format!(
        "Agent workspace origin이 예상 repository와 일치하지 않습니다. expected={repository_full_name}, actual={origin}"
    ))
}

fn verify_writer_repository_evidence(
    repository_full_name: &str,
    worktree_path: &str,
    branch: &str,
    reported_commit_sha: Option<&str>,
    reported_pull_request_number: Option<u64>,
) -> Result<(), String> {
    let worktree = Path::new(worktree_path);
    if !worktree.exists() {
        return Err("Agent evidence gate가 worktree를 찾을 수 없습니다.".to_string());
    }

    ensure_expected_origin(worktree, repository_full_name)?;

    let head_output = run_checked("git", &git_args(worktree, &["rev-parse", "HEAD"]))?;
    let head_sha = String::from_utf8_lossy(&head_output.stdout).trim().to_string();
    let reported_commit_sha = reported_commit_sha
        .ok_or_else(|| "completed writer Agent에 commit SHA가 없습니다.".to_string())?;
    if reported_commit_sha != head_sha {
        return Err(format!(
            "Agent report commit SHA와 검증한 worktree HEAD가 다릅니다. report={reported_commit_sha}, head={head_sha}"
        ));
    }

    let remote_output = run_checked(
        "git",
        &git_args(worktree, &["ls-remote", "--heads", "origin", branch]),
    )?;
    let remote_line = String::from_utf8_lossy(&remote_output.stdout).trim().to_string();
    let remote_sha = remote_line
        .split_whitespace()
        .next()
        .ok_or_else(|| "Agent evidence gate가 원격 branch SHA를 확인할 수 없습니다.".to_string())?;
    if remote_sha != head_sha {
        return Err(format!(
            "검증한 worktree HEAD와 origin branch SHA가 다릅니다. head={head_sha}, remote={remote_sha}"
        ));
    }

    let reported_pr = reported_pull_request_number
        .ok_or_else(|| "completed writer Agent에 Pull Request number가 없습니다.".to_string())?;
    let pr_output = run_checked(
        "gh",
        &[
            "pr".to_string(),
            "list".to_string(),
            "--repo".to_string(),
            repository_full_name.to_string(),
            "--head".to_string(),
            branch.to_string(),
            "--base".to_string(),
            "develop".to_string(),
            "--state".to_string(),
            "open".to_string(),
            "--limit".to_string(),
            "10".to_string(),
            "--json".to_string(),
            "number,url,headRefOid".to_string(),
        ],
    )?;
    let prs: Vec<Value> = serde_json::from_slice(&pr_output.stdout)
        .map_err(|error| format!("Agent evidence gate PR 결과 파싱 실패: {error}"))?;
    let pr = prs
        .iter()
        .find(|pr| pr.get("number").and_then(Value::as_u64) == Some(reported_pr))
        .ok_or_else(|| {
            format!(
                "Agent report의 PR #{reported_pr}가 예상 repository/branch/develop open PR 목록에 없습니다."
            )
        })?;
    let pr_head_sha = pr
        .get("headRefOid")
        .and_then(Value::as_str)
        .ok_or_else(|| "Agent PR headRefOid를 확인할 수 없습니다.".to_string())?;
    if pr_head_sha != head_sha {
        return Err(format!(
            "Agent PR HEAD와 검증한 worktree/origin SHA가 다릅니다. pr={pr_head_sha}, head={head_sha}"
        ));
    }

    Ok(())
}

fn validate_reconciliation_identity(team_id: &str, role: &str) -> Result<(), String> {
    if !ALLOWED_TEAMS.contains(&team_id) {
        return Err(format!("허용되지 않은 reconciliation Team ID입니다: {team_id}"));
    }
    if !ALLOWED_ROLES.contains(&role) {
        return Err(format!("허용되지 않은 reconciliation Agent role입니다: {role}"));
    }
    Ok(())
}

#[tauri::command]
pub async fn dispatch_agent_task(
    input: agent_runtime::AgentTaskRuntimeInput,
) -> Result<agent_runtime::AgentTaskRunResult, String> {
    let repository_full_name = input.repository_full_name.clone();
    ensure_expected_origin(Path::new(input.workspace_path.trim()), &repository_full_name)?;
    let result = agent_runtime::dispatch_agent_task(input).await?;

    if result.report.status == "completed" {
        if let Some(branch) = result.branch_name.as_deref() {
            verify_writer_repository_evidence(
                &repository_full_name,
                &result.worktree_path,
                branch,
                result.report.commit_sha.as_deref(),
                result.report.pull_request_number,
            )?;
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn reconcile_interrupted_agent_task(
    input: agent_reconciliation::ReconcileInterruptedAgentTaskInput,
) -> Result<agent_reconciliation::ReconcileInterruptedAgentTaskResult, String> {
    validate_reconciliation_identity(input.team_id.trim(), input.role.trim())?;
    let repository_full_name = input.repository_full_name.clone();
    ensure_expected_origin(Path::new(input.workspace_path.trim()), &repository_full_name)?;
    let result = agent_reconciliation::reconcile_interrupted_agent_task(input).await?;

    if result.outcome == "recovered" {
        if let Some(recovered) = result.result.as_ref() {
            if recovered.report.status == "completed" {
                if let Some(branch) = recovered.branch_name.as_deref() {
                    verify_writer_repository_evidence(
                        &repository_full_name,
                        &recovered.worktree_path,
                        branch,
                        recovered.report.commit_sha.as_deref(),
                        recovered.report.pull_request_number,
                    )?;
                }
            }
        }
    }

    Ok(result)
}
