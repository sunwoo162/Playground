use crate::local_inference_runtime;
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
    "scaffoldProfile",
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
    "scaffoldProfile": { "type": "string", "enum": ["none", "react-api-sqlite-monorepo-v1"] },
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
              "ux-research",
              "frontend",
              "backend",
              "database",
              "security",
              "devops",
              "accessibility",
              "performance",
              "api-integration",
              "data-marketing",
              "code-review",
              "reviewer",
              "qa",
              "test-automation",
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

const SCAFFOLD_PROFILE_NONE: &str = "none";
const SCAFFOLD_PROFILE_REACT_API_SQLITE: &str = "react-api-sqlite-monorepo-v1";

const ALLOWED_PM_TASK_ROLES: &[&str] = &[
    "idea",
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
    "data-marketing",
    "code-review",
    "reviewer",
    "qa",
    "test-automation",
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
    local_inference_available: bool,
    local_inference_mode: String,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GreenfieldBootstrapResult {
    profile: String,
    commit_sha: Option<String>,
    generated_files: Vec<String>,
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
    #[serde(default = "default_scaffold_profile")]
    scaffold_profile: String,
    technology_decisions: Vec<TechnologyDecision>,
    tasks: Vec<ProjectTaskPlan>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PmLocalRunResult {
    plan: PmProjectPlan,
    session_id: Option<String>,
    events_path: String,
    output_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartProjectRuntimeResult {
    pm: PmLocalRunResult,
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

fn normalize_task_slug_collisions(plan: &mut PmProjectPlan) {
    let mut used = HashSet::new();
    for task in &mut plan.tasks {
        if used.insert(task.task_slug.clone()) { continue; }
        let suffix = task.id.to_ascii_lowercase();
        let max_base_len = 48usize.saturating_sub(suffix.len() + 1);
        let base = task.task_slug.chars().take(max_base_len).collect::<String>();
        task.task_slug = format!("{}-{}", base.trim_end_matches('-'), suffix);
        used.insert(task.task_slug.clone());
    }
}

fn default_scaffold_profile() -> String { SCAFFOLD_PROFILE_NONE.to_string() }

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
    if !matches!(plan.scaffold_profile.as_str(), SCAFFOLD_PROFILE_NONE | SCAFFOLD_PROFILE_REACT_API_SQLITE) {
        return Err(format!("PM scaffoldProfile이 지원되지 않습니다: {}", plan.scaffold_profile));
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

#[tauri::command]
pub fn project_runtime_preflight(organization: String) -> ProjectRuntimePreflight {
    let organization = organization.trim().to_string();
    let git_available = command_succeeds("git", &["--version"]);
    let gh_available = command_succeeds("gh", &["--version"]);
    let gh_authenticated = gh_available
        && command_succeeds("gh", &["auth", "status", "--hostname", "github.com"]);
    let organization_accessible = if gh_authenticated && !organization.is_empty() {
        run_command(
            "gh",
            &["api".to_string(), format!("users/{organization}"), "--silent".to_string()],
        )
        .map(|output| output.status.success())
        .unwrap_or(false)
    } else {
        false
    };
    let local_inference_available = local_inference_runtime::local_agent_runner_path().is_ok();
    let message = if !local_inference_available {
        "Bloom Local Agent runner가 준비되지 않았습니다.".to_string()
    } else if git_available && gh_available && gh_authenticated && organization_accessible {
        "Git, GitHub CLI, Bloom Local Agent와 GitHub owner 접근이 준비되었습니다.".to_string()
    } else {
        "누락된 로컬 Runtime 조건을 확인해 주세요.".to_string()
    };

    ProjectRuntimePreflight {
        organization,
        git_available,
        gh_available,
        gh_authenticated,
        local_inference_available,
        local_inference_mode: if local_inference_available { "local" } else { "unavailable" }.to_string(),
        organization_accessible,
        message,
    }
}

fn write_scaffold_file(workspace: &Path, relative_path: &str, content: &str, generated_files: &mut Vec<String>) -> Result<(), String> {
    let target = workspace.join(relative_path);
    if target.exists() {
        let existing = fs::read_to_string(&target).map_err(|error| format!("Scaffold file read failed {relative_path}: {error}"))?;
        if existing != content { return Err(format!("Greenfield bootstrap refuses to overwrite existing file: {relative_path}")); }
        generated_files.push(relative_path.to_string());
        return Ok(());
    }
    if let Some(parent) = target.parent() { fs::create_dir_all(parent).map_err(|error| format!("Scaffold directory create failed {relative_path}: {error}"))?; }
    fs::write(&target, content).map_err(|error| format!("Scaffold file write failed {relative_path}: {error}"))?;
    generated_files.push(relative_path.to_string());
    Ok(())
}

fn git_head(workspace: &Path) -> Result<String, String> {
    let output = run_checked("git", &git_args(workspace, &["rev-parse", "HEAD"]))?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
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
        return Err(format!("GitHub CLI로 {organization} GitHub owner에 접근할 수 없습니다."));
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

    run_checked("git", &git_args(&workspace, &["config", "user.name", "Luna Bloom"]))?;
    run_checked(
        "git",
        &git_args(
            &workspace,
            &["config", "user.email", "luna-bloom@users.noreply.github.com"],
        ),
    )?;

    if !remote_branch_exists(&workspace, "main") {
        run_checked("git", &git_args(&workspace, &["checkout", "--orphan", "main"]))?;
        run_checked(
            "git",
            &git_args(
                &workspace,
                &["commit", "--allow-empty", "-m", "chore : initialize repository"],
            ),
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


fn greenfield_scaffold_files(profile: &str) -> Result<Vec<(&'static str, &'static str)>, String> {
    match profile {
        SCAFFOLD_PROFILE_NONE => Ok(vec![]),
        SCAFFOLD_PROFILE_REACT_API_SQLITE => Ok(vec![
            (".gitignore", "node_modules/\ndist/\n*.db\n*.db-shm\n*.db-wal\n.env\n.env.*\n!.env.example\n"),
            ("pnpm-workspace.yaml", "packages:\n  - frontend\n  - api\n"),
            ("package.json", "{\n  \"name\": \"bloom-greenfield-workspace\",\n  \"private\": true,\n  \"scripts\": {\n    \"build\": \"pnpm --filter ./frontend build\",\n    \"test\": \"pnpm --filter ./api test\"\n  }\n}\n"),
            ("AGENTS.md", "# Agent Contract\n\nThis repository has a runtime-provided greenfield baseline. Keep frontend work under frontend/ and API/SQLite work under api/. Product implementation requires real source, config, and test changes; documentation alone is not implementation. Runtime owns Git publication and PR creation.\n"),
            ("frontend/package.json", "{\n  \"name\": \"frontend\",\n  \"private\": true,\n  \"scripts\": { \"dev\": \"vite\", \"build\": \"vite build\" },\n  \"dependencies\": { \"@vitejs/plugin-react\": \"^4.4.0\", \"vite\": \"^6.2.0\", \"typescript\": \"~5.7.0\", \"react\": \"^19.0.0\", \"react-dom\": \"^19.0.0\" },\n  \"devDependencies\": {}\n}\n"),
            ("frontend/index.html", "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\"><title>Bloom App</title></head><body><div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script></body></html>\n"),
            ("frontend/src/main.tsx", "import React from 'react';\nimport { createRoot } from 'react-dom/client';\n\nfunction App() {\n  return <main><h1>Product workspace</h1><p>Implement the product UI in this baseline.</p></main>;\n}\n\ncreateRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);\n"),
            ("api/package.json", "{\n  \"name\": \"api\",\n  \"private\": true,\n  \"scripts\": { \"dev\": \"tsx src/server.ts\", \"test\": \"tsx --test test/**/*.test.ts\" },\n  \"dependencies\": { \"express\": \"^4.21.0\" },\n  \"devDependencies\": { \"@types/express\": \"^5.0.0\", \"@types/node\": \"^22.0.0\", \"tsx\": \"^4.20.0\", \"typescript\": \"~5.7.0\" }\n}\n"),
            ("api/src/db.ts", "import { DatabaseSync } from 'node:sqlite';\n\nexport const db = new DatabaseSync('app.db');\ndb.exec('PRAGMA foreign_keys = ON');\n"),
            ("api/src/server.ts", "import express from 'express';\nimport './db';\n\nexport const app = express();\napp.use(express.json());\napp.get('/health', (_req, res) => res.json({ ok: true }));\n\nif (process.env.NODE_ENV !== 'test') app.listen(Number(process.env.PORT || 3001));\n"),
            ("api/test/health.test.ts", "import test from 'node:test';\nimport assert from 'node:assert/strict';\nprocess.env.NODE_ENV = 'test';\nconst { app } = await import('../src/server');\n\ntest('exports an Express app', () => { assert.equal(typeof app, 'function'); });\n"),
        ]),
        other => Err(format!("Unsupported greenfield scaffold profile: {other}")),
    }
}

fn materialize_greenfield_scaffold(workspace: &Path, profile: &str) -> Result<Vec<String>, String> {
    let mut generated_files = Vec::new();
    for (relative_path, content) in greenfield_scaffold_files(profile)? {
        write_scaffold_file(workspace, relative_path, content, &mut generated_files)?;
    }
    Ok(generated_files)
}

fn ensure_scaffold_workspace_recoverable(workspace: &Path, profile: &str) -> Result<(), String> {
    let expected_files = greenfield_scaffold_files(profile)?;
    let status = run_checked(
        "git",
        &git_args(workspace, &["status", "--porcelain", "--untracked-files=all"]),
    )?;
    for line in String::from_utf8_lossy(&status.stdout).lines() {
        let Some(raw_path) = line.get(3..) else {
            return Err(format!("Greenfield bootstrap cannot parse dirty Git status: {line}"));
        };
        let relative_path = raw_path.trim();
        if relative_path.contains(" -> ") {
            return Err(format!("Greenfield bootstrap found unexpected dirty path: {relative_path}"));
        }
        let Some((_, expected_content)) = expected_files.iter()
            .find(|(path, _)| *path == relative_path)
        else {
            return Err(format!("Greenfield bootstrap found unexpected dirty path: {relative_path}"));
        };
        let target = workspace.join(relative_path);
        let actual = fs::read_to_string(&target)
            .map_err(|error| format!("Greenfield bootstrap recovery cannot read {relative_path}: {error}"))?;
        if actual != *expected_content {
            return Err(format!("Greenfield bootstrap refuses changed dirty scaffold file: {relative_path}"));
        }
    }
    Ok(())
}

pub fn bootstrap_greenfield_project(
    repository_full_name: String,
    workspace_path: String,
    integration_branch: String,
    scaffold_profile: String,
) -> Result<GreenfieldBootstrapResult, String> {
    let workspace = PathBuf::from(workspace_path.trim());
    if !workspace.join(".git").exists() {
        return Err("Greenfield bootstrap workspace is not a Git repository.".to_string());
    }
    let integration_branch = integration_branch.trim().to_string();
    if integration_branch.is_empty() {
        return Err("Greenfield bootstrap integration branch is empty.".to_string());
    }
    let (organization, repository) = repository_full_name.trim().split_once('/')
        .ok_or_else(|| "Greenfield bootstrap repository must be owner/name.".to_string())?;
    ensure_expected_origin(&workspace, organization, repository)?;
    run_checked("git", &git_args(&workspace, &["fetch", "origin", "--prune"]))?;
    let current_branch = run_checked("git", &git_args(&workspace, &["branch", "--show-current"]))?;
    let current_branch = String::from_utf8_lossy(&current_branch.stdout).trim().to_string();
    if current_branch == integration_branch {
        ensure_scaffold_workspace_recoverable(&workspace, scaffold_profile.trim())?;
    } else {
        ensure_clean_workspace(&workspace)?;
        let remote_branch = format!("origin/{integration_branch}");
        run_checked("git", &git_args(&workspace, &["checkout", "-B", integration_branch.as_str(), remote_branch.as_str()]))?;
    }

    let generated_files = materialize_greenfield_scaffold(&workspace, scaffold_profile.trim())?;
    let status = run_checked("git", &git_args(&workspace, &["status", "--porcelain"]))?;
    if !String::from_utf8_lossy(&status.stdout).trim().is_empty() {
        run_checked("git", &git_args(&workspace, &["add", "-A"]))?;
        run_checked("git", &git_args(&workspace, &["commit", "-m", "chore : bootstrap react api sqlite monorepo"]))?;
        run_checked("git", &git_args(&workspace, &["push", "origin", integration_branch.as_str()]))?;
    }
    let commit_sha = git_head(&workspace)?;
    Ok(GreenfieldBootstrapResult { profile: scaffold_profile.trim().to_string(), commit_sha: Some(commit_sha), generated_files })
}

fn pm_prompt(
    organization: &str,
    project_id: &str,
    team_id: &str,
    team_name: &str,
    request: &str,
) -> String {
    format!(
        r#"You are the independent PM Local Agent for Bloom team {team_name} ({team_id}).

Project ID: {project_id}
GitHub Organization: {organization}
User request:
{request}

Your job in this turn is planning only. Do not create files, repositories, branches, commits, PRs, or deployments. Return the project plan that Bloom will execute after this turn.

Operating contract:
- Treat the project as a real production service, not a demo or mock-only prototype.
- Default to one project monorepo unless there is a concrete reason not to.
- repositoryName must be a concise lowercase ASCII kebab-case GitHub repository name.
- scaffoldProfile must be one of `none` or `react-api-sqlite-monorepo-v1`. Use `react-api-sqlite-monorepo-v1` only for a web frontend + API + SQLite monorepo; otherwise use `none`.
- If login or sign-up is required, needsAuth must be true and the implementation must use the shared 꽃다발 authentication standard.
- Choose libraries/frameworks when they materially improve reliability, security, accessibility, maintainability, performance, or delivery speed. Record each meaningful choice and its reason in technologyDecisions.
- Every participating Agent is an independent worker with its own branch/worktree, session, judgment, commit history, PR, and retrospective.
- Branch convention is agent/<team>/<role>/<task>. taskSlug must be concise lowercase ASCII kebab-case.
- Agents do not blindly trust PM or reviewers. Every material action must have a defensible, verifiable reason.
- Code Review, higher-level Reviewer, QA, Documentation, User A, User B, and Process Evaluator should be included as independent gates for a normal user-facing production service. Omit a role only when it genuinely does not apply.
- Every repository-writing Task MUST have a transitive downstream Code Review -> Reviewer -> QA path.
- Repository-writing roles include design-system, designer, ux-research, frontend, backend, database, security, devops, accessibility, performance, api-integration, test-automation, data-marketing, documentation, and debug-router.
- A shared downstream review chain may cover multiple writer Tasks only if it transitively depends on every covered writer.
- If Data & Marketing or Documentation writes after an earlier QA gate, it needs its own downstream review chain before completion.
- Assign specialist ownership directly when the work materially belongs to it: UX Research for research/validation, Database for schema/migrations/query/persistence, Security for auth/permissions/session/CSRF/secrets, DevOps for CI/CD/deployment/containers/observability, Accessibility for keyboard/ARIA/screen-reader/contrast/semantic UX, Performance for measured performance work, API Integration for external or cross-service API contracts, Test Automation for automated integration/E2E coverage, and Data & Marketing for product/market analysis artifacts.
- Do not create a specialist Task just to use every role. Keep generic Frontend or Backend ownership when specialist scope is not material.
- Frontend, Backend, and independent specialist tasks may run in parallel when dependencies allow it.
- Acceptance criteria must be observable and verifiable. Include build/test/browser/error/loading/empty/security requirements where relevant.
- Do not assume external credentials, paid services, or unavailable datasets exist. Model them as explicit implementation blockers or setup tasks when necessary.
- Keep tasks independently reviewable. Avoid one giant frontend or backend task covering the whole project.
- Task dependencies must reference existing task IDs and must not form self-dependencies.
- The final response must match the supplied JSON schema exactly. No Markdown outside the JSON result.
"#
    )
}

fn run_pm_local(
    organization: &str,
    workspace_root: &str,
    project_id: &str,
    team_id: &str,
    team_name: &str,
    request: &str,
) -> Result<PmLocalRunResult, String> {
    validate_github_name(organization, "Organization")?;
    validate_github_name(project_id, "Project ID")?;
    if request.trim().is_empty() {
        return Err("프로젝트 요구사항이 비어 있습니다.".to_string());
    }
    if workspace_root.trim().is_empty() {
        return Err("Workspace root를 먼저 설정해 주세요.".to_string());
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
    let inference = local_inference_runtime::run_structured_json(
        "pm-plan",
        &prompt,
        PM_PLAN_SCHEMA,
        &planning_dir,
    )?;
    fs::write(
        &output_path,
        serde_json::to_vec_pretty(&inference.output)
            .map_err(|error| format!("PM plan serialization failed: {error}"))?,
    )
    .map_err(|error| format!("PM plan output write failed: {error}"))?;
    fs::write(&events_path, &inference.events_jsonl)
        .map_err(|error| format!("PM plan event log write failed: {error}"))?;
    let mut plan: PmProjectPlan = serde_json::from_value(inference.output)
        .map_err(|error| format!("PM plan JSON parsing failed: {error}"))?;
    normalize_task_slug_collisions(&mut plan);
    validate_project_plan(&plan)?;

    Ok(PmLocalRunResult {
        plan,
        session_id: inference.session_id,
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
        let pm = run_pm_local(
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
    if !preflight.local_inference_available {
        return Err(preflight.message);
    }

    let pm = run_pm_local(
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
#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str, slug: &str) -> ProjectTaskPlan {
        ProjectTaskPlan { id: id.into(), title: id.into(), role: "performance".into(), task_slug: slug.into(), summary: "work".into(), depends_on: vec![], acceptance_criteria: vec!["done".into()] }
    }

    #[test]
    fn normalizes_duplicate_task_slugs_deterministically() {
        let mut plan = PmProjectPlan { project_name: "Pulseboard".into(), repository_name: "pulseboard".into(), product_summary: "product".into(), architecture_summary: "arch".into(), needs_auth: false, scaffold_profile: SCAFFOLD_PROFILE_NONE.into(), technology_decisions: vec![], tasks: vec![task("PULSEBOARD-107", "performance"), task("PULSEBOARD-207", "performance")] };
        normalize_task_slug_collisions(&mut plan);
        assert_eq!(plan.tasks[0].task_slug, "performance");
        assert_eq!(plan.tasks[1].task_slug, "performance-pulseboard-207");
        validate_project_plan(&plan).expect("normalized plan must remain strictly valid");
    }
    #[test]
    fn legacy_plan_defaults_scaffold_profile_to_none() {
        let value = serde_json::json!({
            "projectName": "Legacy",
            "repositoryName": "legacy",
            "productSummary": "product",
            "architectureSummary": "arch",
            "needsAuth": false,
            "technologyDecisions": [],
            "tasks": [{
                "id": "FE-001", "title": "Frontend", "role": "frontend",
                "taskSlug": "frontend", "summary": "work", "dependsOn": [],
                "acceptanceCriteria": ["done"]
            }]
        });
        let plan: PmProjectPlan = serde_json::from_value(value).expect("legacy plan must deserialize");
        assert_eq!(plan.scaffold_profile, SCAFFOLD_PROFILE_NONE);
    }

    #[test]
    fn materializes_greenfield_scaffold_without_clobbering() {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("bloom-greenfield-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        let first = materialize_greenfield_scaffold(&root, SCAFFOLD_PROFILE_REACT_API_SQLITE).unwrap();
        assert!(first.contains(&"frontend/src/main.tsx".to_string()));
        assert!(first.contains(&"api/src/server.ts".to_string()));
        assert!(root.join("frontend/src").is_dir());
        assert!(root.join("api/src/db.ts").is_file());

        let second = materialize_greenfield_scaffold(&root, SCAFFOLD_PROFILE_REACT_API_SQLITE).unwrap();
        assert_eq!(first, second);

        fs::write(root.join("frontend/src/main.tsx"), "changed").unwrap();
        let error = materialize_greenfield_scaffold(&root, SCAFFOLD_PROFILE_REACT_API_SQLITE)
            .expect_err("bootstrap must refuse to overwrite changed source");
        assert!(error.contains("refuses to overwrite"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn accepts_only_expected_dirty_scaffold_files_for_recovery() {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("bloom-greenfield-recovery-{nonce}"));
        let init_args = vec![
            "init".to_string(), "-b".to_string(), "develop".to_string(),
            root.to_string_lossy().to_string(),
        ];
        run_checked("git", &init_args).unwrap();
        run_checked("git", &git_args(&root, &["config", "user.name", "Bloom Test"])).unwrap();
        run_checked("git", &git_args(&root, &["config", "user.email", "bloom-test@example.invalid"])).unwrap();
        run_checked("git", &git_args(&root, &["commit", "--allow-empty", "-m", "init"])).unwrap();

        materialize_greenfield_scaffold(&root, SCAFFOLD_PROFILE_REACT_API_SQLITE).unwrap();
        ensure_scaffold_workspace_recoverable(&root, SCAFFOLD_PROFILE_REACT_API_SQLITE)
            .expect("expected dirty scaffold files must be resumable");

        fs::write(root.join("unexpected.txt"), "not scaffold evidence").unwrap();
        let error = ensure_scaffold_workspace_recoverable(&root, SCAFFOLD_PROFILE_REACT_API_SQLITE)
            .expect_err("unrelated dirty files must block bootstrap recovery");
        assert!(error.contains("unexpected dirty path"));
        fs::remove_dir_all(root).unwrap();
    }

}
