use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
    process::{Command, Output},
};
use tauri::{AppHandle, Manager};

const WRITER_ROLES: &[&str] = &[
    "design-system",
    "designer",
    "frontend",
    "backend",
    "data-marketing",
    "documentation",
    "debug-router",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeCleanupTaskInput {
    pub task_id: String,
    pub role: String,
    pub status: String,
    pub branch_name: Option<String>,
    pub worktree_path: String,
    pub commit_sha: Option<String>,
    pub pull_request_number: Option<u64>,
    pub pull_request_url: Option<String>,
    pub thread_id: Option<String>,
    pub session_id: Option<String>,
    pub turn_id: Option<String>,
    #[serde(default)]
    pub evidence: Vec<String>,
    #[serde(default)]
    pub verification: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupProjectWorktreesInput {
    pub project_id: String,
    pub repository_full_name: String,
    pub workspace_path: String,
    pub tasks: Vec<WorktreeCleanupTaskInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeCleanupSkip {
    pub task_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupProjectWorktreesResult {
    pub archive_path: String,
    pub removed_task_ids: Vec<String>,
    pub already_absent_task_ids: Vec<String>,
    pub skipped: Vec<WorktreeCleanupSkip>,
    pub pruned: bool,
}

fn output_detail(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stderr.is_empty() { stderr } else { stdout }
}

fn git_args(workspace: &Path, tail: &[&str]) -> Vec<String> {
    let mut args = vec!["-C".to_string(), workspace.to_string_lossy().to_string()];
    args.extend(tail.iter().map(|value| value.to_string()));
    args
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

fn has_unsafe_components(path: &Path) -> bool {
    path.components().any(|component| matches!(component, Component::ParentDir | Component::CurDir))
}

fn expected_worktree_root(workspace: &Path, project_id: &str) -> Result<PathBuf, String> {
    let parent = workspace
        .parent()
        .ok_or_else(|| "Project workspace 상위 경로를 확인할 수 없습니다.".to_string())?;
    Ok(parent.join(".luna-worktrees").join(project_id))
}

fn archive_path(app: &AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Luna app data directory 확인 실패: {error}"))?
        .join("project-teams")
        .join("worktree-archive");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Worktree archive directory 생성 실패: {error}"))?;
    Ok(directory.join(format!("{project_id}.jsonl")))
}

fn append_archive(path: &Path, record: &Value) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("Worktree archive 열기 실패: {error}"))?;
    let line = serde_json::to_string(record)
        .map_err(|error| format!("Worktree archive 직렬화 실패: {error}"))?;
    file.write_all(line.as_bytes())
        .and_then(|_| file.write_all(b"\n"))
        .and_then(|_| file.flush())
        .map_err(|error| format!("Worktree archive 기록 실패: {error}"))
}

fn writer_role(role: &str) -> bool {
    WRITER_ROLES.contains(&role)
}

fn validate_merged_writer_pr(
    repository_full_name: &str,
    task: &WorktreeCleanupTaskInput,
    branch: &str,
) -> Result<(), String> {
    let pr_number = task
        .pull_request_number
        .ok_or_else(|| "repository writer Task에 PR number가 없습니다.".to_string())?;
    let output = run_checked(
        "gh",
        &[
            "pr".to_string(),
            "view".to_string(),
            pr_number.to_string(),
            "--repo".to_string(),
            repository_full_name.to_string(),
            "--json".to_string(),
            "number,state,mergedAt,headRefName,baseRefName,url".to_string(),
        ],
    )?;
    let pr: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Worktree cleanup PR 검증 결과 파싱 실패: {error}"))?;

    if pr.get("state").and_then(Value::as_str) != Some("MERGED")
        || pr.get("mergedAt").is_none()
        || pr.get("mergedAt") == Some(&Value::Null)
    {
        return Err(format!("PR #{pr_number}가 아직 merged 상태가 아닙니다."));
    }
    if pr.get("headRefName").and_then(Value::as_str) != Some(branch) {
        return Err(format!("PR #{pr_number} head branch가 예상과 다릅니다."));
    }
    if pr.get("baseRefName").and_then(Value::as_str) != Some("develop") {
        return Err(format!("PR #{pr_number} base branch가 develop이 아닙니다."));
    }
    Ok(())
}

fn validate_existing_worktree(
    workspace: &Path,
    expected_root: &Path,
    repository_full_name: &str,
    task: &WorktreeCleanupTaskInput,
) -> Result<PathBuf, String> {
    let raw_path = PathBuf::from(task.worktree_path.trim());
    if !raw_path.is_absolute() || has_unsafe_components(&raw_path) {
        return Err("Worktree 경로가 안전한 절대 경로가 아닙니다.".to_string());
    }
    let canonical = fs::canonicalize(&raw_path)
        .map_err(|error| format!("Worktree canonical path 확인 실패: {error}"))?;
    if !canonical.starts_with(expected_root) {
        return Err("Worktree 경로가 Luna project worktree root 밖을 가리킵니다.".to_string());
    }
    if !canonical.join(".git").exists() {
        return Err("정리 대상 경로가 Git worktree가 아닙니다.".to_string());
    }

    let status = run_checked(
        "git",
        &git_args(&canonical, &["status", "--porcelain", "--untracked-files=all"]),
    )?;
    if !String::from_utf8_lossy(&status.stdout).trim().is_empty() {
        return Err("Worktree에 커밋되지 않은 변경 또는 untracked 파일이 남아 있습니다.".to_string());
    }

    let branch_output = run_checked("git", &git_args(&canonical, &["branch", "--show-current"]))?;
    let current_branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();

    if writer_role(&task.role) {
        let branch = task
            .branch_name
            .as_deref()
            .ok_or_else(|| "repository writer Task에 branch metadata가 없습니다.".to_string())?;
        let commit = task
            .commit_sha
            .as_deref()
            .ok_or_else(|| "repository writer Task에 commit metadata가 없습니다.".to_string())?;
        if current_branch != branch {
            return Err(format!(
                "Worktree branch가 기록과 다릅니다. expected={branch}, actual={current_branch}"
            ));
        }
        let head = run_checked("git", &git_args(&canonical, &["rev-parse", "HEAD"]))?;
        let head = String::from_utf8_lossy(&head.stdout).trim().to_string();
        if head != commit {
            return Err(format!("Worktree HEAD가 기록된 commit과 다릅니다. expected={commit}, actual={head}"));
        }
        validate_merged_writer_pr(repository_full_name, task, branch)?;
    } else if !current_branch.is_empty() {
        return Err(format!(
            "읽기/검증 Agent worktree가 detached HEAD가 아닙니다: {current_branch}"
        ));
    }

    let registered = run_checked("git", &git_args(workspace, &["worktree", "list", "--porcelain"]))?;
    let registered_text = String::from_utf8_lossy(&registered.stdout);
    let marker = format!("worktree {}", canonical.to_string_lossy());
    if !registered_text.lines().any(|line| line == marker) {
        return Err("Git worktree registry에서 정리 대상 경로를 찾을 수 없습니다.".to_string());
    }

    Ok(canonical)
}

fn task_archive_record(
    project_id: &str,
    task: &WorktreeCleanupTaskInput,
    phase: &str,
    detail: &str,
) -> Value {
    json!({
        "schemaVersion": 1,
        "projectId": project_id,
        "taskId": task.task_id,
        "role": task.role,
        "phase": phase,
        "detail": detail,
        "archivedAt": chrono_free_timestamp(),
        "branchName": task.branch_name,
        "worktreePath": task.worktree_path,
        "commitSha": task.commit_sha,
        "pullRequestNumber": task.pull_request_number,
        "pullRequestUrl": task.pull_request_url,
        "threadId": task.thread_id,
        "sessionId": task.session_id,
        "turnId": task.turn_id,
        "evidence": task.evidence,
        "verification": task.verification,
    })
}

fn chrono_free_timestamp() -> String {
    // Keep this module dependency-free; SystemTime is sufficient for an auditable UTC-ish epoch marker.
    use std::time::{SystemTime, UNIX_EPOCH};
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => format!("unix-ms:{}", duration.as_millis()),
        Err(_) => "unix-ms:0".to_string(),
    }
}

fn cleanup_project_worktrees_blocking(
    app: AppHandle,
    input: CleanupProjectWorktreesInput,
) -> Result<CleanupProjectWorktreesResult, String> {
    validate_project_id(input.project_id.trim())?;
    validate_repository(input.repository_full_name.trim())?;

    let workspace = fs::canonicalize(PathBuf::from(input.workspace_path.trim()))
        .map_err(|error| format!("Project workspace 확인 실패: {error}"))?;
    if !workspace.join(".git").exists() {
        return Err("Project workspace가 Git repository가 아닙니다.".to_string());
    }

    let expected_root = expected_worktree_root(&workspace, input.project_id.trim())?;
    let archive = archive_path(&app, input.project_id.trim())?;
    let mut removed_task_ids = Vec::new();
    let mut already_absent_task_ids = Vec::new();
    let mut skipped = Vec::new();

    for task in &input.tasks {
        if task.status != "done" {
            skipped.push(WorktreeCleanupSkip {
                task_id: task.task_id.clone(),
                reason: "Task가 done 상태가 아닙니다.".to_string(),
            });
            continue;
        }
        if task.worktree_path.trim().is_empty() {
            continue;
        }

        let raw_path = PathBuf::from(task.worktree_path.trim());
        if !raw_path.is_absolute() || has_unsafe_components(&raw_path) || !raw_path.starts_with(&expected_root) {
            skipped.push(WorktreeCleanupSkip {
                task_id: task.task_id.clone(),
                reason: "기록된 worktree 경로가 Luna project root 밖이거나 안전하지 않습니다.".to_string(),
            });
            continue;
        }

        if !raw_path.exists() {
            append_archive(
                &archive,
                &task_archive_record(input.project_id.trim(), task, "already-absent", "worktree path already absent"),
            )?;
            already_absent_task_ids.push(task.task_id.clone());
            continue;
        }

        let canonical = match validate_existing_worktree(
            &workspace,
            &expected_root,
            input.repository_full_name.trim(),
            task,
        ) {
            Ok(path) => path,
            Err(reason) => {
                skipped.push(WorktreeCleanupSkip {
                    task_id: task.task_id.clone(),
                    reason,
                });
                continue;
            }
        };

        append_archive(
            &archive,
            &task_archive_record(
                input.project_id.trim(),
                task,
                "pre-remove",
                "validated clean worktree; archive flushed before removal",
            ),
        )?;

        let path_string = canonical.to_string_lossy().to_string();
        match run_checked(
            "git",
            &git_args(&workspace, &["worktree", "remove", path_string.as_str()]),
        ) {
            Ok(_) => {
                append_archive(
                    &archive,
                    &task_archive_record(
                        input.project_id.trim(),
                        task,
                        "removed",
                        "git worktree remove completed without force",
                    ),
                )?;
                removed_task_ids.push(task.task_id.clone());
            }
            Err(reason) => {
                append_archive(
                    &archive,
                    &task_archive_record(input.project_id.trim(), task, "remove-failed", &reason),
                )?;
                skipped.push(WorktreeCleanupSkip {
                    task_id: task.task_id.clone(),
                    reason,
                });
            }
        }
    }

    let pruned = run_checked("git", &git_args(&workspace, &["worktree", "prune"]))
        .map(|_| true)
        .unwrap_or(false);

    if expected_root.exists() {
        let is_empty = fs::read_dir(&expected_root)
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(false);
        if is_empty {
            let _ = fs::remove_dir(&expected_root);
        }
    }

    Ok(CleanupProjectWorktreesResult {
        archive_path: archive.to_string_lossy().to_string(),
        removed_task_ids,
        already_absent_task_ids,
        skipped,
        pruned,
    })
}

#[tauri::command]
pub async fn cleanup_project_worktrees(
    app: AppHandle,
    input: CleanupProjectWorktreesInput,
) -> Result<CleanupProjectWorktreesResult, String> {
    tauri::async_runtime::spawn_blocking(move || cleanup_project_worktrees_blocking(app, input))
        .await
        .map_err(|error| format!("Worktree cleanup Runtime join 실패: {error}"))?
}
