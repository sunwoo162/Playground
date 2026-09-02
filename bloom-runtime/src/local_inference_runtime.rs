use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

const MAX_LOCAL_INFERENCE_OUTPUT_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalStructuredProcessResult {
    session_id: String,
    output: Value,
    #[serde(default)]
    events: Vec<Value>,
}

#[derive(Debug)]
pub struct LocalStructuredInferenceResult {
    pub session_id: Option<String>,
    pub output: Value,
    pub events_jsonl: String,
}

pub fn local_agent_runner_path() -> Result<PathBuf, String> {
    let raw = std::env::var("BLOOM_LOCAL_AGENT_RUNNER_PATH")
        .map_err(|_| "BLOOM_LOCAL_AGENT_RUNNER_PATH is required for local inference.".to_string())?;
    let path = PathBuf::from(raw.trim());
    if !path.is_file() {
        return Err(format!(
            "Local inference runner was not found: {}",
            path.to_string_lossy()
        ));
    }
    Ok(path)
}

pub fn run_structured_json(
    title: &str,
    prompt: &str,
    output_schema: &str,
    cwd: &Path,
) -> Result<LocalStructuredInferenceResult, String> {
    if title.trim().is_empty() || prompt.trim().is_empty() {
        return Err("Local structured inference title/prompt must not be empty.".to_string());
    }
    if !cwd.is_dir() {
        return Err(format!(
            "Local structured inference cwd is invalid: {}",
            cwd.to_string_lossy()
        ));
    }
    let schema: Value = serde_json::from_str(output_schema)
        .map_err(|error| format!("Local inference schema JSON parsing failed: {error}"))?;
    let runner = local_agent_runner_path()?;
    let mut child = Command::new("node")
        .arg(&runner)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Local inference runner execution failed: {error}"))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Local inference runner stdin is unavailable.".to_string())?;
    serde_json::to_writer(
        &mut stdin,
        &json!({
            "mode": "structured",
            "title": title,
            "prompt": prompt,
            "outputSchema": schema,
        }),
    )
    .map_err(|error| format!("Local inference request serialization failed: {error}"))?;
    stdin
        .flush()
        .map_err(|error| format!("Local inference request flush failed: {error}"))?;
    drop(stdin);

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Local inference process wait failed: {error}"))?;
    if output.stdout.len() > MAX_LOCAL_INFERENCE_OUTPUT_BYTES
        || output.stderr.len() > MAX_LOCAL_INFERENCE_OUTPUT_BYTES
    {
        return Err("Local inference process output exceeded the 4MB safety limit.".to_string());
    }
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Local inference runner failed with status {}", output.status)
        } else {
            format!("Local inference runner failed: {stderr}")
        });
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| format!("Local inference stdout was not UTF-8: {error}"))?;
    let result: LocalStructuredProcessResult = serde_json::from_str(stdout.trim())
        .map_err(|error| format!("Local inference result JSON parsing failed: {error}"))?;
    let events_jsonl = result
        .events
        .iter()
        .map(Value::to_string)
        .collect::<Vec<_>>()
        .join("\n");
    Ok(LocalStructuredInferenceResult {
        session_id: Some(result.session_id),
        output: result.output,
        events_jsonl,
    })
}
