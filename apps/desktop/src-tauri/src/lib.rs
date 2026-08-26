use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectRuntimePreflight {
    organization: String,
    git_available: bool,
    gh_available: bool,
    gh_authenticated: bool,
    codex_available: bool,
    organization_accessible: bool,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectRepositoryBootstrap {
    repository: String,
    workspace_path: String,
    created_repository: bool,
    cloned_repository: bool,
    release_branch: String,
    integration_branch: String,
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

fn run_checked(program: &str, args: &[String]) -> Result<Output, String> {
    let output = run_command(program, args)?;
    if output.status.success() {
        return Ok(output);
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() { stderr } else { stdout };
    Err(if detail.is_empty() {
        format!("{program} 명령이 실패했습니다.")
    } else {
        format!("{program} 명령 실패: {detail}")
    })
}

fn validate_github_name(value: &str, label: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(format!("{label} 값이 비어 있습니다."));
    }
    if value.len() > 100 {
        return Err(format!("{label} 값이 너무 깁니다."));
    }
    if !value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err(format!("{label} 값에 사용할 수 없는 문자가 있습니다."));
    }
    Ok(())
}

fn git_args(workspace: &Path, tail: &[&str]) -> Vec<String> {
    let mut args = vec!["-C".to_string(), workspace.to_string_lossy().to_string()];
    args.extend(tail.iter().map(|value| value.to_string()));
    args
}

fn remote_branch_exists(workspace: &Path, branch: &str) -> bool {
    run_command(
        "git",
        &git_args(
            workspace,
            &["rev-parse", "--verify", "--quiet", &format!("refs/remotes/origin/{branch}")],
        ),
    )
    .map(|output| output.status.success())
    .unwrap_or(false)
}

fn ensure_clean_workspace(workspace: &Path) -> Result<(), String> {
    let output = run_checked("git", &git_args(workspace, &["status", "--porcelain"]))?;
    if String::from_utf8_lossy(&output.stdout).trim().is_empty() {
        Ok(())
    } else {
        Err("기존 프로젝트 workspace에 커밋되지 않은 변경이 있어 자동 bootstrap을 중단했습니다.".to_string())
    }
}

#[tauri::command]
fn project_runtime_preflight(organization: String) -> ProjectRuntimePreflight {
    let organization = organization.trim().to_string();
    let git_available = command_succeeds("git", &["--version"]);
    let gh_available = command_succeeds("gh", &["--version"]);
    let codex_available = command_succeeds("codex", &["--version"]);
    let gh_authenticated = gh_available && command_succeeds("gh", &["auth", "status", "--hostname", "github.com"]);
    let organization_accessible = if gh_authenticated && !organization.is_empty() {
        let endpoint = format!("orgs/{organization}");
        run_command(
            "gh",
            &["api".to_string(), endpoint, "--silent".to_string()],
        )
        .map(|output| output.status.success())
        .unwrap_or(false)
    } else {
        false
    };

    let message = if git_available
        && gh_available
        && gh_authenticated
        && codex_available
        && organization_accessible
    {
        "Git, GitHub CLI, Codex CLI와 Organization 접근이 준비되었습니다.".to_string()
    } else {
        "누락된 로컬 Runtime 조건을 확인해 주세요. ChatGPT의 GitHub Connector 설치와 Luna 로컬 CLI 인증은 별도입니다.".to_string()
    };

    ProjectRuntimePreflight {
        organization,
        git_available,
        gh_available,
        gh_authenticated,
        codex_available,
        organization_accessible,
        message,
    }
}

#[tauri::command]
fn bootstrap_project_repository(
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
        run_checked("git", &git_args(&workspace, &["checkout", "-B", "main", &source]))?;
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

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            project_runtime_preflight,
            bootstrap_project_repository
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
