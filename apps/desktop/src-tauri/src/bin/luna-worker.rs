use luna_lib::{
    agent_runtime::{
        dispatch_agent_task, AgentTaskRunResult, AgentTaskRuntimeInput, DependencyArtifact,
    },
    failure_router_runtime::{
        route_agent_failure, FailureOwnerCandidate, FailureVerification, RouteAgentFailureInput,
        RouteAgentFailureResult,
    },
    integration_runtime::{merge_project_pull_requests, MergeProjectPullRequestsInput},
    project_runtime::bootstrap_project_repository,
    replan_runtime::{
        replan_project_failure, ReplanFailureRoute, ReplanProjectInput, ReplanProjectResult,
        ReplanTaskContext,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    env,
    fs,
    path::{Path, PathBuf},
};

const REPOSITORY_WRITER_ROLES: &[&str] = &[
    "design-system",
    "designer",
    "frontend",
    "backend",
    "data-marketing",
    "documentation",
    "debug-router",
];
const MAX_REMOTE_ROUTE_ATTEMPTS: u32 = 3;
const MAX_REMOTE_REPLAN_ATTEMPTS: u32 = 3;
const MAX_REMOTE_AGENT_ATTEMPTS: u32 = 3;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerEnvelope {
    protocol_version: u32,
    job_id: String,
    project_id: String,
    payload: WorkerPayload,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerPayload {
    protocol_version: u32,
    kind: String,
    organization: String,
    repository_name: String,
    tasks: Vec<WorkerTask>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerTask {
    #[serde(default)]
    depends_on: Vec<String>,
    runtime_input: AgentTaskRuntimeInput,
}

#[derive(Debug, Clone)]
struct WorkerTaskMetadata {
    depends_on: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerOutput {
    protocol_version: u32,
    job_id: String,
    project_id: String,
    status: String,
    message: String,
    repository_full_name: String,
    workspace_path: String,
    blocked_task_id: Option<String>,
    task_results: Vec<AgentTaskRunResult>,
    failure_routes: Vec<RouteAgentFailureResult>,
    replans: Vec<ReplanProjectResult>,
    merged_pull_request_numbers: Vec<u64>,
}

fn parse_args() -> Result<(PathBuf, PathBuf), String> {
    let mut input: Option<PathBuf> = None;
    let mut output: Option<PathBuf> = None;
    let mut args = env::args().skip(1);

    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--input" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--input requires a file path".to_string())?;
                input = Some(PathBuf::from(value));
            }
            "--output" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--output requires a file path".to_string())?;
                output = Some(PathBuf::from(value));
            }
            _ => return Err(format!("unsupported argument: {argument}")),
        }
    }

    Ok((
        input.ok_or_else(|| "--input is required".to_string())?,
        output.ok_or_else(|| "--output is required".to_string())?,
    ))
}

fn validate_envelope(envelope: &WorkerEnvelope) -> Result<(), String> {
    if envelope.protocol_version != 1 || envelope.payload.protocol_version != 1 {
        return Err("unsupported Luna Runner protocol version".to_string());
    }
    if envelope.payload.kind != "project-execution" {
        return Err(format!(
            "unsupported Luna Runner job kind: {}",
            envelope.payload.kind
        ));
    }
    if envelope.job_id.trim().is_empty() || envelope.project_id.trim().is_empty() {
        return Err("jobId and projectId are required".to_string());
    }
    if envelope.payload.organization.trim().is_empty()
        || envelope.payload.repository_name.trim().is_empty()
    {
        return Err("organization and repositoryName are required".to_string());
    }
    if envelope.payload.tasks.is_empty() {
        return Err("project-execution requires at least one Agent task".to_string());
    }

    let task_ids = envelope
        .payload
        .tasks
        .iter()
        .map(|task| task.runtime_input.task_id.as_str())
        .collect::<HashSet<_>>();
    if task_ids.len() != envelope.payload.tasks.len() {
        return Err("duplicate Agent task IDs are not allowed".to_string());
    }

    for task in &envelope.payload.tasks {
        if task.runtime_input.project_id != envelope.project_id {
            return Err(format!(
                "task {} belongs to a different project",
                task.runtime_input.task_id
            ));
        }
        for dependency in &task.depends_on {
            if dependency == &task.runtime_input.task_id {
                return Err(format!(
                    "task {} cannot depend on itself",
                    task.runtime_input.task_id
                ));
            }
            if !task_ids.contains(dependency.as_str()) {
                return Err(format!(
                    "task {} references missing dependency {}",
                    task.runtime_input.task_id, dependency
                ));
            }
        }
    }

    Ok(())
}

