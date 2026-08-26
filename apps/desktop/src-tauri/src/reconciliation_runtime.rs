use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
};

use crate::agent_runtime::{AgentTaskReport, AgentTaskRunResult};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileAgentTaskInput {
    pub project_id: String,
    pub team_id: String,
    pub role: String,
    pub agent_id: String,
    pub task_id: String,
    pub task_slug: String,
    pub repository_full_name: String,
    pub workspace_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileAgentTaskResult {
    pub outcome: String,
    pub message: String,
    pub recovered: Option<AgentTaskRunResult>,
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

fn is_repository_writer(role: &str) -> bool {
    matches!(
        role,
        "design-system"
            | "designer"
            | "frontend"
            | "backend"
            | "data-marketing"
            | "documentation"
            | "debug-router"
    )
}

fn runtime_paths(input: &ReconcileAgentTaskInput) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let workspace = PathBuf::from(input.workspace_path.trim());
    let workspace_root = workspace
        .parent()
        .ok_or_else(|| "workspace 상위 경로를 확인할 수 없습니다.".to_string())?;
    let worktree = workspace_root
        .join(".luna-worktrees")
        .join(&input.project_id)
        .join(&input.task_id);
    let runtime_dir = workspace_root
        .join(".luna-runtime")
        .join("projects")
        .join(&input.project_id)
        .join("agents")
        .join(&input.agent_id)
        .join(&input.task_id);
    Ok((
        worktree,
        runtime_dir.join("app-server-events.jsonl"),
        runtime_dir.join("app-server.stderr.log"),
    ))
}

fn read_completed_report(events_path: &Path) -> Option<(String, String, String, AgentTaskReport)> {
    let content = fs::read_to_string(events_path).ok()?;
    let mut final_message: Option<String> = None;
    let mut thread_id: Option<String> = None;
    let mut turn_id: Option<String> = None;
    let mut completed_turn = false;

    for line in content.lines() {
        let value: Value = serde_json::from_str(line).ok()?;
        if value.get("id").and_then(Value::as_i64) == Some(1) {
            thread_id = value
                .get("result")
                .and_then(|result| result.get("thread"))
                .and_then(|thread| thread.get("id"))
                .and_then(Value::as_str)
                .map(str::to_string);
        }
        if value.get("id").and_then(Value::as_i64) == Some(2) {
            turn_id = value
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
                        final_message = Some(text.to_string());
                    }
                }
            }
        } else if method == "turn/completed" {
            let turn = value.get("params").and_then(|params| params.get("turn"));
            let status = turn.and_then(|turn| turn.get("status")).and_then(Value::as_str);
            let event_turn_id = turn.and_then(|turn| turn.get("id")).and_then(Value::as_str);
            if status == Some("completed") && (turn_id.as_deref().is_none() || event_turn_id == turn_id.as_deref()) {
                completed_turn = true;
            }
        }
    }

    if !completed_turn {
        return None;
    }
    let report: AgentTaskReport = serde_json::from_str(&final_message?).ok()?;
    let thread_id = thread_id.unwrap_or_else(|| "recovered-thread".to_string());
    let turn_id = turn_id.unwrap_or_else(|| "recovered-turn".to_string());
    let session_id = format!("{thread_id}-{turn_id}");
    Some((thread_id, session_id, turn_id, report))
}

fn find_pull_request(input: &ReconcileAgentTaskInput, branch: &str) -> Result<Option<(u64, String, String)>, String> {
    let output = run_checked(
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
            "all".to_string(),
            "--limit".to_string(),
            "1".to_string(),
            "--json".to_string(),
            "number,url,state".to_string(),
        ],
    )?;
    let rows: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("GitHub PR 조회 JSON 파싱 실패: {error}"))?;
    let Some(pr) = rows.as_array().and_then(|items| items.first()) else {
        return Ok(None);
    };
    let number = pr.get("number").and_then(Value::as_u64).ok_or_else(|| "PR 번호가 없습니다.".to_string())?;
    let url = pr.get("url").and_then(Value::as_str).unwrap_or_default().to_string();
    let state = pr.get("state").and_then(Value::as_str).unwrap_or_default().to_string();
    Ok(Some((number, url, state)))
}

