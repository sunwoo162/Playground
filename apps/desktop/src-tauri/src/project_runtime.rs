use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
};

const PM_PLAN_SCHEMA: &str = r#"{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectName",
    "repositoryName",
    "productSummary",
    "architectureSummary",
    "needsAuth",
    "technologyDecisions",
    "tasks"
  ],
  "properties": {
    "projectName": { "type": "string", "minLength": 1, "maxLength": 80 },
    "repositoryName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80,
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$"
    },
    "productSummary": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "architectureSummary": { "type": "string", "minLength": 1, "maxLength": 1800 },
    "needsAuth": { "type": "boolean" },
    "technologyDecisions": {
      "type": "array",
      "maxItems": 20,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["area", "choice", "reason"],
        "properties": {
          "area": { "type": "string", "minLength": 1, "maxLength": 80 },
          "choice": { "type": "string", "minLength": 1, "maxLength": 160 },
          "reason": { "type": "string", "minLength": 1, "maxLength": 500 }
        }
      }
    },
    "tasks": {
      "type": "array",
      "minItems": 1,
      "maxItems": 40,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "title",
          "role",
          "taskSlug",
          "summary",
          "dependsOn",
          "acceptanceCriteria"
        ],
        "properties": {
          "id": { "type": "string", "pattern": "^[A-Z]+-[0-9]{3}$" },
          "title": { "type": "string", "minLength": 1, "maxLength": 120 },
          "role": {
            "type": "string",
            "enum": [
              "idea",
              "design-system",
              "designer",
              "frontend",
              "backend",
              "code-review",
              "reviewer",
              "qa",
              "documentation",
              "debug-router",
              "user-a",
              "user-b",
              "process-evaluator"
            ]
          },
          "taskSlug": {
            "type": "string",
            "minLength": 1,
            "maxLength": 48,
            "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$"
          },
          "summary": { "type": "string", "minLength": 1, "maxLength": 800 },
          "dependsOn": {
            "type": "array",
            "maxItems": 20,
            "items": { "type": "string", "pattern": "^[A-Z]+-[0-9]{3}$" }
          },
          "acceptanceCriteria": {
            "type": "array",
            "minItems": 1,
            "maxItems": 12,
            "items": { "type": "string", "minLength": 1, "maxLength": 400 }
          }
        }
      }
    }
  }
}"#;

