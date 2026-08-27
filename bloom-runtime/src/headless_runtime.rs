use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, Read};

use crate::{
    agent_evidence_runtime,
    agent_reconciliation,
    agent_runtime,
    intake_runtime,
    integration_runtime,
    project_runtime,
};

const MAX_REQUEST_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(tag = "command")]
enum HeadlessRuntimeRequest {
    #[serde(rename = "preflight")]
    Preflight {
        organization: String,
    },
    #[serde(rename = "analyzeIntake")]
    AnalyzeIntake {
        organization: String,
        #[serde(rename = "workspaceRoot")]
        workspace_root: String,
        #[serde(rename = "intakeId")]
        intake_id: String,
        request: String,
    },
    #[serde(rename = "planProject")]
    PlanProject {
        organization: String,
        #[serde(rename = "workspaceRoot")]
        workspace_root: String,
        #[serde(rename = "projectId")]
        project_id: String,
        #[serde(rename = "teamId")]
        team_id: String,
        #[serde(rename = "teamName")]
        team_name: String,
        request: String,
    },
    #[serde(rename = "bootstrapProjectRepository")]
    BootstrapProjectRepository {
        organization: String,
        repository: String,
        #[serde(rename = "workspaceRoot")]
        workspace_root: String,
    },
    #[serde(rename = "startProject")]
    StartProject {
        organization: String,
        #[serde(rename = "workspaceRoot")]
        workspace_root: String,
        #[serde(rename = "projectId")]
        project_id: String,
        #[serde(rename = "teamId")]
        team_id: String,
        #[serde(rename = "teamName")]
        team_name: String,
        request: String,
    },
    #[serde(rename = "dispatchAgentTask")]
    DispatchAgentTask {
        input: agent_runtime::AgentTaskRuntimeInput,
    },
    #[serde(rename = "reconcileInterruptedAgentTask")]
    ReconcileInterruptedAgentTask {
        input: agent_reconciliation::ReconcileInterruptedAgentTaskInput,
    },
    #[serde(rename = "mergePullRequests")]
    MergePullRequests {
        input: integration_runtime::MergeProjectPullRequestsInput,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HeadlessRuntimeResponse {
    ok: bool,
    result: Option<Value>,
    error: Option<String>,
}

fn success<T: Serialize>(value: T) -> HeadlessRuntimeResponse {
    match serde_json::to_value(value) {
        Ok(result) => HeadlessRuntimeResponse {
            ok: true,
            result: Some(result),
            error: None,
        },
        Err(error) => failure(format!("headless Runtime 결과 직렬화 실패: {error}")),
    }
}

fn failure(error: String) -> HeadlessRuntimeResponse {
    HeadlessRuntimeResponse {
        ok: false,
        result: None,
        error: Some(error),
    }
}

fn runtime_role_alias(role: &str) -> &str {
    match role {
        "database" | "security" | "devops" | "performance" | "api-integration" => "backend",
        "accessibility" | "test-automation" => "frontend",
        "ux-research" => "designer",
        _ => role,
    }
}

fn adapt_dispatch_input(
    mut input: agent_runtime::AgentTaskRuntimeInput,
) -> (String, agent_runtime::AgentTaskRuntimeInput) {
    let original_role = input.role.clone();
    let alias = runtime_role_alias(&original_role);
    if alias != original_role {
        input.summary = format!(
            "[Bloom specialist ownership] Original role: {original_role}. Execute as the {original_role} specialist. The Rust runtime role `{alias}` is only a transport compatibility alias; preserve the specialist scope and rationale.\n\n{}",
            input.summary
        );
        input.role = alias.to_string();
    }
    (original_role, input)
}

fn adapt_reconciliation_input(
    mut input: agent_reconciliation::ReconcileInterruptedAgentTaskInput,
) -> (String, agent_reconciliation::ReconcileInterruptedAgentTaskInput) {
    let original_role = input.role.clone();
    let alias = runtime_role_alias(&original_role);
    if alias != original_role {
        input.role = alias.to_string();
    }
    (original_role, input)
}

async fn execute(request: HeadlessRuntimeRequest) -> HeadlessRuntimeResponse {
    match request {
        HeadlessRuntimeRequest::Preflight { organization } => {
            success(project_runtime::project_runtime_preflight(organization))
        }
        HeadlessRuntimeRequest::AnalyzeIntake {
            organization,
            workspace_root,
            intake_id,
            request,
        } => match intake_runtime::analyze_project_intake(
            organization,
            workspace_root,
            intake_id,
            request,
        )
        .await
        {
            Ok(result) => success(result),
            Err(error) => failure(error),
        },
        HeadlessRuntimeRequest::PlanProject {
            organization,
            workspace_root,
            project_id,
            team_id,
            team_name,
            request,
        } => match project_runtime::plan_project_runtime(
            organization,
            workspace_root,
            project_id,
            team_id,
            team_name,
            request,
        )
        .await
        {
            Ok(result) => success(result),
            Err(error) => failure(error),
        },
        HeadlessRuntimeRequest::BootstrapProjectRepository {
            organization,
            repository,
            workspace_root,
        } => match project_runtime::bootstrap_project_repository(
            organization,
            repository,
            workspace_root,
        ) {
            Ok(result) => success(result),
            Err(error) => failure(error),
        },
        HeadlessRuntimeRequest::StartProject {
            organization,
            workspace_root,
            project_id,
            team_id,
            team_name,
            request,
        } => match project_runtime::start_project_runtime(
            organization,
            workspace_root,
            project_id,
            team_id,
            team_name,
            request,
        )
        .await
        {
            Ok(result) => success(result),
            Err(error) => failure(error),
        },
        HeadlessRuntimeRequest::DispatchAgentTask { input } => {
            let (original_role, adapted_input) = adapt_dispatch_input(input);
            match agent_evidence_runtime::dispatch_agent_task(adapted_input).await {
                Ok(mut result) => {
                    result.role = original_role;
                    success(result)
                }
                Err(error) => failure(error),
            }
        }
        HeadlessRuntimeRequest::ReconcileInterruptedAgentTask { input } => {
            let (original_role, adapted_input) = adapt_reconciliation_input(input);
            match agent_evidence_runtime::reconcile_interrupted_agent_task(adapted_input).await {
                Ok(mut result) => {
                    if let Some(recovered) = result.result.as_mut() {
                        recovered.role = original_role;
                    }
                    success(result)
                }
                Err(error) => failure(error),
            }
        }
        HeadlessRuntimeRequest::MergePullRequests { input } => {
            match integration_runtime::merge_project_pull_requests(input) {
                Ok(result) => success(result),
                Err(error) => failure(error),
            }
        }
    }
}

fn parse_request() -> Result<HeadlessRuntimeRequest, String> {
    let mut input = String::new();
    io::stdin()
        .take(MAX_REQUEST_BYTES + 1)
        .read_to_string(&mut input)
        .map_err(|error| format!("headless Runtime stdin 읽기 실패: {error}"))?;

    if input.len() as u64 > MAX_REQUEST_BYTES {
        return Err("headless Runtime 요청은 2MB 이하여야 합니다.".to_string());
    }
    if input.trim().is_empty() {
        return Err("headless Runtime 요청이 비어 있습니다.".to_string());
    }

    serde_json::from_str(&input)
        .map_err(|error| format!("headless Runtime 요청 JSON 파싱 실패: {error}"))
}

pub fn run_stdio() -> i32 {
    let response = match parse_request() {
        Ok(request) => tauri::async_runtime::block_on(execute(request)),
        Err(error) => failure(error),
    };
    let code = if response.ok { 0 } else { 1 };

    match serde_json::to_string(&response) {
        Ok(output) => println!("{output}"),
        Err(error) => {
            eprintln!("headless Runtime 응답 직렬화 실패: {error}");
            return 1;
        }
    }

    code
}
