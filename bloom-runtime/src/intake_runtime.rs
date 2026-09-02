use crate::local_inference_runtime;
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
      "items": {
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
      }
    },
    "criticalRoles": {
      "type": "array",
      "maxItems": 10,
      "items": {
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
    DesignSystem,
    Designer,
    UxResearch,
    Frontend,
    Backend,
    Database,
    Security,
    Devops,
    Accessibility,
    Performance,
    ApiIntegration,
    DataMarketing,
    CodeReview,
    Reviewer,
    Qa,
    TestAutomation,
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
- missingInputs MUST contain only Product Owner or environment information without which execution would be unsafe or impossible. If nothing concrete is missing, return an empty array: `missingInputs: []`. Examples of blocker categories include a required credential/secret for a mandatory external service, legal/ownership authorization, an irreversible destructive target, or a required external endpoint/dataset that the platform cannot provision. Never copy or paraphrase this example catalog into missingInputs; name only the concrete missing value for this project.
- Non-blocking uncertainty belongs in assumptions, not missingInputs. Examples include unspecified visual branding, traffic estimates, performance/SLA targets, test coverage percentages, seed data, optional backup/retention/moderation policy, or other preferences that a PM can choose conservatively.
- a concise rationale summary grounded in the request

Role guidance:
- PM is not part of requiredRoles because a team PM always runs after allocation.
- Use specialist roles when the request materially needs them: ux-research, database, security, devops, accessibility, performance, api-integration, data-marketing, or test-automation. Prefer generic frontend/backend when the specialist scope is not meaningful.
- Do not mark Code Review, Reviewer, QA, Documentation, User A/B, or Process Evaluator as critical merely because they are normal governance gates. Mark them critical only if the request makes that role unusually central.
- criticalRoles must be a subset of requiredRoles.
- If the request is ambiguous but a safe reversible default exists, record that default in assumptions and continue. Use missingInputs only when no safe execution path exists.
- Do not block on internal Bloom/Luna orchestration details such as repository bootstrap commands, delivery handoff APIs, worker commands, or verification plumbing. Those are system-owned capabilities, not Product Owner inputs.
- Do not re-ask for an assumption or limitation the Product Owner explicitly accepted. Preserve it and let PM/QA document the tradeoff.
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
    let inference = local_inference_runtime::run_structured_json(
        "project-intake",
        &prompt,
        INTAKE_SCHEMA,
        &intake_dir,
    )?;
    fs::write(
        &output_path,
        serde_json::to_vec_pretty(&inference.output)
            .map_err(|error| format!("Project Intake result serialization failed: {error}"))?,
    )
    .map_err(|error| format!("Project Intake result file write failed: {error}"))?;
    fs::write(&events_path, &inference.events_jsonl)
        .map_err(|error| format!("Project Intake event log write failed: {error}"))?;
    let analysis: ProjectIntakeAnalysis = serde_json::from_value(inference.output)
        .map_err(|error| format!("Project Intake result JSON parsing failed: {error}"))?;
    validate_analysis(&analysis)?;

    Ok(AnalyzeProjectIntakeResult {
        analysis,
        session_id: inference.session_id,
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