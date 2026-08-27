use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Output, Stdio},
};

const INTAKE_SCHEMA: &str = r#"{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "summary",
    "primaryUser",
    "primaryJob",
    "complexity",
    "requiredRoles",
    "criticalRoles",
    "needsAuth",
    "userFacing",
    "externalDependencies",
    "riskFlags",
    "assumptions",
    "missingInputs",
    "rationaleSummary"
  ],
  "properties": {
    "summary": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "primaryUser": { "type": "string", "minLength": 1, "maxLength": 300 },
    "primaryJob": { "type": "string", "minLength": 1, "maxLength": 500 },
    "complexity": { "type": "string", "enum": ["small", "medium", "large"] },
    "requiredRoles": {
      "type": "array",
      "minItems": 1,
      "maxItems": 22,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "enum": [
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
          "process-evaluator"
        ]
      }
    },
    "criticalRoles": {
      "type": "array",
      "maxItems": 10,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "enum": [
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
          "process-evaluator"
        ]
      }
    },
    "needsAuth": { "type": "boolean" },
    "userFacing": { "type": "boolean" },
    "externalDependencies": {
      "type": "array",
      "maxItems": 12,
      "items": { "type": "string", "minLength": 1, "maxLength": 300 }
    },
    "riskFlags": {
      "type": "array",
      "maxItems": 10,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "enum": [
          "auth",
          "security",
          "external-api",
          "realtime",
          "payments",
          "data-persistence",
          "deployment",
          "accessibility",
          "performance",
          "unknown"
        ]
      }
    },
    "assumptions": {
      "type": "array",
      "maxItems": 12,
      "items": { "type": "string", "minLength": 1, "maxLength": 400 }
    },
    "missingInputs": {
      "type": "array",
      "maxItems": 12,
      "items": { "type": "string", "minLength": 1, "maxLength": 400 }
    },
    "rationaleSummary": { "type": "string", "minLength": 1, "maxLength": 1200 }
  }
}"#;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum IntakeRole {
    Idea,
    UxResearch,
    DesignSystem,
    Designer,
    Frontend,
    Backend,
    Database,
    ApiIntegration,
    Security,
    Performance,
    Devops,
    Accessibility,
    TestAutomation,
    DataMarketing,
    CodeReview,
    Reviewer,
    Qa,
    Documentation,
    DebugRouter,
    UserA,
    UserB,
    ProcessEvaluator,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum IntakeComplexity {
    Small,
    Medium,
    Large,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum IntakeRiskFlag {
    Auth,
    Security,
    ExternalApi,
    Realtime,
    Payments,
    DataPersistence,
    Deployment,
    Accessibility,
    Performance,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIntakeAnalysis {
    summary: String,
    primary_user: String,
    primary_job: String,
    complexity: IntakeComplexity,
    required_roles: Vec<IntakeRole>,
    critical_roles: Vec<IntakeRole>,
    needs_auth: bool,
    user_facing: bool,
    external_dependencies: Vec<String>,
    risk_flags: Vec<IntakeRiskFlag>,
    assumptions: Vec<String>,
    missing_inputs: Vec<String>,
    rationale_summary: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeProjectIntakeResult {
    analysis: ProjectIntakeAnalysis,
    session_id: Option<String>,
    events_path: String,
    output_path: String,
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

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() { stderr } else { stdout };
    Err(if detail.is_empty() {
        format!("{program} 명령이 실패했습니다.")
    } else {
        format!("{program} 명령 실패: {detail}")
    })
}

fn command_succeeds(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
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

fn validate_identifier(value: &str, label: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 120 {
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

fn validate_analysis(analysis: &ProjectIntakeAnalysis) -> Result<(), String> {
    if analysis.summary.trim().is_empty()
        || analysis.primary_user.trim().is_empty()
        || analysis.primary_job.trim().is_empty()
        || analysis.rationale_summary.trim().is_empty()
    {
        return Err("Project Intake 핵심 분석 필드가 비어 있습니다.".to_string());
    }
    if analysis.required_roles.is_empty() {
        return Err("Project Intake requiredRoles가 비어 있습니다.".to_string());
    }

    let required = analysis.required_roles.iter().copied().collect::<HashSet<_>>();
    if required.len() != analysis.required_roles.len() {
        return Err("Project Intake requiredRoles에 중복 역할이 있습니다.".to_string());
    }
    let critical = analysis.critical_roles.iter().copied().collect::<HashSet<_>>();
    if critical.len() != analysis.critical_roles.len() {
        return Err("Project Intake criticalRoles에 중복 역할이 있습니다.".to_string());
    }
    if critical.iter().any(|role| !required.contains(role)) {
        return Err("Project Intake criticalRoles는 requiredRoles의 부분집합이어야 합니다.".to_string());
    }

    Ok(())
}

fn intake_prompt(organization: &str, intake_id: &str, request: &str) -> String {
    format!(
        r#"You are Bloom's organization-level Project Intake Agent.

Intake ID: {intake_id}
GitHub Organization: {organization}
Product Owner request:
{request}

Analyze the request before any team is selected. Do not choose a team. Do not create or modify repositories, files, branches, commits, pull requests, issues, deployments, or external accounts. This turn is analysis only.

Organization contract:
- The five delivery teams are equal-status peers. They do not have predefined personalities or specialties.
- Each team has the same 30-Agent roster. Frontend, Backend, Code Review, QA, and Documentation have multiple worker instances, but requiredRoles describes role types rather than instance counts.
- Team strengths may only emerge later from measured project evidence. Never invent a team preference in this intake.
- PM and downstream Agents are independent workers. Your output is evidence for them, not authority.
- Preserve the Product Owner's explicit direction. Separate stated facts from conservative assumptions.
- Do not pretend credentials, APIs, datasets, legal approvals, paid services, or production infrastructure exist when they were not provided.

Analyze:
- concise product summary
- primary user and primary job-to-be-done
- rough implementation complexity: small, medium, or large
- Agent roles likely required after the team PM takes over
- a smaller criticalRoles subset representing true implementation bottlenecks or unusually important risk owners
- whether authentication is likely required
- whether this is user-facing
- external dependencies that appear necessary
- meaningful production risk flags
- conservative assumptions you had to make
- missing user/environment inputs that can block production
- a concise rationale summary grounded in the request

Role guidance:
- PM is not part of requiredRoles because a team PM always runs after allocation.
- Use UX Research for user interviews, persona or usability research; Database for schema/migration/query ownership; API Integration for external APIs/webhooks/SDKs; Security for auth/authorization/secret boundaries; Performance for measured latency/render/cache/query bottlenecks; DevOps for CI/CD/deployment/observability; Accessibility for keyboard/ARIA/focus/assistive-tech concerns; Test Automation for repeatable unit/integration/E2E automation.
- Do not mark Code Review, Reviewer, QA, Documentation, User A/B, or Process Evaluator as critical merely because they are normal governance gates. Mark them critical only if the request makes that role unusually central.
- criticalRoles must be a subset of requiredRoles.
- If the request is ambiguous, keep the analysis conservative and expose the ambiguity in assumptions or missingInputs rather than inventing requirements.
- The final response must match the supplied JSON schema exactly. No Markdown outside the JSON result.
"#
    )
}

fn analyze_project_intake_blocking(
    organization: String,
    workspace_root: String,
    intake_id: String,
    request: String,
) -> Result<AnalyzeProjectIntakeResult, String> {
    let organization = organization.trim().to_string();
    let workspace_root = workspace_root.trim().to_string();
    let intake_id = intake_id.trim().to_string();
    let request = request.trim().to_string();

    validate_identifier(&organization, "Organization")?;
    validate_identifier(&intake_id, "Intake ID")?;
    if workspace_root.is_empty() {
        return Err("Workspace root를 먼저 설정해 주세요.".to_string());
    }
    if request.is_empty() {
        return Err("프로젝트 요구사항이 비어 있습니다.".to_string());
    }
    if request.len() > 20_000 {
        return Err("프로젝트 요구사항이 너무 깁니다. 핵심 요구사항을 20,000자 이내로 정리해 주세요.".to_string());
    }
    if !command_succeeds("codex", &["--version"]) {
        return Err("Codex CLI가 설치되어 있지 않습니다.".to_string());
    }
    if !codex_chatgpt_authenticated() {
        return Err("Bloom Project Intake는 ChatGPT 로그인 상태의 Codex가 필요합니다.".to_string());
    }

    let intake_dir = PathBuf::from(&workspace_root)
        .join(".luna-runtime")
        .join("intakes")
        .join(&intake_id);
    fs::create_dir_all(&intake_dir)
        .map_err(|error| format!("Project Intake directory 생성 실패: {error}"))?;

    let schema_path = intake_dir.join("project-intake.schema.json");
    let output_path = intake_dir.join("project-intake.json");
    let events_path = intake_dir.join("project-intake.events.jsonl");
    fs::write(&schema_path, INTAKE_SCHEMA)
        .map_err(|error| format!("Project Intake schema 저장 실패: {error}"))?;

    let prompt = intake_prompt(&organization, &intake_id, &request);
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
        intake_dir.to_string_lossy().to_string(),
        "-".to_string(),
    ];

    let output = run_checked_with_stdin("codex", &args, &prompt)?;
    fs::write(&events_path, &output.stdout)
        .map_err(|error| format!("Project Intake event log 저장 실패: {error}"))?;

    let raw_analysis = fs::read_to_string(&output_path)
        .map_err(|error| format!("Project Intake 결과 파일 읽기 실패: {error}"))?;
    let analysis: ProjectIntakeAnalysis = serde_json::from_str(&raw_analysis)
        .map_err(|error| format!("Project Intake 결과 JSON 파싱 실패: {error}"))?;
    validate_analysis(&analysis)?;

    let events = String::from_utf8_lossy(&output.stdout);
    Ok(AnalyzeProjectIntakeResult {
        analysis,
        session_id: extract_codex_session_id(&events),
        events_path: events_path.to_string_lossy().to_string(),
        output_path: output_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn analyze_project_intake(
    organization: String,
    workspace_root: String,
    intake_id: String,
    request: String,
) -> Result<AnalyzeProjectIntakeResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        analyze_project_intake_blocking(organization, workspace_root, intake_id, request)
    })
    .await
    .map_err(|error| format!("Project Intake Runtime join 실패: {error}"))?
}
