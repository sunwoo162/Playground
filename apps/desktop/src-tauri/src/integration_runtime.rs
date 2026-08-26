use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::{Command, Output};

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
            "number,state,isDraft,baseRefName,headRefName,url,mergeable,reviewDecision,statusCheckRollup".to_string(),
        ],
    )?;

    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("PR #{number} JSON 파싱 실패: {error}"))
}

fn verify_pull_request_gate(pr: &Value, expected_number: u64) -> Result<(String, String), String> {
    let number = pr.get("number").and_then(Value::as_u64).unwrap_or(0);
    if number != expected_number {
        return Err(format!("PR 번호 검증 실패: expected={expected_number}, actual={number}"));
    }

    if pr.get("state").and_then(Value::as_str) != Some("OPEN") {
        return Err(format!("PR #{number}가 open 상태가 아닙니다."));
    }
    if pr.get("isDraft").and_then(Value::as_bool).unwrap_or(false) {
        return Err(format!("PR #{number}는 아직 Draft입니다."));
    }
    if pr.get("baseRefName").and_then(Value::as_str) != Some("develop") {
        return Err(format!("PR #{number}의 base가 develop이 아닙니다."));
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
        let (url, head_branch) = verify_pull_request_gate(&pr, number)?;
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