fn verify_writer_state(
    input: &ReconcileAgentTaskInput,
    worktree: &Path,
    branch: &str,
) -> Result<(String, u64, String), String> {
    if !worktree.join(".git").exists() {
        return Err("Agent worktree를 찾을 수 없습니다.".to_string());
    }

    let current = run_checked("git", &git_args(worktree, &["branch", "--show-current"]))?;
    let current = String::from_utf8_lossy(&current.stdout).trim().to_string();
    if current != branch {
        return Err(format!("Agent worktree branch 불일치: expected={branch}, actual={current}"));
    }

    let status = run_checked("git", &git_args(worktree, &["status", "--porcelain"]))?;
    if !String::from_utf8_lossy(&status.stdout).trim().is_empty() {
        return Err("Agent worktree에 커밋되지 않은 변경이 남아 있습니다.".to_string());
    }

    let head = run_checked("git", &git_args(worktree, &["rev-parse", "HEAD"]))?;
    let head_sha = String::from_utf8_lossy(&head.stdout).trim().to_string();

    let pr = find_pull_request(input, branch)?
        .ok_or_else(|| "Agent branch의 develop 대상 PR을 찾을 수 없습니다.".to_string())?;
    if pr.2 != "OPEN" && pr.2 != "MERGED" {
        return Err(format!("Agent PR이 완료 복구 가능한 상태가 아닙니다: {}", pr.2));
    }

    if pr.2 == "OPEN" {
        let remote = run_checked(
            "git",
            &git_args(worktree, &["ls-remote", "--heads", "origin", branch]),
        )?;
        let remote_line = String::from_utf8_lossy(&remote.stdout).trim().to_string();
        let remote_sha = remote_line.split_whitespace().next().unwrap_or_default();
        if remote_sha.is_empty() || remote_sha != head_sha {
            return Err(format!(
                "Agent local HEAD와 원격 branch가 일치하지 않습니다. local={head_sha}, remote={remote_sha}"
            ));
        }
    }

    Ok((head_sha, pr.0, pr.1))
}

fn recovered_result(
    input: &ReconcileAgentTaskInput,
    worktree: &Path,
    events_path: &Path,
    stderr_path: &Path,
    branch: Option<String>,
    thread_id: String,
    session_id: String,
    turn_id: String,
    report: AgentTaskReport,
) -> AgentTaskRunResult {
    AgentTaskRunResult {
        project_id: input.project_id.clone(),
        task_id: input.task_id.clone(),
        role: input.role.clone(),
        agent_id: input.agent_id.clone(),
        branch_name: branch,
        worktree_path: worktree.to_string_lossy().to_string(),
        thread_id,
        session_id,
        turn_id,
        events_path: events_path.to_string_lossy().to_string(),
        stderr_path: stderr_path.to_string_lossy().to_string(),
        report,
    }
}

#[tauri::command]
pub async fn reconcile_agent_task(input: ReconcileAgentTaskInput) -> Result<ReconcileAgentTaskResult, String> {
    tauri::async_runtime::spawn_blocking(move || reconcile_agent_task_blocking(input))
        .await
        .map_err(|error| format!("Agent reconciliation join 실패: {error}"))?
}

