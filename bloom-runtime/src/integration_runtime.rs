use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    process::{Command, Output},
    thread,
    time::Duration,
};

const RELEASE_GATE_POLL_ATTEMPTS: usize = 120;
const RELEASE_GATE_POLL_INTERVAL: Duration = Duration::from_secs(5);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeProjectPullRequestsInput {
    pub repository_full_name: String,
    pub pull_request_numbers: Vec<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergedPullRequest {
    pub number: u64,
    pub url: String,
    pub head_branch: String,
    pub merge_commit_sha: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeProjectPullRequestsResult {
    pub repository_full_name: String,
    pub merged_pull_requests: Vec<MergedPullRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromoteProjectReleaseInput {
    pub repository_full_name: String,
    pub integration_branch: String,
    pub release_branch: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromoteProjectReleaseResult {
    pub repository_full_name: String,
    pub release_sha: String,
    pub release_pull_request_number: Option<u64>,
}

fn output_detail(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stderr.is_empty() { stderr } else { stdout }
}

fn run_checked(program: &str, args: &[String]) -> Result<Output, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("{program} 실행 실패: {error}"))?;

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

fn validate_repository(value: &str) -> Result<(), String> {
    let Some((owner, name)) = value.trim().split_once('/') else {
        return Err("Repository는 owner/name 형식이어야 합니다.".to_string());
    };
    let valid = |segment: &str| {
        !segment.is_empty()
            && segment.len() <= 100
            && segment
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    };

    if value.matches('/').count() != 1 || !valid(owner) || !valid(name) {
        return Err("Repository 이름 형식이 잘못되었습니다.".to_string());
    }
    Ok(())
}

fn validate_branch(value: &str, label: &str) -> Result<String, String> {
    let branch = value.trim();
    if branch.is_empty()
        || branch.len() > 100
        || !branch
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err(format!("{label} branch 이름 형식이 잘못되었습니다."));
    }
    Ok(branch.to_string())
}

fn inspect_pull_request(repository: &str, number: u64) -> Result<Value, String> {
    let output = run_checked(
        "gh",
        &[
            "pr".to_string(),
            "view".to_string(),
            number.to_string(),
            "--repo".to_string(),
            repository.to_string(),
            "--json".to_string(),
            "number,state,isDraft,baseRefName,headRefName,url,mergeable,reviewDecision,statusCheckRollup,mergeCommit".to_string(),
        ],
    )?;

    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("PR #{number} JSON 파싱 실패: {error}"))
}

fn pull_request_identity(
    pr: &Value,
    expected_number: u64,
    expected_base: &str,
) -> Result<(String, String), String> {
    let number = pr.get("number").and_then(Value::as_u64).unwrap_or(0);
    if number != expected_number {
        return Err(format!("PR 번호 검증 실패: expected={expected_number}, actual={number}"));
    }
    if pr.get("baseRefName").and_then(Value::as_str) != Some(expected_base) {
        return Err(format!("PR #{number}의 base가 {expected_base}이 아닙니다."));
    }

    let url = pr
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("PR #{number} URL을 확인할 수 없습니다."))?
        .to_string();
    let head_branch = pr
        .get("headRefName")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("PR #{number} head branch를 확인할 수 없습니다."))?
        .to_string();

    Ok((url, head_branch))
}

