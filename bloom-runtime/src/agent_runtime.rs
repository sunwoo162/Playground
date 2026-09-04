use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{ChildStdin, Command, Output, Stdio},
};

const MAX_JSONL_LINE_BYTES: usize = 10 * 1024 * 1024;
const MAX_AGENT_MESSAGE_DELTA_BYTES: usize = 512 * 1024;
const MAX_LOCAL_AGENT_OUTPUT_BYTES: usize = 4 * 1024 * 1024;

const AGENT_RESULT_SCHEMA: &str = r#"{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "status",
    "summary",
    "rationaleSummary",
    "evidence",
    "verification",
    "commitSha",
    "pullRequestNumber",
    "pullRequestUrl",
    "reviewedPullRequests",
    "blockers"
  ],
  "properties": {
    "status": { "type": "string", "enum": ["completed", "blocked"] },
    "summary": { "type": "string", "minLength": 1, "maxLength": 1600 },
    "rationaleSummary": { "type": "string", "minLength": 1, "maxLength": 1600 },
    "evidence": {
      "type": "array",
      "maxItems": 30,
      "items": { "type": "string", "minLength": 1, "maxLength": 500 }
    },
    "verification": {
      "type": "array",
      "maxItems": 30,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["name", "status", "details"],
        "properties": {
          "name": { "type": "string", "minLength": 1, "maxLength": 120 },
          "status": { "type": "string", "enum": ["passed", "failed", "blocked", "not-run"] },
          "details": { "type": "string", "maxLength": 800 }
        }
      }
    },
    "commitSha": { "type": ["string", "null"] },
    "pullRequestNumber": { "type": ["integer", "null"], "minimum": 1 },
    "pullRequestUrl": { "type": ["string", "null"] },
    "reviewedPullRequests": {
      "type": "array",
      "maxItems": 30,
      "items": { "type": "integer", "minimum": 1 }
    },
    "blockers": {
      "type": "array",
      "maxItems": 20,
      "items": { "type": "string", "minLength": 1, "maxLength": 600 }
    }
  }
}"#;

