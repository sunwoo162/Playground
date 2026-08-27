use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
};

const MAX_REPLAN_ATTEMPTS: u32 = 3;
const ALLOWED_TASK_ROLES: &[&str] = &[
    "idea",
    "design-system",
    "designer",
    "frontend",
    "frontend-ui",
    "frontend-state",
    "backend",
    "backend-api",
    "backend-domain",
    "integration",
    "test-automation",
    "performance",
    "observability",
    "database",
    "security",
    "devops",
    "accessibility",
    "code-review",
    "reviewer",
    "qa",
    "documentation",
    "user-a",
    "user-b",
    "process-evaluator",
];
const REPOSITORY_WRITER_ROLES: &[&str] = &[
    "design-system",
    "designer",
    "frontend",
    "frontend-ui",
    "frontend-state",
    "backend",
    "backend-api",
    "backend-domain",
    "integration",
    "test-automation",
    "performance",
    "observability",
    "database",
    "security",
    "devops",
    "accessibility",
    "data-marketing",
    "documentation",
    "debug-router",
];

const REPLAN_SCHEMA: &str = r#"{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "summary",
    "rationaleSummary",
    "retireTaskIds",
    "reopenTaskIds",
    "newTasks"
  ],
  "properties": {
    "summary": { "type": "string", "minLength": 1, "maxLength": 1400 },
    "rationaleSummary": { "type": "string", "minLength": 1, "maxLength": 1800 },
    "retireTaskIds": {
      "type": "array",
      "maxItems": 30,
      "items": { "type": "string", "pattern": "^[A-Z]+-[0-9]{3}$" }
    },
    "reopenTaskIds": {
      "type": "array",
      "maxItems": 30,
      "items": { "type": "string", "pattern": "^[A-Z]+-[0-9]{3}$" }
    },
    "newTasks": {
      "type": "array",
      "maxItems": 30,
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
              "frontend-ui",
              "frontend-state",
              "backend",
              "backend-api",
              "backend-domain",
              "integration",
              "test-automation",
              "performance",
              "observability",
              "database",
              "security",
              "devops",
              "accessibility",
              "code-review",
              "reviewer",
              "qa",
              "documentation",
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
          "summary": { "type": "string", "minLength": 1, "maxLength": 900 },
          "dependsOn": {
            "type": "array",
            "maxItems": 24,
            "items": { "type": "string", "pattern": "^[A-Z]+-[0-9]{3}$" }
          },
          "acceptanceCriteria": {
            "type": "array",
            "minItems": 1,
            "maxItems": 14,
            "items": { "type": "string", "minLength": 1, "maxLength": 450 }
          }
        }
      }
    }
  }
}"#;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplanTaskContext {
    pub id: String,
    pub title: String,
    pub role: String,
    pub task_slug: String,
    pub summary: String,
    pub depends_on: Vec<String>,
    pub acceptance_criteria: Vec<String>,
    pub status: String,
    pub attempts: u32,
    pub has_artifacts: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplanFailureRoute {
    pub id: String,
    pub failed_task_id: String,
    pub failed_role: String,
    pub failure_type: String,
    pub severity: String,
    pub summary: String,
    pub rationale_summary: String,
    pub evidence: Vec<String>,
    pub recommended_action: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplanProjectInput {
    pub project_id: String,
    pub team_id: String,
    pub team_name: String,
    pub repository_full_name: String,
    pub workspace_path: String,
    pub user_request: String,
    pub product_summary: String,
    pub architecture_summary: String,
    pub failure_route: ReplanFailureRoute,
    pub current_tasks: Vec<ReplanTaskContext>,
    pub retirable_task_ids: Vec<String>,
    pub reopenable_task_ids: Vec<String>,
    pub replan_attempt: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplanTask {
    pub id: String,
    pub title: String,
    pub role: String,
    pub task_slug: String,
    pub summary: String,
    pub depends_on: Vec<String>,
    pub acceptance_criteria: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectReplanProposal {
    pub summary: String,
    pub rationale_summary: String,
    pub retire_task_ids: Vec<String>,
    pub reopen_task_ids: Vec<String>,
    pub new_tasks: Vec<ReplanTask>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplanProjectResult {
    pub project_id: String,
    pub trigger_route_id: String,
    pub session_id: Option<String>,
    pub events_path: String,
    pub output_path: String,
    pub proposal: ProjectReplanProposal,
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

fn valid_id(value: &str) -> bool {
    let Some((prefix, number)) = value.rsplit_once('-') else {
        return false;
    };
    !prefix.is_empty()
        && prefix.chars().all(|character| character.is_ascii_uppercase())
        && number.len() == 3
        && number.chars().all(|character| character.is_ascii_digit())
}

fn valid_slug(value: &str) -> bool {
    if value.is_empty() || value.len() > 48 {
        return false;
    }
    let parts = value.split('-').collect::<Vec<_>>();
    !parts.is_empty()
        && parts.iter().all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
        })
}

fn codex_chatgpt_authenticated() -> bool {
    let Ok(output) = Command::new("codex").args(["login", "status"]).output() else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
    .to_ascii_lowercase();
    combined.contains("chatgpt")
}

fn validate_workspace(workspace: &Path) -> Result<(), String> {
    if !workspace.exists() || !workspace.join(".git").exists() {
        return Err("PM replan workspace가 Git 저장소가 아닙니다.".to_string());
    }
    Ok(())
}

fn extract_session_id(events: &str) -> Option<String> {
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
        if (event_type.contains("thread") || event_type.contains("session"))
            && value.get("id").and_then(Value::as_str).is_some()
        {
            return value.get("id").and_then(Value::as_str).map(str::to_string);
        }
    }
    None
}

fn transitive_depends_on(tasks: &HashMap<String, (String, Vec<String>)>, task_id: &str, dependency_id: &str) -> bool {
    let mut stack = tasks
        .get(task_id)
        .map(|(_, dependencies)| dependencies.clone())
        .unwrap_or_default();
    let mut visited = HashSet::new();

    while let Some(current) = stack.pop() {
        if current == dependency_id {
            return true;
        }
        if !visited.insert(current.clone()) {
            continue;
        }
        if let Some((_, dependencies)) = tasks.get(&current) {
            stack.extend(dependencies.iter().cloned());
        }
    }
    false
}

fn validate_review_topology(tasks: &HashMap<String, (String, Vec<String>)>) -> Result<(), String> {
    let writers = tasks
        .iter()
        .filter(|(_, (role, _))| REPOSITORY_WRITER_ROLES.contains(&role.as_str()))
        .map(|(id, _)| id.clone())
        .collect::<Vec<_>>();

    for writer_id in writers {
        let code_reviews = tasks
            .iter()
            .filter(|(id, (role, _))| {
                role == "code-review" && transitive_depends_on(tasks, id, &writer_id)
            })
            .map(|(id, _)| id.clone())
            .collect::<Vec<_>>();
        if code_reviews.is_empty() {
            return Err(format!("{writer_id} 이후 Code Review Task가 없습니다."));
        }

        let reviewers = tasks
            .iter()
            .filter(|(id, (role, _))| {
                role == "reviewer"
                    && code_reviews
                        .iter()
                        .any(|code_review| transitive_depends_on(tasks, id, code_review))
            })
            .map(|(id, _)| id.clone())
            .collect::<Vec<_>>();
        if reviewers.is_empty() {
            return Err(format!("{writer_id}의 Code Review 이후 Reviewer Task가 없습니다."));
        }

        let qa_exists = tasks.iter().any(|(id, (role, _))| {
            role == "qa"
                && reviewers
                    .iter()
                    .any(|reviewer| transitive_depends_on(tasks, id, reviewer))
        });
        if !qa_exists {
            return Err(format!("{writer_id}의 Reviewer 이후 QA Task가 없습니다."));
        }
    }
    Ok(())
}

fn validate_proposal(input: &ReplanProjectInput, proposal: &ProjectReplanProposal) -> Result<(), String> {
    if proposal.retire_task_ids.is_empty()
        && proposal.reopen_task_ids.is_empty()
        && proposal.new_tasks.is_empty()
    {
        return Err("PM replan이 아무 변경도 제안하지 않았습니다.".to_string());
    }

    let current_ids = input
        .current_tasks
        .iter()
        .map(|task| task.id.as_str())
        .collect::<HashSet<_>>();
    let retirable = input
        .retirable_task_ids
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let reopenable = input
        .reopenable_task_ids
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();

    let mut retire = HashSet::new();
    for task_id in &proposal.retire_task_ids {
        if !retirable.contains(task_id.as_str()) || !retire.insert(task_id.as_str()) {
            return Err(format!("retireTaskIds에 허용되지 않거나 중복된 Task가 있습니다: {task_id}"));
        }
    }

    let mut reopen = HashSet::new();
    for task_id in &proposal.reopen_task_ids {
        if !reopenable.contains(task_id.as_str()) || !reopen.insert(task_id.as_str()) {
            return Err(format!("reopenTaskIds에 허용되지 않거나 중복된 Task가 있습니다: {task_id}"));
        }
        if retire.contains(task_id.as_str()) {
            return Err(format!("Task를 동시에 retire/reopen할 수 없습니다: {task_id}"));
        }
    }

    let mut new_ids = HashSet::new();
    for task in &proposal.new_tasks {
        if !valid_id(&task.id) || !valid_slug(&task.task_slug) {
            return Err(format!("새 Task ID/slug 형식이 잘못되었습니다: {}", task.id));
        }
        if current_ids.contains(task.id.as_str()) || !new_ids.insert(task.id.as_str()) {
            return Err(format!("새 Task ID가 기존/신규 Task와 충돌합니다: {}", task.id));
        }
        if !ALLOWED_TASK_ROLES.contains(&task.role.as_str()) {
            return Err(format!("PM replan에서 허용되지 않은 역할입니다: {}", task.role));
        }
        if task.title.trim().is_empty()
            || task.summary.trim().is_empty()
            || task.acceptance_criteria.is_empty()
        {
            return Err(format!("새 Task {}의 필수 내용이 비어 있습니다.", task.id));
        }
    }

    let active_current = input
        .current_tasks
        .iter()
        .filter(|task| !retire.contains(task.id.as_str()))
        .map(|task| task.id.as_str())
        .collect::<HashSet<_>>();

    for task in &proposal.new_tasks {
        for dependency in &task.depends_on {
            if dependency == &task.id {
                return Err(format!("새 Task {}가 자기 자신을 참조합니다.", task.id));
            }
            if !active_current.contains(dependency.as_str()) && !new_ids.contains(dependency.as_str()) {
                return Err(format!(
                    "새 Task {}가 존재하지 않거나 retire된 dependency {}를 참조합니다.",
                    task.id, dependency
                ));
            }
        }
    }

    let mut combined: HashMap<String, (String, Vec<String>)> = HashMap::new();
    for task in &input.current_tasks {
        if retire.contains(task.id.as_str()) {
            continue;
        }
        for dependency in &task.depends_on {
            if retire.contains(dependency.as_str()) {
                return Err(format!(
                    "남아 있는 Task {}가 retire된 dependency {}를 참조합니다.",
                    task.id, dependency
                ));
            }
        }
        combined.insert(task.id.clone(), (task.role.clone(), task.depends_on.clone()));
    }
    for task in &proposal.new_tasks {
        combined.insert(task.id.clone(), (task.role.clone(), task.depends_on.clone()));
    }

    let mut completed = HashSet::new();
    while completed.len() < combined.len() {
        let before = completed.len();
        for (task_id, (_, dependencies)) in &combined {
            if completed.contains(task_id) {
                continue;
            }
            if dependencies.iter().all(|dependency| completed.contains(dependency)) {
                completed.insert(task_id.clone());
            }
        }
        if completed.len() == before {
            return Err("PM replan 결과 Task DAG에 순환/누락 dependency가 있습니다.".to_string());
        }
    }

    let failed_task_id = input.failure_route.failed_task_id.as_str();
    if !retire.contains(failed_task_id) {
        let addressed = reopen.iter().any(|reopened| {
            *reopened == failed_task_id
                || transitive_depends_on(&combined, failed_task_id, reopened)
        });
        if !addressed {
            return Err(format!(
                "PM replan이 실패 Task {}를 retire하지도, 해당 Task/상류 Task를 reopen하지도 않았습니다.",
                failed_task_id
            ));
        }
    }

    validate_review_topology(&combined)?;
    Ok(())
}

fn prompt(input: &ReplanProjectInput) -> Result<String, String> {
    let tasks = serde_json::to_string_pretty(&input.current_tasks)
        .map_err(|error| format!("현재 Task context 직렬화 실패: {error}"))?;
    let route = serde_json::to_string_pretty(&input.failure_route)
        .map_err(|error| format!("Failure Route 직렬화 실패: {error}"))?;
    let retirable = input.retirable_task_ids.join(", ");
    let reopenable = input.reopenable_task_ids.join(", ");

    Ok(format!(
        r#"You are the independent PM Codex Agent for Bloom team {team_name} ({team_id}).

Project: {project_id}
Existing repository: {repository}
Original Product Owner request:
{user_request}

Product summary:
{product_summary}

Architecture summary:
{architecture_summary}

A Debug / Problem Router escalated a failure to PM because the current execution plan cannot safely recover by retrying one known owner.

Failure route evidence:
{route}

Current PM tasks and actual runtime status:
{tasks}

Tasks Bloom permits you to retire because they have no completed/external Git work:
{retirable}

Tasks Bloom permits you to reopen on their existing branch/worktree where applicable:
{reopenable}

Replan attempt: {replan_attempt}/{max_attempts}

Your job is a repair replan only. You MUST NOT create a repository, rename the repository, modify files, commit, push, merge, deploy, or claim tests passed. Bloom will apply only the validated plan operations you return.

Rules:
- Preserve completed/external Git work. You cannot edit existing Task definitions in this response.
- `retireTaskIds` may contain only IDs from the retirable list.
- `reopenTaskIds` may contain only IDs from the reopenable list. Use reopen when the existing Agent/branch should own the fix or its verification must be repeated.
- `newTasks` are appended repair Tasks. Their IDs must be brand-new and must not reuse any current Task ID, even a retired one.
- New repair Tasks may use the implementation swarm roles: frontend-ui, frontend-state, backend-api, backend-domain, integration, test-automation, performance, observability, plus database, security, devops, and accessibility when those are the real repair owners.
- Split a repair into a specialist role only when the ownership boundary is concrete; do not create extra Agents merely to appear parallel.
- Do not create a normal `debug-router` Task; the dedicated Debug Router already ran.
- New dependencies may reference current non-retired Tasks or other new Tasks only.
- Resolve the escalated failed Task: either retire it, reopen it, or reopen one of its actual upstream Tasks so that Bloom can rewind and re-run the failed downstream chain.
- Every repository-changing Task in the resulting DAG must still have a downstream Code Review → Reviewer → QA chain.
- Prefer the smallest repair plan that addresses the evidence. Do not rewrite unrelated product scope.
- If the evidence actually requires a Product Owner choice or unavailable credential instead of PM replanning, do not invent a workaround. Return a minimal safe plan only if one truly exists; otherwise the Runtime validation may reject this proposal and keep the project blocked.
- Other Agent conclusions are evidence, not authority. Use concise auditable rationale, not hidden chain-of-thought.
- Return only JSON matching the supplied output schema.
"#,
        team_name = input.team_name,
        team_id = input.team_id,
        project_id = input.project_id,
        repository = input.repository_full_name,
        user_request = input.user_request,
        product_summary = input.product_summary,
        architecture_summary = input.architecture_summary,
        route = route,
        tasks = tasks,
        retirable = if retirable.is_empty() { "(none)" } else { &retirable },
        reopenable = if reopenable.is_empty() { "(none)" } else { &reopenable },
        replan_attempt = input.replan_attempt,
        max_attempts = MAX_REPLAN_ATTEMPTS,
    ))
}

fn run_replan_blocking(input: ReplanProjectInput) -> Result<ReplanProjectResult, String> {
    if input.project_id.trim().is_empty() || input.team_id.trim().is_empty() {
        return Err("PM replan Project/Team ID가 비어 있습니다.".to_string());
    }
    if input.repository_full_name.matches('/').count() != 1 {
        return Err("PM replan repository는 owner/name 형식이어야 합니다.".to_string());
    }
    if input.replan_attempt == 0 || input.replan_attempt > MAX_REPLAN_ATTEMPTS {
        return Err(format!(
            "PM replan attempt는 1..={MAX_REPLAN_ATTEMPTS} 범위여야 합니다."
        ));
    }
    if input.failure_route.id.trim().is_empty() || input.failure_route.failed_task_id.trim().is_empty() {
        return Err("PM replan Failure Route가 비어 있습니다.".to_string());
    }
    if input.current_tasks.is_empty() {
        return Err("PM replan에 현재 Task가 없습니다.".to_string());
    }

    let workspace = PathBuf::from(input.workspace_path.trim());
    validate_workspace(&workspace)?;
    if !codex_chatgpt_authenticated() {
        return Err("PM replan은 ChatGPT 로그인 상태의 Codex가 필요합니다.".to_string());
    }

    let runtime_dir = workspace
        .parent()
        .ok_or_else(|| "Project workspace 상위 경로를 찾을 수 없습니다.".to_string())?
        .join(".luna-runtime")
        .join("projects")
        .join(&input.project_id)
        .join("pm")
        .join("replans")
        .join(input.replan_attempt.to_string());
    fs::create_dir_all(&runtime_dir)
        .map_err(|error| format!("PM replan runtime directory 생성 실패: {error}"))?;

    let schema_path = runtime_dir.join("replan.schema.json");
    let output_path = runtime_dir.join("replan.json");
    let events_path = runtime_dir.join("replan.events.jsonl");
    fs::write(&schema_path, REPLAN_SCHEMA)
        .map_err(|error| format!("PM replan schema 저장 실패: {error}"))?;

    let prompt = prompt(&input)?;
    let args = vec![
        "exec".to_string(),
        "--json".to_string(),
        "--output-schema".to_string(),
        schema_path.to_string_lossy().to_string(),
        "--output-last-message".to_string(),
        output_path.to_string_lossy().to_string(),
        "--sandbox".to_string(),
        "read-only".to_string(),
        "-C".to_string(),
        workspace.to_string_lossy().to_string(),
        "-".to_string(),
    ];

    let output = run_checked_with_stdin("codex", &args, &prompt)?;
    fs::write(&events_path, &output.stdout)
        .map_err(|error| format!("PM replan event log 저장 실패: {error}"))?;

    let raw = fs::read_to_string(&output_path)
        .map_err(|error| format!("PM replan 결과 읽기 실패: {error}"))?;
    let proposal: ProjectReplanProposal = serde_json::from_str(&raw)
        .map_err(|error| format!("PM replan 결과 JSON 파싱 실패: {error}"))?;
    validate_proposal(&input, &proposal)?;

    let events = String::from_utf8_lossy(&output.stdout);
    Ok(ReplanProjectResult {
        project_id: input.project_id.clone(),
        trigger_route_id: input.failure_route.id.clone(),
        session_id: extract_session_id(&events),
        events_path: events_path.to_string_lossy().to_string(),
        output_path: output_path.to_string_lossy().to_string(),
        proposal,
    })
}

#[tauri::command]
pub async fn replan_project_failure(
    input: ReplanProjectInput,
) -> Result<ReplanProjectResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_replan_blocking(input))
        .await
        .map_err(|error| format!("PM replan Runtime join 실패: {error}"))?
}