fn verify_pull_request_gate(
    pr: &Value,
    expected_number: u64,
    expected_base: &str,
) -> Result<(String, String), String> {
    let (url, head_branch) = pull_request_identity(pr, expected_number, expected_base)?;
    let number = expected_number;

    if pr.get("state").and_then(Value::as_str) != Some("OPEN") {
        return Err(format!("PR #{number}가 open 상태가 아닙니다."));
    }
    if pr.get("isDraft").and_then(Value::as_bool).unwrap_or(false) {
        return Err(format!("PR #{number}는 아직 Draft입니다."));
    }
    if pr.get("mergeable").and_then(Value::as_str) != Some("MERGEABLE") {
        return Err(format!("PR #{number}가 현재 mergeable 상태가 아닙니다."));
    }

    if pr.get("reviewDecision").and_then(Value::as_str) == Some("CHANGES_REQUESTED") {
        return Err(format!("PR #{number}에 아직 REQUEST_CHANGES가 남아 있습니다."));
    }

    if let Some(checks) = pr.get("statusCheckRollup").and_then(Value::as_array) {
        for check in checks {
            if let Some(status) = check.get("status").and_then(Value::as_str) {
                if status != "COMPLETED" {
                    let name = check.get("name").and_then(Value::as_str).unwrap_or("check");
                    return Err(format!("PR #{number} check `{name}`가 아직 {status} 상태입니다."));
                }
            }
            if let Some(conclusion) = check.get("conclusion").and_then(Value::as_str) {
                if !matches!(conclusion, "SUCCESS" | "NEUTRAL" | "SKIPPED") {
                    let name = check.get("name").and_then(Value::as_str).unwrap_or("check");
                    return Err(format!("PR #{number} check `{name}`가 {conclusion}로 종료되었습니다."));
                }
            }
            if let Some(state) = check.get("state").and_then(Value::as_str) {
                if state != "SUCCESS" {
                    let context = check.get("context").and_then(Value::as_str).unwrap_or("status");
                    return Err(format!("PR #{number} status `{context}`가 {state}입니다."));
                }
            }
        }
    }

    Ok((url, head_branch))
}

fn merged_pull_request_evidence(
    pr: &Value,
    expected_number: u64,
    expected_base: &str,
) -> Result<Option<MergedPullRequest>, String> {
    if pr.get("state").and_then(Value::as_str) != Some("MERGED") {
        return Ok(None);
    }
    let (url, head_branch) = pull_request_identity(pr, expected_number, expected_base)?;
    let merge_commit_sha = pr
        .get("mergeCommit")
        .and_then(|value| value.get("oid"))
        .and_then(Value::as_str)
        .map(str::to_string);

    Ok(Some(MergedPullRequest {
        number: expected_number,
        url,
        head_branch,
        merge_commit_sha,
    }))
}

fn merge_pull_request(repository: &str, number: u64) -> Result<Option<String>, String> {
    run_checked(
        "gh",
        &[
            "pr".to_string(),
            "merge".to_string(),
            number.to_string(),
            "--repo".to_string(),
            repository.to_string(),
            "--merge".to_string(),
        ],
    )?;

    let output = run_checked(
        "gh",
        &[
            "pr".to_string(),
            "view".to_string(),
            number.to_string(),
            "--repo".to_string(),
            repository.to_string(),
            "--json".to_string(),
            "state,mergeCommit".to_string(),
        ],
    )?;
    let merged: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("PR #{number} merge 결과 파싱 실패: {error}"))?;

    if merged.get("state").and_then(Value::as_str) != Some("MERGED") {
        return Err(format!("PR #{number} merge 후 상태가 MERGED가 아닙니다."));
    }

    Ok(merged
        .get("mergeCommit")
        .and_then(|value| value.get("oid"))
        .and_then(Value::as_str)
        .map(str::to_string))
}

fn branch_head_sha(repository: &str, branch: &str) -> Result<String, String> {
    let output = run_checked(
        "gh",
        &[
            "api".to_string(),
            format!("repos/{repository}/commits/{branch}"),
            "--jq".to_string(),
            ".sha".to_string(),
        ],
    )?;
    let sha = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if sha.len() != 40 || !sha.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err(format!("{branch} branch SHA를 확인할 수 없습니다."));
    }
    Ok(sha.to_lowercase())
}

fn integration_ahead_by(repository: &str, release_branch: &str, integration_branch: &str) -> Result<u64, String> {
    let output = run_checked(
        "gh",
        &[
            "api".to_string(),
            format!("repos/{repository}/compare/{release_branch}...{integration_branch}"),
            "--jq".to_string(),
            ".ahead_by".to_string(),
        ],
    )?;
    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    raw.parse::<u64>()
        .map_err(|error| format!("release compare ahead_by 파싱 실패: {error}"))
}