fn dependency_artifact(result: &AgentTaskRunResult) -> DependencyArtifact {
    DependencyArtifact {
        task_id: result.task_id.clone(),
        role: result.role.clone(),
        summary: result.report.summary.clone(),
        branch_name: result.branch_name.clone(),
        commit_sha: result.report.commit_sha.clone(),
        pull_request_number: result.report.pull_request_number,
        pull_request_url: result.report.pull_request_url.clone(),
    }
}

fn write_output(path: &Path, output: &WorkerOutput) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("worker output directory creation failed: {error}"))?;
    }
    let encoded = serde_json::to_string_pretty(output)
        .map_err(|error| format!("worker output serialization failed: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, encoded)
        .map_err(|error| format!("worker output write failed: {error}"))?;
    fs::rename(&temporary, path)
        .map_err(|error| format!("worker output commit failed: {error}"))
}

fn bootstrap_remote_workspace(
    organization: &str,
    repository_name: &str,
) -> Result<(String, String), String> {
    let workspace_root = env::var("LUNA_RUNNER_WORKSPACE_ROOT")
        .map_err(|_| "LUNA_RUNNER_WORKSPACE_ROOT is required for remote execution".to_string())?;
    if workspace_root.trim().is_empty() {
        return Err("LUNA_RUNNER_WORKSPACE_ROOT cannot be empty".to_string());
    }

    let bootstrap = bootstrap_project_repository(
        organization.to_string(),
        repository_name.to_string(),
        workspace_root,
    )?;
    let value = serde_json::to_value(bootstrap)
        .map_err(|error| format!("repository bootstrap serialization failed: {error}"))?;
    let repository_full_name = value
        .get("repository")
        .and_then(Value::as_str)
        .ok_or_else(|| "repository bootstrap result is missing repository".to_string())?
        .to_string();
    let workspace_path = value
        .get("workspacePath")
        .and_then(Value::as_str)
        .ok_or_else(|| "repository bootstrap result is missing workspacePath".to_string())?
        .to_string();

    Ok((repository_full_name, workspace_path))
}

fn task_transitively_depends_on(
    metadata: &HashMap<String, WorkerTaskMetadata>,
    task_id: &str,
    dependency_task_id: &str,
) -> bool {
    let mut visited = HashSet::new();
    let mut stack = metadata
        .get(task_id)
        .map(|task| task.depends_on.clone())
        .unwrap_or_default();

    while let Some(current) = stack.pop() {
        if current == dependency_task_id {
            return true;
        }
        if !visited.insert(current.clone()) {
            continue;
        }
        if let Some(task) = metadata.get(&current) {
            stack.extend(task.depends_on.iter().cloned());
        }
    }

    false
}

fn validate_task_graph_and_review_topology(
    original_order: &[String],
    templates: &HashMap<String, WorkerTask>,
    metadata: &HashMap<String, WorkerTaskMetadata>,
) -> Result<(), String> {
    for task_id in original_order {
        let task = templates
            .get(task_id)
            .ok_or_else(|| format!("task graph template missing {task_id}"))?;
        let graph = metadata
            .get(task_id)
            .ok_or_else(|| format!("task graph metadata missing {task_id}"))?;
        for dependency in &graph.depends_on {
            if !templates.contains_key(dependency) {
                return Err(format!(
                    "task graph contains missing dependency: {task_id} -> {dependency}"
                ));
            }
        }
        if task.runtime_input.task_id != *task_id {
            return Err(format!("task graph template ID mismatch for {task_id}"));
        }
    }

    let mut completed_ids = HashSet::new();
    while completed_ids.len() < original_order.len() {
        let before = completed_ids.len();
        for task_id in original_order {
            if completed_ids.contains(task_id) {
                continue;
            }
            let dependencies = &metadata
                .get(task_id)
                .ok_or_else(|| format!("task graph metadata missing {task_id}"))?
                .depends_on;
            if dependencies
                .iter()
                .all(|dependency| completed_ids.contains(dependency))
            {
                completed_ids.insert(task_id.clone());
            }
        }
        if completed_ids.len() == before {
            return Err("task graph contains a dependency cycle".to_string());
        }
    }

    let writer_ids = original_order
        .iter()
        .filter(|task_id| {
            templates
                .get(*task_id)
                .map(|task| REPOSITORY_WRITER_ROLES.contains(&task.runtime_input.role.as_str()))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();

    for writer_id in writer_ids {
        let code_reviews = original_order
            .iter()
            .filter(|task_id| {
                templates
                    .get(*task_id)
                    .map(|task| task.runtime_input.role == "code-review")
                    .unwrap_or(false)
                    && task_transitively_depends_on(metadata, task_id, writer_id)
            })
            .collect::<Vec<_>>();
        if code_reviews.is_empty() {
            return Err(format!("{writer_id} has no downstream Code Review task"));
        }

        let reviewers = original_order
            .iter()
            .filter(|task_id| {
                templates
                    .get(*task_id)
                    .map(|task| task.runtime_input.role == "reviewer")
                    .unwrap_or(false)
                    && code_reviews.iter().any(|code_review| {
                        task_transitively_depends_on(metadata, task_id, code_review)
                    })
            })
            .collect::<Vec<_>>();
        if reviewers.is_empty() {
            return Err(format!("{writer_id} has no Reviewer task after Code Review"));
        }

        let qa_exists = original_order.iter().any(|task_id| {
            templates
                .get(task_id)
                .map(|task| task.runtime_input.role == "qa")
                .unwrap_or(false)
                && reviewers
                    .iter()
                    .any(|reviewer| task_transitively_depends_on(metadata, task_id, reviewer))
        });
        if !qa_exists {
            return Err(format!("{writer_id} has no QA task after Reviewer"));
        }
    }

    Ok(())
}

fn verification_passed(result: &AgentTaskRunResult) -> bool {
    !result.report.verification.iter().any(|verification| {
        matches!(verification.status.as_str(), "failed" | "blocked")
    })
}

fn clean_review_results<'a>(
    completed: &'a [AgentTaskRunResult],
    role: &str,
    pull_request_number: u64,
) -> Vec<&'a AgentTaskRunResult> {
    completed
        .iter()
        .filter(|result| {
            result.role == role
                && result.report.status == "completed"
                && result
                    .report
                    .reviewed_pull_requests
                    .contains(&pull_request_number)
                && verification_passed(result)
        })
        .collect()
}

fn evaluate_remote_merge_gate(
    metadata: &HashMap<String, WorkerTaskMetadata>,
    completed: &[AgentTaskRunResult],
) -> Result<Vec<u64>, String> {
    if completed.len() != metadata.len() {
        return Err(format!(
            "remote merge gate blocked: completed Agent tasks {}/{}",
            completed.len(),
            metadata.len()
        ));
    }
    if completed
        .iter()
        .any(|result| result.report.status != "completed")
    {
        return Err("remote merge gate blocked: at least one Agent task is not completed".to_string());
    }

    let writer_results = completed
        .iter()
        .filter(|result| REPOSITORY_WRITER_ROLES.contains(&result.role.as_str()))
        .collect::<Vec<_>>();

    let mut pull_request_numbers = Vec::new();
    for owner in &writer_results {
        let pull_request_number = owner.report.pull_request_number.ok_or_else(|| {
            format!(
                "remote merge gate blocked: {}({}) completed without a PR number",
                owner.task_id, owner.role
            )
        })?;
        pull_request_numbers.push(pull_request_number);

        let code_reviews = clean_review_results(completed, "code-review", pull_request_number)
            .into_iter()
            .filter(|review| {
                task_transitively_depends_on(metadata, &review.task_id, &owner.task_id)
            })
            .collect::<Vec<_>>();
        if code_reviews.is_empty() {
            return Err(format!(
                "remote merge gate blocked: PR #{pull_request_number} ({}) has no valid downstream Code Review evidence",
                owner.task_id
            ));
        }

        let reviewers = clean_review_results(completed, "reviewer", pull_request_number)
            .into_iter()
            .filter(|reviewer| {
                code_reviews.iter().any(|code_review| {
                    task_transitively_depends_on(
                        metadata,
                        &reviewer.task_id,
                        &code_review.task_id,
                    )
                })
            })
            .collect::<Vec<_>>();
        if reviewers.is_empty() {
            return Err(format!(
                "remote merge gate blocked: PR #{pull_request_number} ({}) has no valid Reviewer evidence after Code Review",
                owner.task_id
            ));
        }

        let qa_results = clean_review_results(completed, "qa", pull_request_number)
            .into_iter()
            .filter(|qa| {
                reviewers.iter().any(|reviewer| {
                    task_transitively_depends_on(metadata, &qa.task_id, &reviewer.task_id)
                })
            })
            .collect::<Vec<_>>();
        if qa_results.is_empty() {
            return Err(format!(
                "remote merge gate blocked: PR #{pull_request_number} ({}) has no valid QA evidence after Reviewer",
                owner.task_id
            ));
        }
    }

    pull_request_numbers.sort_unstable();
    pull_request_numbers.dedup();
    if pull_request_numbers.is_empty() {
        return Err("remote merge gate blocked: there are no Agent PRs to integrate".to_string());
    }

    Ok(pull_request_numbers)
}

fn integrate_remote_pull_requests(
    repository_full_name: &str,
    metadata: &HashMap<String, WorkerTaskMetadata>,
    completed: &[AgentTaskRunResult],
) -> Result<Vec<u64>, String> {
    let pull_request_numbers = evaluate_remote_merge_gate(metadata, completed)?;
    let integration = merge_project_pull_requests(MergeProjectPullRequestsInput {
        repository_full_name: repository_full_name.to_string(),
        pull_request_numbers,
    })?;

    Ok(integration
        .merged_pull_requests
        .iter()
        .map(|pull_request| pull_request.number)
        .collect())
}

fn owner_candidate_ids(
    metadata: &HashMap<String, WorkerTaskMetadata>,
    failed_task_id: &str,
) -> HashSet<String> {
    let mut candidates = HashSet::from([failed_task_id.to_string()]);
    let mut stack = metadata
        .get(failed_task_id)
        .map(|task| task.depends_on.clone())
        .unwrap_or_default();
    while let Some(task_id) = stack.pop() {
        if !candidates.insert(task_id.clone()) {
            continue;
        }
        if let Some(task) = metadata.get(&task_id) {
            stack.extend(task.depends_on.iter().cloned());
        }
    }
    candidates
}

fn route_blocked_agent(
    blocked_result: &AgentTaskRunResult,
    templates: &HashMap<String, WorkerTask>,
    metadata: &HashMap<String, WorkerTaskMetadata>,
    repository_full_name: &str,
    workspace_path: &str,
    route_attempt: u32,
) -> Result<RouteAgentFailureResult, String> {
    let failed_template = templates
        .get(&blocked_result.task_id)
        .ok_or_else(|| format!("missing task template for {}", blocked_result.task_id))?;
    let candidate_ids = owner_candidate_ids(metadata, &blocked_result.task_id);
    let mut candidate_owners = templates
        .values()
        .filter(|task| candidate_ids.contains(&task.runtime_input.task_id))
        .map(|task| FailureOwnerCandidate {
            task_id: task.runtime_input.task_id.clone(),
            role: task.runtime_input.role.clone(),
            title: task.runtime_input.title.clone(),
            summary: task.runtime_input.summary.clone(),
        })
        .collect::<Vec<_>>();
    candidate_owners.sort_by(|left, right| left.task_id.cmp(&right.task_id));

    let verification = blocked_result
        .report
        .verification
        .iter()
        .map(|item| FailureVerification {
            name: item.name.clone(),
            status: item.status.clone(),
            details: item.details.clone(),
        })
        .collect::<Vec<_>>();
    let failure_reason = if blocked_result.report.blockers.is_empty() {
        blocked_result.report.summary.clone()
    } else {
        blocked_result.report.blockers.join(" · ")
    };

    tauri::async_runtime::block_on(route_agent_failure(RouteAgentFailureInput {
        project_id: blocked_result.project_id.clone(),
        team_id: failed_template.runtime_input.team_id.clone(),
        team_name: failed_template.runtime_input.team_name.clone(),
        repository_full_name: repository_full_name.to_string(),
        workspace_path: workspace_path.to_string(),
        failed_task_id: blocked_result.task_id.clone(),
        failed_role: blocked_result.role.clone(),
        failure_reason,
        blockers: blocked_result.report.blockers.clone(),
        verification,
        candidate_owners,
        route_attempt,
    }))
}

fn requeue_owner_scope(
    owner_task_id: &str,
    original_order: &[String],
    templates: &HashMap<String, WorkerTask>,
    metadata: &HashMap<String, WorkerTaskMetadata>,
    pending: &mut Vec<WorkerTask>,
    completed: &mut Vec<AgentTaskRunResult>,
) -> Result<(), String> {
    if !metadata.contains_key(owner_task_id) {
        return Err(format!("Failure Router selected unknown owner task {owner_task_id}"));
    }

    let invalidated = original_order
        .iter()
        .filter(|task_id| {
            task_id.as_str() == owner_task_id
                || task_transitively_depends_on(metadata, task_id, owner_task_id)
        })
        .cloned()
        .collect::<HashSet<_>>();

    completed.retain(|result| !invalidated.contains(&result.task_id));
    pending.retain(|task| !invalidated.contains(&task.runtime_input.task_id));

    for task_id in original_order {
        if !invalidated.contains(task_id) {
            continue;
        }
        let template = templates
            .get(task_id)
            .ok_or_else(|| format!("missing retry template for {task_id}"))?;
        pending.push(template.clone());
    }
    Ok(())
}

fn is_mandatory_marketing_task(task: &WorkerTask) -> bool {
    task.runtime_input.role == "data-marketing"
        || task.runtime_input.task_slug.starts_with("marketing-documentation")
        || task.runtime_input.task_slug.starts_with("marketing-docs-code-review")
        || task.runtime_input.task_slug.starts_with("marketing-product-review")
        || task.runtime_input.task_slug.starts_with("product-marketing-strategy")
}

fn result_has_artifacts(result: &AgentTaskRunResult) -> bool {
    result.branch_name.is_some()
        || result.report.commit_sha.is_some()
        || result.report.pull_request_number.is_some()
        || result.report.pull_request_url.is_some()
}

fn run_remote_replan(
    route_result: &RouteAgentFailureResult,
    blocked_result: &AgentTaskRunResult,
    original_order: &[String],
    templates: &HashMap<String, WorkerTask>,
    metadata: &HashMap<String, WorkerTaskMetadata>,
    completed: &[AgentTaskRunResult],
    task_attempts: &HashMap<String, u32>,
    repository_full_name: &str,
    workspace_path: &str,
    replan_attempt: u32,
) -> Result<ReplanProjectResult, String> {
    if replan_attempt == 0 || replan_attempt > MAX_REMOTE_REPLAN_ATTEMPTS {
        return Err(format!(
            "remote PM replan attempt must be 1..={MAX_REMOTE_REPLAN_ATTEMPTS}"
        ));
    }
    let failed_template = templates
        .get(&blocked_result.task_id)
        .ok_or_else(|| format!("missing task template for {}", blocked_result.task_id))?;

    let current_tasks = original_order
        .iter()
        .map(|task_id| {
            let task = templates
                .get(task_id)
                .ok_or_else(|| format!("missing task template for {task_id}"))?;
            let completed_result = completed.iter().find(|result| result.task_id == *task_id);
            let is_failed = *task_id == blocked_result.task_id;
            let has_artifacts = completed_result
                .map(result_has_artifacts)
                .unwrap_or(false)
                || (is_failed && result_has_artifacts(blocked_result));
            Ok(ReplanTaskContext {
                id: task.runtime_input.task_id.clone(),
                title: task.runtime_input.title.clone(),
                role: task.runtime_input.role.clone(),
                task_slug: task.runtime_input.task_slug.clone(),
                summary: task.runtime_input.summary.clone(),
                depends_on: metadata
                    .get(task_id)
                    .map(|value| value.depends_on.clone())
                    .unwrap_or_default(),
                acceptance_criteria: task.runtime_input.acceptance_criteria.clone(),
                status: if is_failed {
                    "blocked".to_string()
                } else if completed_result.is_some() {
                    "done".to_string()
                } else {
                    "pending".to_string()
                },
                attempts: *task_attempts.get(task_id).unwrap_or(&0),
                has_artifacts,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let retirable_task_ids = current_tasks
        .iter()
        .filter(|context| {
            templates
                .get(&context.id)
                .map(|task| {
                    !is_mandatory_marketing_task(task)
                        && context.status != "done"
                        && !context.has_artifacts
                })
                .unwrap_or(false)
        })
        .map(|context| context.id.clone())
        .collect::<Vec<_>>();
    let reopenable_task_ids = current_tasks
        .iter()
        .filter(|context| {
            context.role != "debug-router" && context.attempts < MAX_REMOTE_AGENT_ATTEMPTS
        })
        .map(|context| context.id.clone())
        .collect::<Vec<_>>();

    let decision = &route_result.decision;
    let route_id = format!(
        "REMOTE-ROUTE-{}-{replan_attempt}",
        blocked_result.task_id
    );
    tauri::async_runtime::block_on(replan_project_failure(ReplanProjectInput {
        project_id: blocked_result.project_id.clone(),
        team_id: failed_template.runtime_input.team_id.clone(),
        team_name: failed_template.runtime_input.team_name.clone(),
        repository_full_name: repository_full_name.to_string(),
        workspace_path: workspace_path.to_string(),
        user_request: failed_template.runtime_input.user_request.clone(),
        product_summary: failed_template.runtime_input.product_summary.clone(),
        architecture_summary: failed_template.runtime_input.architecture_summary.clone(),
        failure_route: ReplanFailureRoute {
            id: route_id,
            failed_task_id: blocked_result.task_id.clone(),
            failed_role: blocked_result.role.clone(),
            failure_type: decision.failure_type.clone(),
            severity: decision.severity.clone(),
            summary: decision.summary.clone(),
            rationale_summary: decision.rationale_summary.clone(),
            evidence: decision.evidence.clone(),
            recommended_action: decision.recommended_action.clone(),
        },
        current_tasks,
        retirable_task_ids,
        reopenable_task_ids,
        replan_attempt,
    }))
}

fn apply_remote_replan(
    result: &ReplanProjectResult,
    original_order: &mut Vec<String>,
    templates: &mut HashMap<String, WorkerTask>,
    metadata: &mut HashMap<String, WorkerTaskMetadata>,
    pending: &mut Vec<WorkerTask>,
    completed: &mut Vec<AgentTaskRunResult>,
    task_attempts: &mut HashMap<String, u32>,
) -> Result<(), String> {
    let retire = result
        .proposal
        .retire_task_ids
        .iter()
        .cloned()
        .collect::<HashSet<_>>();
    let reopen = result
        .proposal
        .reopen_task_ids
        .iter()
        .cloned()
        .collect::<HashSet<_>>();

    if !retire.is_empty() {
        original_order.retain(|task_id| !retire.contains(task_id));
        pending.retain(|task| !retire.contains(&task.runtime_input.task_id));
        completed.retain(|task| !retire.contains(&task.task_id));
        for task_id in &retire {
            templates.remove(task_id);
            metadata.remove(task_id);
            task_attempts.remove(task_id);
        }
    }

    let base_input = templates
        .values()
        .next()
        .map(|task| task.runtime_input.clone())
        .ok_or_else(|| "PM replan retired every task; no runtime context remains".to_string())?;
    let mut new_task_ids = Vec::new();
    for task in &result.proposal.new_tasks {
        if templates.contains_key(&task.id) {
            return Err(format!("PM replan new task ID already exists: {}", task.id));
        }
        let runtime_input = AgentTaskRuntimeInput {
            organization: base_input.organization.clone(),
            project_id: base_input.project_id.clone(),
            team_id: base_input.team_id.clone(),
            team_name: base_input.team_name.clone(),
            role: task.role.clone(),
            agent_id: format!("{}:{}", base_input.team_id, task.role),
            task_id: task.id.clone(),
            task_slug: task.task_slug.clone(),
            title: task.title.clone(),
            summary: task.summary.clone(),
            acceptance_criteria: task.acceptance_criteria.clone(),
            user_request: base_input.user_request.clone(),
            product_summary: base_input.product_summary.clone(),
            architecture_summary: base_input.architecture_summary.clone(),
            repository_full_name: base_input.repository_full_name.clone(),
            workspace_path: base_input.workspace_path.clone(),
            dependencies: Vec::new(),
        };
        let worker_task = WorkerTask {
            depends_on: task.depends_on.clone(),
            runtime_input,
        };
        original_order.push(task.id.clone());
        metadata.insert(
            task.id.clone(),
            WorkerTaskMetadata {
                depends_on: task.depends_on.clone(),
            },
        );
        templates.insert(task.id.clone(), worker_task);
        task_attempts.insert(task.id.clone(), 0);
        new_task_ids.push(task.id.clone());
    }

    validate_task_graph_and_review_topology(original_order, templates, metadata)?;

    let invalidated = original_order
        .iter()
        .filter(|task_id| {
            reopen.contains(*task_id)
                || reopen
                    .iter()
                    .any(|reopened| task_transitively_depends_on(metadata, task_id, reopened))
                || new_task_ids.contains(*task_id)
        })
        .cloned()
        .collect::<HashSet<_>>();

    completed.retain(|task| !invalidated.contains(&task.task_id));
    pending.retain(|task| !invalidated.contains(&task.runtime_input.task_id));

    let completed_ids = completed
        .iter()
        .map(|result| result.task_id.clone())
        .collect::<HashSet<_>>();
    let mut pending_ids = pending
        .iter()
        .map(|task| task.runtime_input.task_id.clone())
        .collect::<HashSet<_>>();
    for task_id in original_order.iter() {
        if completed_ids.contains(task_id) || pending_ids.contains(task_id) {
            continue;
        }
        let template = templates
            .get(task_id)
            .ok_or_else(|| format!("missing post-replan template for {task_id}"))?;
        pending.push(template.clone());
        pending_ids.insert(task_id.clone());
    }

    Ok(())
}

fn blocked_output(
    envelope: &WorkerEnvelope,
    repository_full_name: String,
    workspace_path: String,
    blocked_task_id: Option<String>,
    message: String,
    mut task_results: Vec<AgentTaskRunResult>,
    blocked_result: Option<AgentTaskRunResult>,
    failure_routes: Vec<RouteAgentFailureResult>,
    replans: Vec<ReplanProjectResult>,
) -> WorkerOutput {
    if let Some(result) = blocked_result {
        task_results.retain(|existing| existing.task_id != result.task_id);
        task_results.push(result);
    }
    WorkerOutput {
        protocol_version: 1,
        job_id: envelope.job_id.clone(),
        project_id: envelope.project_id.clone(),
        status: "blocked".to_string(),
        message,
        repository_full_name,
        workspace_path,
        blocked_task_id,
        task_results,
        failure_routes,
        replans,
        merged_pull_request_numbers: Vec::new(),
    }
}

fn run_project(mut envelope: WorkerEnvelope) -> Result<WorkerOutput, String> {
    validate_envelope(&envelope)?;

    let organization = envelope.payload.organization.trim().to_string();
    let repository_name = envelope.payload.repository_name.trim().to_string();
    let (repository_full_name, workspace_path) =
        bootstrap_remote_workspace(&organization, &repository_name)?;

    for task in &mut envelope.payload.tasks {
        task.runtime_input.organization = organization.clone();
        task.runtime_input.repository_full_name = repository_full_name.clone();
        task.runtime_input.workspace_path = workspace_path.clone();
        task.runtime_input.dependencies = Vec::new();
    }

    let mut original_order = envelope
        .payload
        .tasks
        .iter()
        .map(|task| task.runtime_input.task_id.clone())
        .collect::<Vec<_>>();
    let mut metadata = envelope
        .payload
        .tasks
        .iter()
        .map(|task| {
            (
                task.runtime_input.task_id.clone(),
                WorkerTaskMetadata {
                    depends_on: task.depends_on.clone(),
                },
            )
        })
        .collect::<HashMap<_, _>>();
    let mut templates = envelope
        .payload
        .tasks
        .iter()
        .cloned()
        .map(|task| (task.runtime_input.task_id.clone(), task))
        .collect::<HashMap<_, _>>();
    validate_task_graph_and_review_topology(&original_order, &templates, &metadata)?;

    let mut pending = std::mem::take(&mut envelope.payload.tasks);
    let mut completed: Vec<AgentTaskRunResult> = Vec::new();
    let mut route_attempts: HashMap<String, u32> = HashMap::new();
    let mut task_attempts = original_order
        .iter()
        .map(|task_id| (task_id.clone(), 0_u32))
        .collect::<HashMap<_, _>>();
    let mut failure_routes: Vec<RouteAgentFailureResult> = Vec::new();
    let mut replans: Vec<ReplanProjectResult> = Vec::new();
    let mut replan_attempt = 0_u32;

    while !pending.is_empty() {
        let completed_ids = completed
            .iter()
            .map(|result| result.task_id.as_str())
            .collect::<HashSet<_>>();

        let ready_index = pending.iter().position(|task| {
            task.depends_on
                .iter()
                .all(|dependency| completed_ids.contains(dependency.as_str()))
        });

        let Some(ready_index) = ready_index else {
            return Err(
                "Agent task graph has no runnable task; a dependency cycle or invalid recovery state is likely"
                    .to_string(),
            );
        };

        let mut task = pending.remove(ready_index);
        task.runtime_input.dependencies = task
            .depends_on
            .iter()
            .filter_map(|dependency| {
                completed
                    .iter()
                    .find(|result| &result.task_id == dependency)
                    .map(dependency_artifact)
            })
            .collect();

        let task_id = task.runtime_input.task_id.clone();
        *task_attempts.entry(task_id.clone()).or_insert(0) += 1;
        let result = tauri::async_runtime::block_on(dispatch_agent_task(task.runtime_input))
            .map_err(|error| format!("Agent task {task_id} runtime failed: {error}"))?;

        if result.report.status == "blocked" {
            let attempt = route_attempts.entry(task_id.clone()).or_insert(0);
            *attempt += 1;
            let route_result = route_blocked_agent(
                &result,
                &templates,
                &metadata,
                &repository_full_name,
                &workspace_path,
                *attempt,
            )?;
            let route = route_result.decision.route.clone();
            let recommended_action = route_result.decision.recommended_action.clone();
            let owner_task_id = route_result.decision.owner_task_id.clone();
            failure_routes.push(route_result);

            if route == "retry-owner" && *attempt < MAX_REMOTE_ROUTE_ATTEMPTS {
                let owner_task_id = owner_task_id
                    .ok_or_else(|| "retry-owner route did not provide ownerTaskId".to_string())?;
                requeue_owner_scope(
                    &owner_task_id,
                    &original_order,
                    &templates,
                    &metadata,
                    &mut pending,
                    &mut completed,
                )?;
                continue;
            }

            if route == "escalate-pm" {
                replan_attempt += 1;
                if replan_attempt > MAX_REMOTE_REPLAN_ATTEMPTS {
                    return Ok(blocked_output(
                        &envelope,
                        repository_full_name,
                        workspace_path,
                        Some(task_id.clone()),
                        format!(
                            "Remote PM replan limit reached after failure in {task_id}: {recommended_action}"
                        ),
                        completed,
                        Some(result),
                        failure_routes,
                        replans,
                    ));
                }

                let route_result = failure_routes
                    .last()
                    .ok_or_else(|| "missing Failure Router result before PM replan".to_string())?;
                match run_remote_replan(
                    route_result,
                    &result,
                    &original_order,
                    &templates,
                    &metadata,
                    &completed,
                    &task_attempts,
                    &repository_full_name,
                    &workspace_path,
                    replan_attempt,
                ) {
                    Ok(replan) => {
                        if let Err(error) = apply_remote_replan(
                            &replan,
                            &mut original_order,
                            &mut templates,
                            &mut metadata,
                            &mut pending,
                            &mut completed,
                            &mut task_attempts,
                        ) {
                            replans.push(replan);
                            return Ok(blocked_output(
                                &envelope,
                                repository_full_name,
                                workspace_path,
                                Some(task_id.clone()),
                                format!("Remote PM replan post-validation blocked: {error}"),
                                completed,
                                Some(result),
                                failure_routes,
                                replans,
                            ));
                        }
                        replans.push(replan);
                        continue;
                    }
                    Err(error) => {
                        return Ok(blocked_output(
                            &envelope,
                            repository_full_name,
                            workspace_path,
                            Some(task_id.clone()),
                            format!("Remote PM replan failed: {error}"),
                            completed,
                            Some(result),
                            failure_routes,
                            replans,
                        ));
                    }
                }
            }

            return Ok(blocked_output(
                &envelope,
                repository_full_name,
                workspace_path,
                Some(task_id.clone()),
                format!(
                    "Remote Failure Router selected {route} for {task_id}: {recommended_action}"
                ),
                completed,
                Some(result),
                failure_routes,
                replans,
            ));
        }

        completed.retain(|existing| existing.task_id != result.task_id);
        completed.push(result);
    }

    let merged_pull_request_numbers = match integrate_remote_pull_requests(
        &repository_full_name,
        &metadata,
        &completed,
    ) {
        Ok(numbers) => numbers,
        Err(error) => {
            return Ok(blocked_output(
                &envelope,
                repository_full_name,
                workspace_path,
                None,
                error,
                completed,
                None,
                failure_routes,
                replans,
            ));
        }
    };

    Ok(WorkerOutput {
        protocol_version: 1,
        job_id: envelope.job_id,
        project_id: envelope.project_id,
        status: "completed".to_string(),
        message: format!(
            "All Agent tasks completed, recovered blockers when safe, applied {} PM replan(s), and integrated {} PR(s) into develop",
            replans.len(),
            merged_pull_request_numbers.len()
        ),
        repository_full_name,
        workspace_path,
        blocked_task_id: None,
        task_results: completed,
        failure_routes,
        replans,
        merged_pull_request_numbers,
    })
}

fn main() {
    let result = (|| -> Result<(), String> {
        let (input_path, output_path) = parse_args()?;
        let input = fs::read_to_string(&input_path)
            .map_err(|error| format!("worker input read failed: {error}"))?;
        let envelope: WorkerEnvelope = serde_json::from_str(&input)
            .map_err(|error| format!("worker input JSON parse failed: {error}"))?;
        let output = run_project(envelope)?;
        write_output(&output_path, &output)
    })();

    if let Err(error) = result {
        eprintln!("Luna worker failed: {error}");
        std::process::exit(1);
    }
}