fn reconcile_agent_task_blocking(input: ReconcileAgentTaskInput) -> Result<ReconcileAgentTaskResult, String> {
    let (worktree, events_path, stderr_path) = runtime_paths(&input)?;
    let branch = is_repository_writer(&input.role)
        .then(|| format!("agent/{}/{}/{}", input.team_id, input.role, input.task_slug));

    if let Some((thread_id, session_id, turn_id, mut report)) = read_completed_report(&events_path) {
        if report.status == "blocked" {
            let recovered = recovered_result(
                &input,
                &worktree,
                &events_path,
                &stderr_path,
                branch,
                thread_id,
                session_id,
                turn_id,
                report,
            );
            return Ok(ReconcileAgentTaskResult {
                outcome: "blocked".to_string(),
                message: "이전 Agent turn의 blocked 결과를 event log에서 복구했습니다.".to_string(),
                recovered: Some(recovered),
            });
        }

        if let Some(branch_name) = branch.as_deref() {
            match verify_writer_state(&input, &worktree, branch_name) {
                Ok((commit_sha, pr_number, pr_url)) => {
                    report.commit_sha = Some(commit_sha);
                    report.pull_request_number = Some(pr_number);
                    report.pull_request_url = Some(pr_url);
                }
                Err(reason) => {
                    return Ok(ReconcileAgentTaskResult {
                        outcome: "blocked".to_string(),
                        message: format!("Agent 완료 event는 있으나 repository 검증에 실패했습니다: {reason}"),
                        recovered: None,
                    });
                }
            }
        }

        let recovered = recovered_result(
            &input,
            &worktree,
            &events_path,
            &stderr_path,
            branch,
            thread_id,
            session_id,
            turn_id,
            report,
        );
        return Ok(ReconcileAgentTaskResult {
            outcome: "completed".to_string(),
            message: "이전 Agent turn 완료 결과를 event log와 repository 상태에서 복구했습니다.".to_string(),
            recovered: Some(recovered),
        });
    }

    if let Some(branch_name) = branch.as_deref() {
        if worktree.join(".git").exists() {
            let status = run_checked("git", &git_args(&worktree, &["status", "--porcelain"]))?;
            if !String::from_utf8_lossy(&status.stdout).trim().is_empty() {
                return Ok(ReconcileAgentTaskResult {
                    outcome: "blocked".to_string(),
                    message: "중단된 Agent worktree에 커밋되지 않은 변경이 남아 있어 자동 재시도를 막았습니다.".to_string(),
                    recovered: None,
                });
            }

            if let Ok((commit_sha, pr_number, pr_url)) = verify_writer_state(&input, &worktree, branch_name) {
                let report = AgentTaskReport {
                    status: "completed".to_string(),
                    summary: "앱 재시작 후 Git branch/PR 상태를 통해 완료 작업을 복구했습니다.".to_string(),
                    rationale_summary: "worktree가 clean하고 원격 branch와 develop 대상 PR이 검증되어 완료로 복구했습니다.".to_string(),
                    evidence: vec![
                        format!("branch={branch_name}"),
                        format!("commit={commit_sha}"),
                        format!("PR=#{pr_number} {pr_url}"),
                    ],
                    verification: vec![],
                    commit_sha: Some(commit_sha),
                    pull_request_number: Some(pr_number),
                    pull_request_url: Some(pr_url),
                    reviewed_pull_requests: vec![],
                    blockers: vec![],
                };
                let recovered = recovered_result(
                    &input,
                    &worktree,
                    &events_path,
                    &stderr_path,
                    branch,
                    "recovered-thread".to_string(),
                    "recovered-session".to_string(),
                    "recovered-turn".to_string(),
                    report,
                );
                return Ok(ReconcileAgentTaskResult {
                    outcome: "completed".to_string(),
                    message: "event log 완료 표시가 없지만 clean worktree와 원격 PR을 검증해 완료로 복구했습니다.".to_string(),
                    recovered: Some(recovered),
                });
            }
        }
    }

    Ok(ReconcileAgentTaskResult {
        outcome: "retry".to_string(),
        message: "완료 증거를 찾지 못해 기존 산출물을 보존한 채 Task를 재시도 대기로 전환합니다.".to_string(),
        recovered: None,
    })
}