fn find_open_release_pull_request(
    repository: &str,
    release_branch: &str,
    integration_branch: &str,
) -> Result<Option<u64>, String> {
    let output = run_checked(
        "gh",
        &[
            "pr".to_string(),
            "list".to_string(),
            "--repo".to_string(),
            repository.to_string(),
            "--base".to_string(),
            release_branch.to_string(),
            "--head".to_string(),
            integration_branch.to_string(),
            "--state".to_string(),
            "open".to_string(),
            "--limit".to_string(),
            "5".to_string(),
            "--json".to_string(),
            "number".to_string(),
        ],
    )?;
    let values: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("release PR 목록 파싱 실패: {error}"))?;
    let items = values
        .as_array()
        .ok_or_else(|| "release PR 목록 응답이 배열이 아닙니다.".to_string())?;
    if items.len() > 1 {
        return Err("동일한 develop→release open PR이 둘 이상 존재합니다.".to_string());
    }
    Ok(items
        .first()
        .and_then(|item| item.get("number"))
        .and_then(Value::as_u64))
}

fn create_release_pull_request(
    repository: &str,
    release_branch: &str,
    integration_branch: &str,
) -> Result<u64, String> {
    run_checked(
        "gh",
        &[
            "pr".to_string(),
            "create".to_string(),
            "--repo".to_string(),
            repository.to_string(),
            "--base".to_string(),
            release_branch.to_string(),
            "--head".to_string(),
            integration_branch.to_string(),
            "--title".to_string(),
            "chore: promote Luna automatic release".to_string(),
            "--body".to_string(),
            "Automated release promotion after the Luna Agent integration gate passed.".to_string(),
        ],
    )?;
    find_open_release_pull_request(repository, release_branch, integration_branch)?
        .ok_or_else(|| "release PR 생성 후 번호를 확인할 수 없습니다.".to_string())
}

fn release_pull_request_ready(
    pr: &Value,
    expected_number: u64,
    release_branch: &str,
) -> Result<bool, String> {
    pull_request_identity(pr, expected_number, release_branch)?;
    if pr.get("state").and_then(Value::as_str) == Some("MERGED") {
        return Ok(true);
    }
    if pr.get("state").and_then(Value::as_str) != Some("OPEN") {
        return Err(format!("release PR #{expected_number}가 open 상태가 아닙니다."));
    }
    if pr.get("isDraft").and_then(Value::as_bool).unwrap_or(false) {
        return Err(format!("release PR #{expected_number}는 Draft일 수 없습니다."));
    }
    if pr.get("reviewDecision").and_then(Value::as_str) == Some("CHANGES_REQUESTED") {
        return Err(format!("release PR #{expected_number}에 REQUEST_CHANGES가 남아 있습니다."));
    }

    match pr.get("mergeable").and_then(Value::as_str) {
        Some("MERGEABLE") => {}
        Some("UNKNOWN") | None => return Ok(false),
        Some(value) => return Err(format!("release PR #{expected_number}가 mergeable하지 않습니다: {value}")),
    }

    if let Some(checks) = pr.get("statusCheckRollup").and_then(Value::as_array) {
        for check in checks {
            if let Some(status) = check.get("status").and_then(Value::as_str) {
                if status != "COMPLETED" {
                    return Ok(false);
                }
            }
            if let Some(conclusion) = check.get("conclusion").and_then(Value::as_str) {
                if !matches!(conclusion, "SUCCESS" | "NEUTRAL" | "SKIPPED") {
                    let name = check.get("name").and_then(Value::as_str).unwrap_or("check");
                    return Err(format!("release PR #{expected_number} check `{name}`가 {conclusion}로 종료되었습니다."));
                }
            }
            if let Some(state) = check.get("state").and_then(Value::as_str) {
                match state {
                    "SUCCESS" => {}
                    "PENDING" | "EXPECTED" => return Ok(false),
                    value => {
                        let context = check.get("context").and_then(Value::as_str).unwrap_or("status");
                        return Err(format!("release PR #{expected_number} status `{context}`가 {value}입니다."));
                    }
                }
            }
        }
    }

    Ok(true)
}