const ALLOWED_PM_TASK_ROLES: &[&str] = &[
    "idea",
    "design-system",
    "designer",
    "frontend",
    "backend",
    "code-review",
    "reviewer",
    "qa",
    "documentation",
    "debug-router",
    "user-a",
    "user-b",
    "process-evaluator",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRuntimePreflight {
    organization: String,
    git_available: bool,
    gh_available: bool,
    gh_authenticated: bool,
    codex_available: bool,
    codex_authenticated: bool,
    codex_chatgpt_auth: bool,
    codex_auth_mode: String,
    organization_accessible: bool,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryBootstrap {
    repository: String,
    workspace_path: String,
    created_repository: bool,
    cloned_repository: bool,
    release_branch: String,
    integration_branch: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TechnologyDecision {
    area: String,
    choice: String,
    reason: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectTaskPlan {
    id: String,
    title: String,
    role: String,
    task_slug: String,
    summary: String,
    depends_on: Vec<String>,
    acceptance_criteria: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PmProjectPlan {
    project_name: String,
    repository_name: String,
    product_summary: String,
    architecture_summary: String,
    needs_auth: bool,
    technology_decisions: Vec<TechnologyDecision>,
    tasks: Vec<ProjectTaskPlan>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PmCodexRunResult {
    plan: PmProjectPlan,
    session_id: Option<String>,
    events_path: String,
    output_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartProjectRuntimeResult {
    pm: PmCodexRunResult,
    repository: ProjectRepositoryBootstrap,
}

fn run_command(program: &str, args: &[String]) -> Result<Output, String> {
    Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("{program} 실행 실패: {error}"))
}

fn command_succeeds(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn output_detail(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stderr.is_empty() { stderr } else { stdout }
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
        return Ok(output);
    }

    let detail = output_detail(&output);
    Err(if detail.is_empty() {
        format!("{program} 명령이 실패했습니다.")
    } else {
        format!("{program} 명령 실패: {detail}")
    })
}

fn validate_github_name(value: &str, label: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() || matches!(value, "." | "..") || value.len() > 100 {
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

fn is_lower_kebab(value: &str) -> bool {
    let mut has_character = false;
    let mut previous_dash = false;
    for character in value.chars() {
        if character.is_ascii_lowercase() || character.is_ascii_digit() {
            has_character = true;
            previous_dash = false;
        } else if character == '-' && has_character && !previous_dash {
            previous_dash = true;
        } else {
            return false;
        }
    }
    has_character && !previous_dash
}

fn is_task_id(value: &str) -> bool {
    let Some((prefix, number)) = value.rsplit_once('-') else {
        return false;
    };
    !prefix.is_empty()
        && prefix.chars().all(|character| character.is_ascii_uppercase())
        && number.len() == 3
        && number.chars().all(|character| character.is_ascii_digit())
}

fn validate_project_plan(plan: &PmProjectPlan) -> Result<(), String> {
    validate_github_name(&plan.repository_name, "PM repository")?;
    if !is_lower_kebab(&plan.repository_name) || plan.repository_name.len() > 80 {
        return Err("PM repositoryName은 80자 이하 lowercase ASCII kebab-case여야 합니다.".to_string());
    }
    if plan.project_name.trim().is_empty()
        || plan.product_summary.trim().is_empty()
        || plan.architecture_summary.trim().is_empty()
    {
        return Err("PM 계획의 핵심 제품 정보가 비어 있습니다.".to_string());
    }
    if plan.tasks.is_empty() || plan.tasks.len() > 40 {
        return Err("PM 계획의 Task 수가 허용 범위를 벗어났습니다.".to_string());
    }

    let mut ids = HashSet::new();
    let mut slugs = HashSet::new();
    for task in &plan.tasks {
        if !is_task_id(&task.id) {
            return Err(format!("Task ID 형식이 잘못되었습니다: {}", task.id));
        }
        if !is_lower_kebab(&task.task_slug) || task.task_slug.len() > 48 {
            return Err(format!("taskSlug 형식이 잘못되었습니다: {}", task.task_slug));
        }
        if task.title.trim().is_empty() || task.summary.trim().is_empty() {
            return Err(format!("{} Task의 제목 또는 설명이 비어 있습니다.", task.id));
        }
        if !ALLOWED_PM_TASK_ROLES.contains(&task.role.as_str()) {
            return Err(format!("허용되지 않은 Agent role입니다: {}", task.role));
        }
        if !ids.insert(task.id.as_str()) {
            return Err(format!("Task ID가 중복됩니다: {}", task.id));
        }
        if !slugs.insert(task.task_slug.as_str()) {
            return Err(format!("taskSlug가 중복됩니다: {}", task.task_slug));
        }
        if task.acceptance_criteria.is_empty() {
            return Err(format!("{} Task에 acceptance criteria가 없습니다.", task.id));
        }
    }

    for task in &plan.tasks {
        for dependency in &task.depends_on {
            if !ids.contains(dependency.as_str()) {
                return Err(format!(
                    "{} Task가 존재하지 않는 dependency {}를 참조합니다.",
                    task.id, dependency
                ));
            }
            if dependency == &task.id {
                return Err(format!("{} Task가 자기 자신을 dependency로 참조합니다.", task.id));
            }
        }
    }

    let mut completed = HashSet::new();
    while completed.len() < plan.tasks.len() {
        let before = completed.len();
        for task in &plan.tasks {
            if completed.contains(task.id.as_str()) {
                continue;
            }
            if task
                .depends_on
                .iter()
                .all(|dependency| completed.contains(dependency.as_str()))
            {
                completed.insert(task.id.as_str());
            }
        }
        if completed.len() == before {
            return Err("PM 계획의 Task dependency에 순환 참조가 있습니다.".to_string());
        }
    }

    Ok(())
}

fn git_args(workspace: &Path, tail: &[&str]) -> Vec<String> {
    let mut args = vec!["-C".to_string(), workspace.to_string_lossy().to_string()];
    args.extend(tail.iter().map(|value| value.to_string()));
    args
}

fn remote_branch_exists(workspace: &Path, branch: &str) -> bool {
    let remote_ref = format!("refs/remotes/origin/{branch}");
    run_command(
        "git",
        &git_args(workspace, &["rev-parse", "--verify", "--quiet", remote_ref.as_str()]),
    )
    .map(|output| output.status.success())
    .unwrap_or(false)
}

fn ensure_clean_workspace(workspace: &Path) -> Result<(), String> {
    let output = run_checked("git", &git_args(workspace, &["status", "--porcelain"]))?;
    if String::from_utf8_lossy(&output.stdout).trim().is_empty() {
        Ok(())
    } else {
        Err("기존 프로젝트 workspace에 커밋되지 않은 변경이 있어 bootstrap을 중단했습니다.".to_string())
    }
}

fn ensure_expected_origin(workspace: &Path, organization: &str, repository: &str) -> Result<(), String> {
    let output = run_checked("git", &git_args(workspace, &["remote", "get-url", "origin"]))?;
    let origin = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let expected_https = format!("github.com/{organization}/{repository}");
    let expected_ssh = format!("github.com:{organization}/{repository}");
    if origin.contains(expected_https.as_str()) || origin.contains(expected_ssh.as_str()) {
        Ok(())
    } else {
        Err(format!(
            "기존 workspace의 origin이 {organization}/{repository}와 일치하지 않습니다: {origin}"
        ))
    }
}

fn codex_auth_status(codex_available: bool) -> (bool, bool, String) {
    if !codex_available {
        return (false, false, "none".to_string());
    }

    let Ok(output) = Command::new("codex").args(["login", "status"]).output() else {
        return (false, false, "none".to_string());
    };
    if !output.status.success() {
        return (false, false, "none".to_string());
    }

    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
    .to_ascii_lowercase();
    let chatgpt_auth = combined.contains("chatgpt");
    (
        true,
        chatgpt_auth,
        if chatgpt_auth { "chatgpt" } else { "other" }.to_string(),
    )
}

#[tauri::command]
pub fn project_runtime_preflight(organization: String) -> ProjectRuntimePreflight {
    let organization = organization.trim().to_string();
    let git_available = command_succeeds("git", &["--version"]);
    let gh_available = command_succeeds("gh", &["--version"]);
    let codex_available = command_succeeds("codex", &["--version"]);
    let (codex_authenticated, codex_chatgpt_auth, codex_auth_mode) = codex_auth_status(codex_available);
    let gh_authenticated = gh_available
        && command_succeeds("gh", &["auth", "status", "--hostname", "github.com"]);
    let organization_accessible = if gh_authenticated && !organization.is_empty() {
        run_command(
            "gh",
            &["api".to_string(), format!("orgs/{organization}"), "--silent".to_string()],
        )
        .map(|output| output.status.success())
        .unwrap_or(false)
    } else {
        false
    };

    let message = if !codex_available {
        "Codex CLI가 필요합니다.".to_string()
    } else if !codex_authenticated {
        "Codex CLI 로그인이 필요합니다. ChatGPT 계정으로 `codex login`을 완료해 주세요.".to_string()
    } else if !codex_chatgpt_auth {
        "Codex가 API key/access token 모드입니다. Luna Runtime은 ChatGPT 로그인만 허용합니다.".to_string()
    } else if git_available && gh_available && gh_authenticated && organization_accessible {
        "Git, GitHub CLI, ChatGPT Codex 로그인과 Organization 접근이 준비되었습니다.".to_string()
    } else {
        "누락된 로컬 Runtime 조건을 확인해 주세요. ChatGPT GitHub Connector와 로컬 CLI 인증은 별도입니다.".to_string()
    };

    ProjectRuntimePreflight {
        organization,
        git_available,
        gh_available,
        gh_authenticated,
        codex_available,
        codex_authenticated,
        codex_chatgpt_auth,
        codex_auth_mode,
        organization_accessible,
        message,
    }
}

fn bootstrap_project_repository_inner(
    organization: String,
    repository: String,
    workspace_root: String,
) -> Result<ProjectRepositoryBootstrap, String> {
    let organization = organization.trim().to_string();
    let repository = repository.trim().to_string();
    let workspace_root = workspace_root.trim().to_string();

    validate_github_name(&organization, "Organization")?;
    validate_github_name(&repository, "Repository")?;
    if workspace_root.is_empty() {
        return Err("Workspace root를 먼저 설정해 주세요.".to_string());
    }

    let preflight = project_runtime_preflight(organization.clone());
    if !preflight.git_available {
        return Err("Git이 설치되어 있지 않습니다.".to_string());
    }
    if !preflight.gh_available {
        return Err("GitHub CLI(gh)가 설치되어 있지 않습니다.".to_string());
    }
    if !preflight.gh_authenticated {
        return Err("GitHub CLI 인증이 필요합니다. `gh auth login`을 실행해 주세요.".to_string());
    }
    if !preflight.organization_accessible {
        return Err(format!("GitHub CLI로 {organization} Organization에 접근할 수 없습니다."));
    }

    let root = PathBuf::from(&workspace_root);
    fs::create_dir_all(&root).map_err(|error| format!("Workspace root 생성 실패: {error}"))?;
    let full_name = format!("{organization}/{repository}");
    let repository_exists = run_command(
        "gh",
        &[
            "repo".to_string(),
            "view".to_string(),
            full_name.clone(),
            "--json".to_string(),
            "name".to_string(),
        ],
    )
    .map(|output| output.status.success())
    .unwrap_or(false);

    let mut created_repository = false;
    if !repository_exists {
        run_checked(
            "gh",
            &[
                "repo".to_string(),
                "create".to_string(),
                full_name.clone(),
                "--private".to_string(),
                "--add-readme".to_string(),
                "--description".to_string(),
                "Created by Luna Project Teams".to_string(),
            ],
        )?;
        created_repository = true;
    }

    let workspace = root.join(&repository);
    let mut cloned_repository = false;
    if workspace.exists() {
        if !workspace.join(".git").exists() {
            return Err(format!(
                "{} 경로가 이미 존재하지만 Git 저장소가 아닙니다.",
                workspace.to_string_lossy()
            ));
        }
        ensure_expected_origin(&workspace, &organization, &repository)?;
        ensure_clean_workspace(&workspace)?;
        run_checked("git", &git_args(&workspace, &["fetch", "origin", "--prune"]))?;
    } else {
        run_checked(
            "gh",
            &[
                "repo".to_string(),
                "clone".to_string(),
                full_name.clone(),
                workspace.to_string_lossy().to_string(),
            ],
        )?;
        cloned_repository = true;
    }

    if !remote_branch_exists(&workspace, "main") {
        let default_branch_output = run_checked(
            "gh",
            &[
                "repo".to_string(),
                "view".to_string(),
                full_name.clone(),
                "--json".to_string(),
                "defaultBranchRef".to_string(),
                "--jq".to_string(),
                ".defaultBranchRef.name".to_string(),
            ],
        )?;
        let default_branch = String::from_utf8_lossy(&default_branch_output.stdout).trim().to_string();
        if default_branch.is_empty() {
            return Err("Repository 기본 브랜치를 확인하지 못했습니다.".to_string());
        }
        let source = format!("origin/{default_branch}");
        run_checked(
            "git",
            &git_args(&workspace, &["checkout", "-B", "main", source.as_str()]),
        )?;
        run_checked("git", &git_args(&workspace, &["push", "-u", "origin", "main"]))?;
        run_checked("git", &git_args(&workspace, &["fetch", "origin"]))?;
    }

    if remote_branch_exists(&workspace, "develop") {
        run_checked(
            "git",
            &git_args(&workspace, &["checkout", "-B", "develop", "origin/develop"]),
        )?;
    } else {
        run_checked(
            "git",
            &git_args(&workspace, &["checkout", "-B", "develop", "origin/main"]),
        )?;
        run_checked(
            "git",
            &git_args(&workspace, &["push", "-u", "origin", "develop"]),
        )?;
    }

    Ok(ProjectRepositoryBootstrap {
        repository: full_name,
        workspace_path: workspace.to_string_lossy().to_string(),
        created_repository,
        cloned_repository,
        release_branch: "main".to_string(),
        integration_branch: "develop".to_string(),
    })
}

#[tauri::command]
pub fn bootstrap_project_repository(
    organization: String,
    repository: String,
    workspace_root: String,
) -> Result<ProjectRepositoryBootstrap, String> {
    bootstrap_project_repository_inner(organization, repository, workspace_root)
}

fn pm_prompt(
    organization: &str,
    project_id: &str,
    team_id: &str,
    team_name: &str,
    request: &str,
) -> String {
    format!(
        r#"You are the independent PM Codex Agent for Luna team {team_name} ({team_id}).

Project ID: {project_id}
GitHub Organization: {organization}
User request:
{request}

Your job in this turn is planning only. Do not create files, repositories, branches, commits, PRs, or deployments. Return the project plan that Luna will execute after this turn.

Operating contract:
- Treat the project as a real production service, not a demo or mock-only prototype.
- Default to one project monorepo unless there is a concrete reason not to.
- repositoryName must be a concise lowercase ASCII kebab-case GitHub repository name.
- If login or sign-up is required, needsAuth must be true and the implementation must use the shared 꽃다발 authentication standard.
- Choose libraries/frameworks when they materially improve reliability, security, accessibility, maintainability, performance, or delivery speed. Record each meaningful choice and its reason in technologyDecisions.
- Every participating Agent is an independent worker with its own branch/worktree, session, judgment, commit history, PR, and retrospective.
- Branch convention is agent/<team>/<role>/<task>. taskSlug must be concise lowercase ASCII kebab-case.
- Agents do not blindly trust PM or reviewers. Every material action must have a defensible, verifiable reason.
- Code Review, higher-level Reviewer, QA, Documentation, User A, User B, and Process Evaluator should be included as independent gates for a normal user-facing production service. Omit a role only when it genuinely does not apply.
- Frontend and Backend tasks may run in parallel when dependencies allow it.
- Acceptance criteria must be observable and verifiable. Include build/test/browser/error/loading/empty/security requirements where relevant.
- Do not assume external credentials, paid services, or unavailable datasets exist. Model them as explicit implementation blockers or setup tasks when necessary.
- Keep tasks independently reviewable. Avoid one giant frontend or backend task covering the whole project.
- Task dependencies must reference existing task IDs and must not form self-dependencies.
- The final response must match the supplied JSON schema exactly. No Markdown outside the JSON result.
"#
    )
}

fn extract_codex_session_id(events: &str) -> Option<String> {
    for line in events.lines() {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        for key in ["session_id", "sessionId", "thread_id", "threadId"] {
            if let Some(id) = value.get(key).and_then(Value::as_str) {
                if !id.trim().is_empty() {
                    return Some(id.to_string());
                }
            }
        }
        let event_type = value.get("type").and_then(Value::as_str).unwrap_or_default();
        if event_type.contains("thread") || event_type.contains("session") {
            if let Some(id) = value.get("id").and_then(Value::as_str) {
                if !id.trim().is_empty() {
                    return Some(id.to_string());
                }
            }
        }
    }
    None
}

fn run_pm_codex(
    organization: &str,
    workspace_root: &str,
    project_id: &str,
    team_id: &str,
    team_name: &str,
    request: &str,
) -> Result<PmCodexRunResult, String> {
    validate_github_name(organization, "Organization")?;
    validate_github_name(project_id, "Project ID")?;
    if request.trim().is_empty() {
        return Err("프로젝트 요구사항이 비어 있습니다.".to_string());
    }
    if workspace_root.trim().is_empty() {
        return Err("Workspace root를 먼저 설정해 주세요.".to_string());
    }

    let preflight = project_runtime_preflight(organization.to_string());
    if !preflight.codex_available {
        return Err("Codex CLI가 설치되어 있지 않습니다.".to_string());
    }
    if !preflight.codex_authenticated {
        return Err("Codex CLI 로그인이 필요합니다. `codex login`을 실행해 주세요.".to_string());
    }
    if !preflight.codex_chatgpt_auth {
        return Err("Luna는 ChatGPT 로그인 상태의 Codex만 실행합니다.".to_string());
    }

    let planning_dir = PathBuf::from(workspace_root)
        .join(".luna-runtime")
        .join("projects")
        .join(project_id)
        .join("pm");
    fs::create_dir_all(&planning_dir)
        .map_err(|error| format!("PM planning directory 생성 실패: {error}"))?;

    let schema_path = planning_dir.join("pm-plan.schema.json");
    let output_path = planning_dir.join("pm-plan.json");
    let events_path = planning_dir.join("pm-events.jsonl");
    fs::write(&schema_path, PM_PLAN_SCHEMA)
        .map_err(|error| format!("PM output schema 저장 실패: {error}"))?;

    let prompt = pm_prompt(organization, project_id, team_id, team_name, request.trim());
    let args = vec![
        "exec".to_string(),
        "--json".to_string(),
        "--output-schema".to_string(),
        schema_path.to_string_lossy().to_string(),
        "--output-last-message".to_string(),
        output_path.to_string_lossy().to_string(),
        "--sandbox".to_string(),
        "read-only".to_string(),
        "--skip-git-repo-check".to_string(),
        "-C".to_string(),
        planning_dir.to_string_lossy().to_string(),
        "-".to_string(),
    ];

    let output = run_checked_with_stdin("codex", &args, &prompt)?;
    fs::write(&events_path, &output.stdout)
        .map_err(|error| format!("PM Codex event log 저장 실패: {error}"))?;

    let raw_plan = fs::read_to_string(&output_path)
        .map_err(|error| format!("PM Codex 결과 파일 읽기 실패: {error}"))?;
    let plan: PmProjectPlan = serde_json::from_str(&raw_plan)
        .map_err(|error| format!("PM Codex 결과 JSON 파싱 실패: {error}"))?;
    validate_project_plan(&plan)?;

    let events = String::from_utf8_lossy(&output.stdout);
    Ok(PmCodexRunResult {
        plan,
        session_id: extract_codex_session_id(&events),
        events_path: events_path.to_string_lossy().to_string(),
        output_path: output_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn plan_project_runtime(
    organization: String,
    workspace_root: String,
    project_id: String,
    team_id: String,
    team_name: String,
    request: String,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let pm = run_pm_codex(
            organization.trim(),
            workspace_root.trim(),
            project_id.trim(),
            team_id.trim(),
            team_name.trim(),
            request.trim(),
        )?;
        serde_json::to_value(pm)
            .map_err(|error| format!("PM Runtime 결과 직렬화 실패: {error}"))
    })
    .await
    .map_err(|error| format!("PM Runtime join 실패: {error}"))?
}

fn start_project_runtime_blocking(
    organization: String,
    workspace_root: String,
    project_id: String,
    team_id: String,
    team_name: String,
    request: String,
) -> Result<StartProjectRuntimeResult, String> {
    let preflight = project_runtime_preflight(organization.clone());
    if !preflight.git_available || !preflight.gh_available || !preflight.gh_authenticated {
        return Err("Git/GitHub CLI Runtime이 준비되지 않았습니다.".to_string());
    }
    if !preflight.organization_accessible {
        return Err(format!(
            "GitHub CLI로 {} Organization에 접근할 수 없습니다.",
            organization.trim()
        ));
    }
    if !preflight.codex_chatgpt_auth {
        return Err(preflight.message);
    }

    let pm = run_pm_codex(
        organization.trim(),
        workspace_root.trim(),
        project_id.trim(),
        team_id.trim(),
        team_name.trim(),
        request.trim(),
    )?;
    let repository_name = pm.plan.repository_name.clone();
    let repository = bootstrap_project_repository_inner(
        organization,
        repository_name,
        workspace_root,
    )?;

    Ok(StartProjectRuntimeResult { pm, repository })
}

#[tauri::command]
pub async fn start_project_runtime(
    organization: String,
    workspace_root: String,
    project_id: String,
    team_id: String,
    team_name: String,
    request: String,
) -> Result<StartProjectRuntimeResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        start_project_runtime_blocking(
            organization,
            workspace_root,
            project_id,
            team_id,
            team_name,
            request,
        )
    })
    .await
    .map_err(|error| format!("PM Runtime join 실패: {error}"))?
}

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