const ALLOWED_TEAMS: &[&str] = &["rose", "lily", "tulip", "sunflower", "cherry-blossom"];
const ALLOWED_ROLES: &[&str] = &[
    "idea",
    "design-system",
    "designer",
    "frontend",
    "backend",
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyArtifact {
    pub task_id: String,
    pub role: String,
    pub summary: String,
    pub branch_name: Option<String>,
    pub commit_sha: Option<String>,
    pub pull_request_number: Option<u64>,
    pub pull_request_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTaskRuntimeInput {
    pub organization: String,
    pub project_id: String,
    pub team_id: String,
    pub team_name: String,
    pub role: String,
    pub agent_id: String,
    pub task_id: String,
    pub task_slug: String,
    pub title: String,
    pub summary: String,
    pub acceptance_criteria: Vec<String>,
    pub user_request: String,
    pub product_summary: String,
    pub architecture_summary: String,
    pub repository_full_name: String,
    pub workspace_path: String,
    #[serde(default)]
    pub dependencies: Vec<DependencyArtifact>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationResult {
    pub name: String,
    pub status: String,
    pub details: String,
}

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCommandObservation {
    pub step: u64,
    pub command: String,
    pub command_class: String,
    pub ok: bool,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePublicationObservation {
    pub branch_name: String,
    pub commit_sha: String,
    pub pull_request_number: Option<u64>,
    pub pull_request_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCompletionObservations {
    pub commands: Vec<RuntimeCommandObservation>,
    pub publication: Option<RuntimePublicationObservation>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTaskRunResult {
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
    pub completion_observations: Option<RuntimeCompletionObservations>,
    pub report: AgentTaskReport,
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

struct AgentToolStateGuard {
    root: PathBuf,
}

impl AgentToolStateGuard {
    fn prepare(root: PathBuf) -> Result<Self, String> {
        if root.exists() {
            fs::remove_dir_all(&root)
                .map_err(|error| format!("stale Agent tool state 정리 실패: {error}"))?;
        }
        fs::create_dir_all(&root)
            .map_err(|error| format!("Agent tool state root 생성 실패: {error}"))?;
        Ok(Self { root })
    }
}

impl Drop for AgentToolStateGuard {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
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

fn validate_organization(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 100
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("Organization 이름 형식이 잘못되었습니다.".to_string());
    }
    Ok(())
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

fn is_review_role(role: &str) -> bool {
    matches!(
        role,
        "code-review" | "reviewer" | "qa" | "user-a" | "user-b" | "process-evaluator"
    )
}

fn local_branch_exists(workspace: &Path, branch: &str) -> bool {
    let branch_ref = format!("refs/heads/{branch}");
    run_command(
        "git",
        &git_args(workspace, &["show-ref", "--verify", "--quiet", branch_ref.as_str()]),
    )
    .map(|output| output.status.success())
    .unwrap_or(false)
}

fn remote_branch_exists(workspace: &Path, branch: &str) -> bool {
    let branch_ref = format!("refs/remotes/origin/{branch}");
    run_command(
        "git",
        &git_args(workspace, &["show-ref", "--verify", "--quiet", branch_ref.as_str()]),
    )
    .map(|output| output.status.success())
    .unwrap_or(false)
}

fn prepare_agent_worktree(input: &AgentTaskRuntimeInput) -> Result<(PathBuf, Option<String>), String> {
    let workspace = PathBuf::from(input.workspace_path.trim());
    if !workspace.join(".git").exists() {
        return Err("프로젝트 workspace가 Git 저장소가 아닙니다.".to_string());
    }

    run_checked("git", &git_args(&workspace, &["fetch", "origin", "--prune"]))?;
    if !remote_branch_exists(&workspace, "develop") {
        return Err("origin/develop 브랜치를 찾을 수 없습니다.".to_string());
    }

    let workspace_root = workspace
        .parent()
        .ok_or_else(|| "workspace 상위 경로를 확인할 수 없습니다.".to_string())?;
    let worktree = workspace_root
        .join(".luna-worktrees")
        .join(&input.project_id)
        .join(&input.task_id);
    if let Some(worktree_parent) = worktree.parent() {
        fs::create_dir_all(worktree_parent)
            .map_err(|error| format!("Agent worktree 상위 경로 생성 실패: {error}"))?;
    }

    let branch = is_repository_writer(&input.role)
        .then(|| format!("agent/{}/{}/{}-{}", input.team_id, input.role, input.project_id, input.task_slug));

    if worktree.exists() {
        if !worktree.join(".git").exists() {
            return Err(format!(
                "{} 경로가 이미 존재하지만 Git worktree가 아닙니다.",
                worktree.to_string_lossy()
            ));
        }
        if let Some(expected_branch) = &branch {
            let output = run_checked("git", &git_args(&worktree, &["branch", "--show-current"]))?;
            let current = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if current != *expected_branch {
                return Err(format!(
                    "기존 Agent worktree 브랜치가 예상과 다릅니다. expected={expected_branch}, actual={current}"
                ));
            }
        }
        return Ok((worktree, branch));
    }

    let path = worktree.to_string_lossy().to_string();
    if let Some(branch_name) = &branch {
        if local_branch_exists(&workspace, branch_name) {
            run_checked(
                "git",
                &git_args(&workspace, &["worktree", "add", path.as_str(), branch_name.as_str()]),
            )?;
        } else if remote_branch_exists(&workspace, branch_name) {
            let remote = format!("origin/{branch_name}");
            run_checked(
                "git",
                &git_args(
                    &workspace,
                    &["worktree", "add", "-b", branch_name.as_str(), "--no-track", path.as_str(), remote.as_str()],
                ),
            )?;
        } else {
            run_checked(
                "git",
                &git_args(
                    &workspace,
                    &["worktree", "add", "-b", branch_name.as_str(), "--no-track", path.as_str(), "origin/develop"],
                ),
            )?;
        }
    } else {
        run_checked(
            "git",
            &git_args(&workspace, &["worktree", "add", "--detach", path.as_str(), "origin/develop"]),
        )?;
    }

    Ok((worktree, branch))
}


fn materialize_dependency_commits(
    input: &AgentTaskRuntimeInput,
    worktree: &Path,
) -> Result<(), String> {
    if !is_repository_writer(&input.role) {
        return Ok(());
    }

    for dependency in &input.dependencies {
        let Some(commit_sha) = dependency.commit_sha.as_deref() else {
            continue;
        };
        if commit_sha.len() != 40 || !commit_sha.chars().all(|character| character.is_ascii_hexdigit()) {
            return Err(format!(
                "Dependency {} commit SHA 형식이 잘못되었습니다: {}",
                dependency.task_id, commit_sha
            ));
        }

        let merge = run_command(
            "git",
            &git_args(worktree, &["merge", "--no-edit", commit_sha]),
        )?;
        if merge.status.success() {
            continue;
        }

        let unmerged = run_checked(
            "git",
            &git_args(worktree, &["diff", "--name-only", "--diff-filter=U"]),
        )?;
        if String::from_utf8_lossy(&unmerged.stdout).trim().is_empty() {
            return Err(format!(
                "Dependency {} commit {} merge 실패: {}",
                dependency.task_id,
                commit_sha,
                output_detail(&merge)
            ));
        }

        run_checked("git", &git_args(worktree, &["add", "-A"]))?;
        let commit_message = format!("chore : materialize dependency {}", dependency.task_id);
        run_checked(
            "git",
            &git_args(
                worktree,
                &["commit", "--no-verify", "-m", commit_message.as_str()],
            ),
        )?;
    }

    Ok(())
}

fn dependency_context(dependencies: &[DependencyArtifact]) -> String {
    if dependencies.is_empty() {
        return "- 없음".to_string();
    }

    dependencies
        .iter()
        .map(|dependency| {
            format!(
                "- {} [{}] {} | branch={} | commit={} | PR={} {}",
                dependency.task_id,
                dependency.role,
                dependency.summary,
                dependency.branch_name.as_deref().unwrap_or("-"),
                dependency.commit_sha.as_deref().unwrap_or("-"),
                dependency
                    .pull_request_number
                    .map(|number| format!("#{number}"))
                    .unwrap_or_else(|| "-".to_string()),
                dependency.pull_request_url.as_deref().unwrap_or("")
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn agent_prompt(input: &AgentTaskRuntimeInput, branch: Option<&str>) -> String {
    let criteria = input
        .acceptance_criteria
        .iter()
        .map(|criterion| format!("- {criterion}"))
        .collect::<Vec<_>>()
        .join("\n");
    let dependencies = dependency_context(&input.dependencies);
    let mode = if is_repository_writer(&input.role) {
        format!(
            "You are a repository-changing worker. Your dedicated branch is `{}`. Inspect the actual repository first, implement the task in this worktree, and run applicable verification. Formatting, lint, and test failures caused by your task changes are defects to fix before returning completed. If an applicable verification command cannot run because the execution environment is genuinely unavailable, record the exact command and error; do not treat a not-yet-deployed public URL as a blocker unless this task owns deployment. Git metadata is owned by Luna Runtime and the local model tool boundary forbids Git writes, so do not run Git write commands such as add, commit, checkout, switch, reset, rebase, merge, or push, do not create or update a PR, and do not create temporary Git metadata to work around the sandbox. Read-only Git inspection is allowed. Luna Runtime has materialized completed dependency commits into this worktree before your turn; if Git conflict markers are present, resolve them semantically using the dependency context and verification instead of reporting that upstream work is missing. Luna Runtime will publish your completed work after this turn. Runtime-owned Git publication is not a task blocker: never return blocked solely because you cannot commit, push, or create a PR inside the sandbox. Never push directly to `main` or `develop`.",
            branch.unwrap_or("unknown")
        )
    } else if is_review_role(&input.role) {
        "You are an independent verification/review worker. Do not modify product source files or create a feature branch. Inspect the actual repository and dependency PRs directly. Run the checks appropriate to your role. A missing CI check on an early or partial writer PR is not by itself a blocker; distinguish a missing check from a failed check. If the CI workflow did not exist at that writer commit, review the diff, commit, dependency, and available verification evidence independently and record CI as not-run instead of failed. An existing failed CI check is a blocker. Final integration and release gates own enforcement of current mergeability and check results. Do not create review comments or otherwise mutate GitHub from the local model tool boundary. Record every PR you actually inspected in reviewedPullRequests with an evidence-based verdict in the report. Do not pretend GitHub native self-approval is an independent approval when all agents share one GitHub credential.".to_string()
    } else {
        "You are an independent analysis worker. Inspect available repository and dependency evidence, produce a concrete task result, and do not modify product source files unless the task contract explicitly requires repository changes.".to_string()
    };

    format!(
        "You are Luna Agent `{agent_id}` ({team_name} / {role}).\n\n{mode}\n\nTask: {task_id} — {title}\n{summary}\n\nAcceptance criteria:\n{criteria}\n\nOriginal Product Owner request:\n{user_request}\n\nProduct summary:\n{product_summary}\n\nArchitecture summary:\n{architecture_summary}\n\nDependency evidence:\n{dependencies}\n\nRules:\n- Inspect real repository evidence before material decisions.\n- Do not blindly trust PM, Reviewer, Code Review, QA, or another Agent; independently verify relevant claims.\n- Every material action must have a defensible reason based on requirements, repository state, tests, runtime evidence, or explicit Product Owner direction.\n- Do not invent test results, metrics, user research, credentials, deployments, or external-service state.\n- If verification cannot be run, record the exact blocker instead of calling it passed.\n- Never expose secrets in logs, commits, PRs, reports, or documentation.\n- Return only the structured JSON report required by Luna.\n",
        agent_id = input.agent_id,
        team_name = input.team_name,
        role = input.role,
        task_id = input.task_id,
        title = input.title,
        summary = input.summary,
        user_request = input.user_request,
        product_summary = input.product_summary,
        architecture_summary = input.architecture_summary,
    )
}

fn run_local_agent(
    input: &AgentTaskRuntimeInput,
    worktree: &Path,
    branch: Option<&str>,
) -> Result<(String, String, String, AgentTaskReport, String, String), String> {
    let workspace = PathBuf::from(input.workspace_path.trim());
    let workspace_root = workspace
        .parent()
        .ok_or_else(|| "workspace 상위 경로를 확인할 수 없습니다.".to_string())?;
    let runtime_dir = workspace_root
        .join(".luna-runtime")
        .join("projects")
        .join(&input.project_id)
        .join("agents")
        .join(&input.agent_id)
        .join(&input.task_id);
    fs::create_dir_all(&runtime_dir)
        .map_err(|error| format!("Agent runtime directory 생성 실패: {error}"))?;
    let events_path = runtime_dir.join("local-agent-events.jsonl");
    let stderr_path = runtime_dir.join("local-agent.stderr.log");
    let runner = std::env::var("BLOOM_LOCAL_AGENT_RUNNER_PATH")
        .map_err(|_| "BLOOM_LOCAL_AGENT_RUNNER_PATH is required.".to_string())?;
    if !Path::new(runner.trim()).is_file() {
        return Err(format!("Bloom Local Agent runner를 찾을 수 없습니다: {runner}"));
    }

    let tool_state_root = std::env::temp_dir()
        .join("luna-agent-tools")
        .join(&input.project_id)
        .join(&input.task_id);
    let _tool_state_guard = AgentToolStateGuard::prepare(tool_state_root.clone())?;
    let pnpm_home = tool_state_root.join("pnpm-home");
    let xdg_data_home = tool_state_root.join("xdg-data");
    let xdg_cache_home = tool_state_root.join("xdg-cache");
    let xdg_state_home = tool_state_root.join("xdg-state");
    let npm_cache = tool_state_root.join("npm-cache");
    let corepack_home = tool_state_root.join("corepack");
    for directory in [&pnpm_home, &xdg_data_home, &xdg_cache_home, &xdg_state_home, &npm_cache, &corepack_home] {
        fs::create_dir_all(directory)
            .map_err(|error| format!("Agent tool state directory 생성 실패: {error}"))?;
    }

    let mut child = Command::new("node")
        .arg(runner.trim())
        .current_dir(worktree)
        .env("PNPM_HOME", &pnpm_home)
        .env("XDG_DATA_HOME", &xdg_data_home)
        .env("XDG_CACHE_HOME", &xdg_cache_home)
        .env("XDG_STATE_HOME", &xdg_state_home)
        .env("npm_config_cache", &npm_cache)
        .env("COREPACK_HOME", &corepack_home)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Bloom Local Agent runner 실행 실패: {error}"))?;
    let mut stdin = child.stdin.take().ok_or_else(|| "Local Agent stdin을 열 수 없습니다.".to_string())?;
    serde_json::to_writer(
        &mut stdin,
        &json!({
            "mode": "agent",
            "projectId": input.project_id,
            "taskId": input.task_id,
            "worktree": worktree.to_string_lossy(),
            "prompt": agent_prompt(input, branch),
            "requireMutation": is_repository_writer(&input.role),
            "eventsPath": events_path.to_string_lossy(),
        }),
    )
    .map_err(|error| format!("Local Agent 요청 직렬화 실패: {error}"))?;
    stdin.write_all(b"
").and_then(|_| stdin.flush())
        .map_err(|error| format!("Local Agent 요청 전송 실패: {error}"))?;
    drop(stdin);

    let output = child.wait_with_output()
        .map_err(|error| format!("Local Agent 실행 결과 확인 실패: {error}"))?;
    fs::write(&stderr_path, &output.stderr)
        .map_err(|error| format!("Local Agent stderr 저장 실패: {error}"))?;
    if output.stdout.len() > MAX_LOCAL_AGENT_OUTPUT_BYTES || output.stderr.len() > MAX_LOCAL_AGENT_OUTPUT_BYTES {
        return Err(format!("Local Agent output exceeded the safe limit. limit={MAX_LOCAL_AGENT_OUTPUT_BYTES}"));
    }
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() { "Local Agent runner failed.".to_string() } else { format!("Local Agent runner failed: {detail}") });
    }
    let result: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Local Agent result JSON parsing failed: {error}"))?;
    let session_id = result.get("sessionId").and_then(Value::as_str)
        .ok_or_else(|| "Local Agent sessionId가 없습니다.".to_string())?.to_string();
    let turn_id = result.get("turnId").and_then(Value::as_str)
        .ok_or_else(|| "Local Agent turnId가 없습니다.".to_string())?.to_string();
    let report: AgentTaskReport = serde_json::from_value(
        result.get("report").cloned().ok_or_else(|| "Local Agent report가 없습니다.".to_string())?
    ).map_err(|error| format!("Local Agent report JSON parsing failed: {error}"))?;
    if !matches!(report.status.as_str(), "completed" | "blocked") {
        return Err(format!("Local Agent report status가 잘못되었습니다: {}", report.status));
    }
    let events = result.get("events").and_then(Value::as_array)
        .map(|items| items.iter().map(Value::to_string).collect::<Vec<_>>().join("
"))
        .unwrap_or_default();
    fs::write(&events_path, events)
        .map_err(|error| format!("Local Agent event log 저장 실패: {error}"))?;
    Ok((
        session_id.clone(),
        session_id,
        turn_id,
        report,
        events_path.to_string_lossy().to_string(),
        stderr_path.to_string_lossy().to_string(),
    ))
}

fn is_runtime_owned_publication_blocker(blocker: &String) -> bool {
    let normalized = blocker.to_ascii_lowercase();
    let names_publication = normalized.contains("commit")
        && (normalized.contains(" pr") || normalized.contains("pull request"));
    let names_runtime_owner = normalized.contains("luna runtime")
        && normalized.contains("publish");
    let names_sandbox_limit = normalized.contains("git write")
        || normalized.contains("sandbox")
        || normalized.contains("prohibit");
    names_publication && names_runtime_owner && names_sandbox_limit
}

fn recover_runtime_owned_publication_blocker(
    input: &AgentTaskRuntimeInput,
    worktree: &Path,
    report: &mut AgentTaskReport,
) -> Result<(), String> {
    if !is_repository_writer(&input.role)
        || report.status != "blocked"
        || report.blockers.is_empty()
    {
        return Ok(());
    }

    if report.verification.iter().any(|verification| {
        verification.status == "failed" || verification.status == "blocked"
    }) {
        return Ok(());
    }
    if !report.blockers.iter().all(is_runtime_owned_publication_blocker) {
        return Ok(());
    }

    let status = run_checked("git", &git_args(worktree, &["status", "--porcelain"]))?;
    if String::from_utf8_lossy(&status.stdout).trim().is_empty() {
        return Ok(());
    }

    report.status = "completed".to_string();
    report.evidence.push(
        "Luna Runtime recovered a publication-only blocker after confirming repository changes remain in the writer worktree; Runtime owns commit and PR publication."
            .to_string(),
    );
    report.blockers.clear();
    Ok(())
}

fn publish_repository_writer_result(
    input: &AgentTaskRuntimeInput,
    worktree: &Path,
    branch: &str,
    report: &mut AgentTaskReport,
) -> Result<(), String> {
    if report.status != "completed" {
        return Ok(());
    }

    let current_branch = run_checked("git", &git_args(worktree, &["branch", "--show-current"]))?;
    let current_branch = String::from_utf8_lossy(&current_branch.stdout).trim().to_string();
    if current_branch != branch {
        return Err(format!("Agent가 예상 브랜치를 벗어났습니다: {current_branch}"));
    }

    let status = run_checked("git", &git_args(worktree, &["status", "--porcelain"]))?;
    if !String::from_utf8_lossy(&status.stdout).trim().is_empty() {
        run_checked("git", &git_args(worktree, &["add", "-A"]))?;
        let commit_message = format!("task: {} {}", input.task_id, input.title);
        run_checked(
            "git",
            &git_args(worktree, &["commit", "-m", commit_message.as_str()]),
        )?;
    }

    run_checked("git", &git_args(worktree, &["push", "origin", branch]))?;

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
            "number".to_string(),
        ],
    )?;
    let prs: Vec<Value> = serde_json::from_slice(&pr_output.stdout)
        .map_err(|error| format!("Agent PR publish 확인 결과 파싱 실패: {error}"))?;
    if prs.is_empty() {
        let pr_title = format!("{}: {}", input.task_id, input.title);
        let pr_body = format!(
            "Luna Agent `{}` completed `{}`.\n\n{}",
            input.agent_id, input.task_id, report.summary
        );
        run_checked(
            "gh",
            &[
                "pr".to_string(),
                "create".to_string(),
                "--repo".to_string(),
                input.repository_full_name.clone(),
                "--head".to_string(),
                branch.to_string(),
                "--base".to_string(),
                "develop".to_string(),
                "--title".to_string(),
                pr_title,
                "--body".to_string(),
                pr_body,
            ],
        )?;
    }

    verify_repository_writer_result(input, worktree, branch, report)
}

fn verify_repository_writer_result(
    input: &AgentTaskRuntimeInput,
    worktree: &Path,
    branch: &str,
    report: &mut AgentTaskReport,
) -> Result<(), String> {
    if report.status != "completed" {
        return Ok(());
    }

    let current_branch = run_checked("git", &git_args(worktree, &["branch", "--show-current"]))?;
    let current_branch = String::from_utf8_lossy(&current_branch.stdout).trim().to_string();
    if current_branch != branch {
        return Err(format!("Agent가 예상 브랜치를 벗어났습니다: {current_branch}"));
    }

    let status = run_checked("git", &git_args(worktree, &["status", "--porcelain"]))?;
    if !String::from_utf8_lossy(&status.stdout).trim().is_empty() {
        return Err("Agent가 completed를 반환했지만 worktree에 커밋되지 않은 변경이 남아 있습니다.".to_string());
    }

    let head = run_checked("git", &git_args(worktree, &["rev-parse", "HEAD"]))?;
    let head_sha = String::from_utf8_lossy(&head.stdout).trim().to_string();

    let remote = run_checked("git", &git_args(worktree, &["ls-remote", "--heads", "origin", branch]))?;
    let remote_line = String::from_utf8_lossy(&remote.stdout).trim().to_string();
    if remote_line.is_empty() {
        return Err("Agent가 completed를 반환했지만 원격 branch가 존재하지 않습니다.".to_string());
    }
    let remote_sha = remote_line
        .split_whitespace()
        .next()
        .ok_or_else(|| "원격 branch SHA를 확인할 수 없습니다.".to_string())?;
    if remote_sha != head_sha {
        return Err(format!(
            "Agent local HEAD와 원격 branch SHA가 다릅니다. local={head_sha}, remote={remote_sha}"
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
        .map_err(|error| format!("Agent PR 검증 결과 파싱 실패: {error}"))?;
    let pr = prs.first().ok_or_else(|| {
        "Agent가 completed를 반환했지만 develop 대상 open PR을 찾을 수 없습니다.".to_string()
    })?;
    let pr_number = pr
        .get("number")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Agent PR number를 확인할 수 없습니다.".to_string())?;
    let pr_url = pr
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| "Agent PR URL을 확인할 수 없습니다.".to_string())?
        .to_string();

    report.commit_sha = Some(head_sha);
    report.pull_request_number = Some(pr_number);
    report.pull_request_url = Some(pr_url);
    Ok(())
}

fn validate_input(input: &AgentTaskRuntimeInput) -> Result<(), String> {
    validate_organization(input.organization.trim())?;
    validate_project_id(&input.project_id)?;
    validate_task_id(&input.task_id)?;
    validate_segment(&input.team_id, "Team ID")?;
    validate_segment(&input.role, "Agent role")?;
    validate_segment(&input.task_slug, "Task slug")?;

    if !ALLOWED_TEAMS.contains(&input.team_id.as_str()) {
        return Err(format!("허용되지 않은 Team ID입니다: {}", input.team_id));
    }
    if !ALLOWED_ROLES.contains(&input.role.as_str()) {
        return Err(format!("허용되지 않은 Agent role입니다: {}", input.role));
    }
    if input.agent_id.trim().is_empty() {
        return Err("Agent ID가 비어 있습니다.".to_string());
    }
    if input.title.trim().is_empty() || input.summary.trim().is_empty() {
        return Err("Task 제목 또는 설명이 비어 있습니다.".to_string());
    }
    if input.acceptance_criteria.is_empty() {
        return Err("Task acceptance criteria가 없습니다.".to_string());
    }
    if input.workspace_path.trim().is_empty() {
        return Err("Project workspace path가 비어 있습니다.".to_string());
    }

    let (owner, repository) = input
        .repository_full_name
        .trim()
        .split_once('/')
        .ok_or_else(|| "Repository는 owner/name 형식이어야 합니다.".to_string())?;
    if owner != input.organization.trim() || repository.is_empty() || repository.contains('/') {
        return Err("Repository가 설정된 Organization과 일치하지 않습니다.".to_string());
    }

    Ok(())
}

fn dispatch_agent_task_blocking(input: AgentTaskRuntimeInput) -> Result<AgentTaskRunResult, String> {
    validate_input(&input)?;
    let (worktree, branch) = prepare_agent_worktree(&input)?;
    materialize_dependency_commits(&input, &worktree)?;
    let (thread_id, session_id, turn_id, mut report, events_path, stderr_path) =
        run_local_agent(&input, &worktree, branch.as_deref())?;

    if branch.is_some() {
        recover_runtime_owned_publication_blocker(&input, &worktree, &mut report)?;
    }
    if let Some(branch_name) = branch.as_deref() {
        publish_repository_writer_result(&input, &worktree, branch_name, &mut report)?;
    }

    Ok(AgentTaskRunResult {
        project_id: input.project_id,
        task_id: input.task_id,
        role: input.role,
        agent_id: input.agent_id,
        branch_name: branch,
        worktree_path: worktree.to_string_lossy().to_string(),
        thread_id,
        session_id,
        turn_id,
        events_path,
        stderr_path,
        completion_observations: None,
        report,
    })
}

pub async fn dispatch_agent_task(input: AgentTaskRuntimeInput) -> Result<AgentTaskRunResult, String> {
    tauri::async_runtime::spawn_blocking(move || dispatch_agent_task_blocking(input))
        .await
        .map_err(|error| format!("Agent Runtime join 실패: {error}"))?
}