fn wait_for_release_gate(repository: &str, number: u64, release_branch: &str) -> Result<(), String> {
    for attempt in 0..RELEASE_GATE_POLL_ATTEMPTS {
        let pr = inspect_pull_request(repository, number)?;
        if release_pull_request_ready(&pr, number, release_branch)? {
            return Ok(());
        }
        if attempt + 1 < RELEASE_GATE_POLL_ATTEMPTS {
            thread::sleep(RELEASE_GATE_POLL_INTERVAL);
        }
    }
    Err(format!(
        "release PR #{number} checks가 제한 시간 안에 완료되지 않았습니다."
    ))
}

#[tauri::command]
pub fn merge_project_pull_requests(
    input: MergeProjectPullRequestsInput,
) -> Result<MergeProjectPullRequestsResult, String> {
    validate_repository(&input.repository_full_name)?;
    if input.pull_request_numbers.is_empty() {
        return Err("통합할 PR이 없습니다.".to_string());
    }

    let mut numbers = input.pull_request_numbers;
    numbers.sort_unstable();
    numbers.dedup();

    let mut merged_pull_requests = Vec::with_capacity(numbers.len());
    for number in numbers {
        let pr = inspect_pull_request(&input.repository_full_name, number)?;
        if let Some(recovered) = merged_pull_request_evidence(&pr, number, "develop")? {
            merged_pull_requests.push(recovered);
            continue;
        }

        let (url, head_branch) = verify_pull_request_gate(&pr, number, "develop")?;
        let merge_commit_sha = merge_pull_request(&input.repository_full_name, number)?;
        merged_pull_requests.push(MergedPullRequest {
            number,
            url,
            head_branch,
            merge_commit_sha,
        });
    }

    Ok(MergeProjectPullRequestsResult {
        repository_full_name: input.repository_full_name,
        merged_pull_requests,
    })
}

#[tauri::command]
pub fn promote_project_release(
    input: PromoteProjectReleaseInput,
) -> Result<PromoteProjectReleaseResult, String> {
    validate_repository(&input.repository_full_name)?;
    let integration_branch = validate_branch(&input.integration_branch, "integration")?;
    let release_branch = validate_branch(&input.release_branch, "release")?;
    if integration_branch == release_branch {
        return Err("integration branch와 release branch는 달라야 합니다.".to_string());
    }

    if integration_ahead_by(
        &input.repository_full_name,
        &release_branch,
        &integration_branch,
    )? == 0
    {
        return Ok(PromoteProjectReleaseResult {
            repository_full_name: input.repository_full_name.clone(),
            release_sha: branch_head_sha(&input.repository_full_name, &release_branch)?,
            release_pull_request_number: None,
        });
    }

    let release_pull_request_number = match find_open_release_pull_request(
        &input.repository_full_name,
        &release_branch,
        &integration_branch,
    )? {
        Some(number) => number,
        None => create_release_pull_request(
            &input.repository_full_name,
            &release_branch,
            &integration_branch,
        )?,
    };

    wait_for_release_gate(
        &input.repository_full_name,
        release_pull_request_number,
        &release_branch,
    )?;
    let pr = inspect_pull_request(&input.repository_full_name, release_pull_request_number)?;
    if pr.get("state").and_then(Value::as_str) != Some("MERGED") {
        merge_pull_request(&input.repository_full_name, release_pull_request_number)?;
    }

    Ok(PromoteProjectReleaseResult {
        repository_full_name: input.repository_full_name.clone(),
        release_sha: branch_head_sha(&input.repository_full_name, &release_branch)?,
        release_pull_request_number: Some(release_pull_request_number),
    })
}
