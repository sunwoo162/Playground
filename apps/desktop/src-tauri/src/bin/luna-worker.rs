use luna_lib::{
    agent_runtime::{
        dispatch_agent_task, AgentTaskRunResult, AgentTaskRuntimeInput, DependencyArtifact,
    },
    project_runtime::bootstrap_project_repository,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    env,
    fs,
    path::{Path, PathBuf},
};

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerTask {
    #[serde(default)]
    depends_on: Vec<String>,
    runtime_input: AgentTaskRuntimeInput,
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

fn run_project(mut envelope: WorkerEnvelope) -> Result<WorkerOutput, String> {
    validate_envelope(&envelope)?;

    let organization = envelope.payload.organization.trim().to_string();
    let repository_name = envelope.payload.repository_name.trim().to_string();
    let (repository_full_name, workspace_path) =
        bootstrap_remote_workspace(&organization, &repository_name)?;

    let mut pending = std::mem::take(&mut envelope.payload.tasks);
    for task in &mut pending {
        task.runtime_input.organization = organization.clone();
        task.runtime_input.repository_full_name = repository_full_name.clone();
        task.runtime_input.workspace_path = workspace_path.clone();
        task.runtime_input.dependencies = Vec::new();
    }

    let mut completed: Vec<AgentTaskRunResult> = Vec::new();

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
                "Agent task graph has no runnable task; a dependency cycle is likely".to_string(),
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
        let result = tauri::async_runtime::block_on(dispatch_agent_task(task.runtime_input))
            .map_err(|error| format!("Agent task {task_id} runtime failed: {error}"))?;
        let blocked = result.report.status == "blocked";
        completed.push(result);

        if blocked {
            return Ok(WorkerOutput {
                protocol_version: 1,
                job_id: envelope.job_id,
                project_id: envelope.project_id,
                status: "blocked".to_string(),
                message: format!(
                    "Agent task {task_id} reported a blocker; remaining tasks were not started"
                ),
                repository_full_name,
                workspace_path,
                blocked_task_id: Some(task_id),
                task_results: completed,
            });
        }
    }

    Ok(WorkerOutput {
        protocol_version: 1,
        job_id: envelope.job_id,
        project_id: envelope.project_id,
        status: "completed".to_string(),
        message: "All dependency-ready Agent tasks completed on the remote worker".to_string(),
        repository_full_name,
        workspace_path,
        blocked_task_id: None,
        task_results: completed,
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
