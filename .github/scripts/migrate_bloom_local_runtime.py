from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding="utf-8")


def replace_section(text: str, start: str, end: str, replacement: str) -> str:
    start_index = text.find(start)
    if start_index < 0:
        raise RuntimeError(f"missing start marker: {start}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f"missing end marker: {end}")
    return text[:start_index] + replacement + text[end_index:]


def replace_once(text: str, old: str, new: str) -> str:
    if old not in text:
        raise RuntimeError(f"missing replacement marker: {old[:100]}")
    return text.replace(old, new, 1)


def add_crate_import(text: str) -> str:
    if "use crate::local_inference_runtime;" not in text:
        text = "use crate::local_inference_runtime;\n" + text
    return text


# Register the shared local structured inference bridge.
lib = read("bloom-runtime/src/lib.rs")
if "mod local_inference_runtime;" not in lib:
    lib = replace_once(lib, "mod integration_runtime;\n", "mod integration_runtime;\nmod local_inference_runtime;\n")
write("bloom-runtime/src/lib.rs", lib)


# Project Intake: local structured inference only.
rel = "bloom-runtime/src/intake_runtime.rs"
text = add_crate_import(read(rel))
text = replace_section(text, "fn run_checked_with_stdin(", "fn validate_identifier(", "")
text = replace_section(text, "fn extract_codex_session_id(", "fn validate_analysis(", "")
text = text.replace(
    '    if !command_succeeds("codex", &["--version"]) {\n        return Err("Codex CLI가 설치되어 있지 않습니다.".to_string());\n    }\n    if !codex_chatgpt_authenticated() {\n        return Err("Bloom Project Intake는 ChatGPT 로그인 상태의 Codex가 필요합니다.".to_string());\n    }\n',
    "",
)
start = "    let prompt = intake_prompt(&organization, &intake_id, &request);"
end = "    Ok(AnalyzeProjectIntakeResult {"
replacement = '''    let prompt = intake_prompt(&organization, &intake_id, &request);
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

'''
text = replace_section(text, start, end, replacement)
text = replace_once(text, "        session_id: extract_codex_session_id(&events),", "        session_id: inference.session_id,") if "extract_codex_session_id(&events)" in text else text
text = text.replace("Codex", "Local Agent").replace("codex", "local_inference")
write(rel, text)


# Failure Router: local structured inference only.
rel = "bloom-runtime/src/failure_router_runtime.rs"
text = add_crate_import(read(rel))
text = replace_section(text, "fn output_detail(", "fn validate_segment(", "")
text = replace_section(text, "fn extract_session_id(", "fn validate_decision(", "")
start = "    let prompt = router_prompt(&input);"
end = "    Ok(RouteAgentFailureResult {"
replacement = '''    let prompt = router_prompt(&input);
    let inference = local_inference_runtime::run_structured_json(
        "failure-router",
        &prompt,
        FAILURE_ROUTE_SCHEMA,
        &workspace,
    )?;
    fs::write(
        &output_path,
        serde_json::to_vec_pretty(&inference.output)
            .map_err(|error| format!("Failure Router serialization failed: {error}"))?,
    )
    .map_err(|error| format!("Failure Router output write failed: {error}"))?;
    fs::write(&events_path, &inference.events_jsonl)
        .map_err(|error| format!("Failure Router event write failed: {error}"))?;
    let decision: FailureRouteDecision = serde_json::from_value(inference.output)
        .map_err(|error| format!("Failure Router JSON parsing failed: {error}"))?;
    validate_decision(&input, &decision)?;

'''
text = replace_section(text, start, end, replacement)
if "session_id: extract_session_id(&events)," in text:
    text = text.replace("session_id: extract_session_id(&events),", "session_id: inference.session_id,", 1)
text = text.replace("Codex", "Local Agent").replace("codex", "local_inference")
write(rel, text)


# PM replan: remove auth dependency and use local structured inference.
rel = "bloom-runtime/src/replan_runtime.rs"
text = add_crate_import(read(rel))
if "fn codex_chatgpt_authenticated(" in text:
    text = replace_section(text, "fn codex_chatgpt_authenticated(", "fn validate_workspace(", "")
text = text.replace(
    '    if !codex_chatgpt_authenticated() {\n        return Err("PM replan은 ChatGPT 로그인 상태의 Codex가 필요합니다.".to_string());\n    }\n',
    "",
)
start = "    let prompt = prompt(&input)?;"
end = "    Ok(ReplanProjectResult {"
replacement = '''    let prompt = prompt(&input)?;
    let inference = local_inference_runtime::run_structured_json(
        "pm-replan",
        &prompt,
        REPLAN_SCHEMA,
        &workspace,
    )?;
    fs::write(
        &output_path,
        serde_json::to_vec_pretty(&inference.output)
            .map_err(|error| format!("PM replan result serialization failed: {error}"))?,
    )
    .map_err(|error| format!("PM replan result write failed: {error}"))?;
    fs::write(&events_path, &inference.events_jsonl)
        .map_err(|error| format!("PM replan event log write failed: {error}"))?;
    let proposal: ProjectReplanProposal = serde_json::from_value(inference.output)
        .map_err(|error| format!("PM replan result JSON parsing failed: {error}"))?;
    validate_proposal(&input, &proposal)?;

'''
text = replace_section(text, start, end, replacement)
if "session_id: extract_session_id(&events)," in text:
    text = text.replace("session_id: extract_session_id(&events),", "session_id: inference.session_id,", 1)
text = text.replace("PM Codex", "PM Local Agent").replace("Codex", "Local Agent").replace("codex", "local_inference")
write(rel, text)


# Retrospectives and Team Evolution: local structured inference.
rel = "bloom-runtime/src/retrospective_runtime.rs"
text = add_crate_import(read(rel))
if "fn codex_chatgpt_authenticated(" in text:
    text = replace_section(text, "fn codex_chatgpt_authenticated(", "fn format_lines(", "")
text = text.replace(
    '    if !codex_chatgpt_authenticated() {\n        return Err("ChatGPT 로그인 상태의 Codex가 필요합니다.".to_string());\n    }\n',
    "",
)
anchor = text.find("fn run_agent_retrospective(")
start_i = text.find("    let args = vec![", anchor)
end_i = text.find("    Ok(AgentRetrospectiveResult {", start_i)
if start_i < 0 or end_i < 0:
    raise RuntimeError("retrospective execution block markers missing")
agent_local = '''    let inference = local_inference_runtime::run_structured_json(
        "agent-retrospective",
        &prompt,
        AGENT_RETROSPECTIVE_SCHEMA,
        workspace,
    )?;
    fs::write(
        &output_path,
        serde_json::to_vec_pretty(&inference.output)
            .map_err(|error| format!("Agent retrospective serialization failed: {error}"))?,
    )
    .map_err(|error| format!("Agent retrospective output write failed: {error}"))?;
    fs::write(&events_path, &inference.events_jsonl)
        .map_err(|error| format!("Agent retrospective event write failed: {error}"))?;
    let report: AgentRetrospectiveReport = serde_json::from_value(inference.output)
        .map_err(|error| format!("Agent retrospective JSON parsing failed: {error}"))?;

'''
text = text[:start_i] + agent_local + text[end_i:]
anchor = text.find("fn run_team_evolution(")
start_i = text.find("    let args = vec![", anchor)
end_i = text.find("    Ok((", start_i)
if start_i < 0 or end_i < 0:
    raise RuntimeError("team evolution execution block markers missing")
team_local = '''    let inference = local_inference_runtime::run_structured_json(
        "team-evolution",
        &prompt,
        TEAM_EVOLUTION_SCHEMA,
        workspace,
    )?;
    fs::write(
        &output_path,
        serde_json::to_vec_pretty(&inference.output)
            .map_err(|error| format!("Team Evolution serialization failed: {error}"))?,
    )
    .map_err(|error| format!("Team Evolution output write failed: {error}"))?;
    fs::write(&events_path, &inference.events_jsonl)
        .map_err(|error| format!("Team Evolution event write failed: {error}"))?;
    let proposal: TeamEvolutionProposal = serde_json::from_value(inference.output)
        .map_err(|error| format!("Team Evolution JSON parsing failed: {error}"))?;

'''
text = text[:start_i] + team_local + text[end_i:]
text = text.replace("Codex", "Local Agent").replace("codex", "local_inference")
write(rel, text)


# Market Discovery used Codex web search. Fail closed instead of fabricating sources.
rel = "bloom-runtime/src/market_discovery_runtime.rs"
text = read(rel)
text = replace_section(text, "fn run_checked_with_stdin(", "fn validate_identifier(", "")
if "fn extract_codex_session_id(" in text:
    text = replace_section(text, "fn extract_codex_session_id(", "fn valid_http_url(", "")
if "fn run_codex_stage(" in text:
    text = replace_section(text, "fn run_codex_stage(", "fn run_market_discovery_blocking(", "")
start = "fn run_market_discovery_blocking("
end = "#[tauri::command]\npub async fn run_market_discovery("
replacement = '''fn run_market_discovery_blocking(
    organization: String,
    workspace_root: String,
    discovery_id: String,
    topic: String,
) -> Result<MarketDiscoveryResult, String> {
    validate_identifier(organization.trim(), "Organization")?;
    validate_identifier(discovery_id.trim(), "Discovery ID")?;
    if workspace_root.trim().is_empty() {
        return Err("Workspace root를 먼저 설정해 주세요.".to_string());
    }
    if topic.trim().is_empty() {
        return Err("시장 탐색 주제가 비어 있습니다.".to_string());
    }
    Err(
        "Local-only Bloom Runtime does not perform live web market research. Use ChatGPT to review current public evidence, then provide the reviewed product direction to Luna."
            .to_string(),
    )
}

'''
text = replace_section(text, start, end, replacement)
text = text.replace("Use Codex web search", "Do not fabricate live web evidence in the local runtime")
text = text.replace("Codex", "Local Agent").replace("codex", "local_inference")
write(rel, text)


# PM planning and preflight: local runtime contract.
rel = "bloom-runtime/src/project_runtime.rs"
text = add_crate_import(read(rel))
text = text.replace("PmCodexRunResult", "PmLocalRunResult").replace("run_pm_codex", "run_pm_local")
old_fields = '''    codex_available: bool,
    codex_authenticated: bool,
    codex_chatgpt_auth: bool,
    codex_auth_mode: String,
'''
new_fields = '''    local_inference_available: bool,
    local_inference_mode: String,
'''
if old_fields not in text:
    raise RuntimeError("project preflight fields marker missing")
text = text.replace(old_fields, new_fields, 1)
if "fn codex_auth_status(" in text:
    text = replace_section(text, "fn codex_auth_status(", "#[tauri::command]\npub fn project_runtime_preflight(", "")
start = "#[tauri::command]\npub fn project_runtime_preflight("
end = "fn bootstrap_project_repository_inner("
preflight = '''#[tauri::command]
pub fn project_runtime_preflight(organization: String) -> ProjectRuntimePreflight {
    let organization = organization.trim().to_string();
    let git_available = command_succeeds("git", &["--version"]);
    let gh_available = command_succeeds("gh", &["--version"]);
    let gh_authenticated = gh_available
        && command_succeeds("gh", &["auth", "status", "--hostname", "github.com"]);
    let organization_accessible = if gh_authenticated && !organization.is_empty() {
        run_command(
            "gh",
            &["api".to_string(), format!("users/{organization}"), "--silent".to_string()],
        )
        .map(|output| output.status.success())
        .unwrap_or(false)
    } else {
        false
    };
    let local_inference_available = local_inference_runtime::local_agent_runner_path().is_ok();
    let message = if !local_inference_available {
        "Bloom Local Agent runner가 준비되지 않았습니다.".to_string()
    } else if git_available && gh_available && gh_authenticated && organization_accessible {
        "Git, GitHub CLI, Bloom Local Agent와 GitHub owner 접근이 준비되었습니다.".to_string()
    } else {
        "누락된 로컬 Runtime 조건을 확인해 주세요.".to_string()
    };

    ProjectRuntimePreflight {
        organization,
        git_available,
        gh_available,
        gh_authenticated,
        local_inference_available,
        local_inference_mode: if local_inference_available { "local" } else { "unavailable" }.to_string(),
        organization_accessible,
        message,
    }
}

'''
text = replace_section(text, start, end, preflight)
text = text.replace("PM Codex Agent", "PM Local Agent")
if "fn extract_codex_session_id(" in text:
    text = replace_section(text, "fn extract_codex_session_id(", "fn run_pm_local(", "")
start = "fn run_pm_local("
end = "#[tauri::command]\npub async fn plan_project_runtime("
run_pm = '''fn run_pm_local(
    organization: &str,
    workspace_root: &str,
    project_id: &str,
    team_id: &str,
    team_name: &str,
    request: &str,
) -> Result<PmLocalRunResult, String> {
    validate_github_name(organization, "Organization")?;
    validate_github_name(project_id, "Project ID")?;
    if request.trim().is_empty() {
        return Err("프로젝트 요구사항이 비어 있습니다.".to_string());
    }
    if workspace_root.trim().is_empty() {
        return Err("Workspace root를 먼저 설정해 주세요.".to_string());
    }

    let planning_dir = PathBuf::from(workspace_root)
        .join(".luna-runtime")
        .join("projects")
        .join(project_id)
        .join("pm");
    fs::create_dir_all(&planning_dir)
        .map_err(|error| format!("PM planning directory 생성 실패: {error}"))?;
    let schema_path = planning_dir.join("pm-plan.schema.json");
    let output_path = planning_dir.join("pm-plan.json");
    let events_path = planning_dir.join("pm-events.jsonl");
    fs::write(&schema_path, PM_PLAN_SCHEMA)
        .map_err(|error| format!("PM output schema 저장 실패: {error}"))?;

    let prompt = pm_prompt(organization, project_id, team_id, team_name, request.trim());
    let inference = local_inference_runtime::run_structured_json(
        "pm-plan",
        &prompt,
        PM_PLAN_SCHEMA,
        &planning_dir,
    )?;
    fs::write(
        &output_path,
        serde_json::to_vec_pretty(&inference.output)
            .map_err(|error| format!("PM plan serialization failed: {error}"))?,
    )
    .map_err(|error| format!("PM plan output write failed: {error}"))?;
    fs::write(&events_path, &inference.events_jsonl)
        .map_err(|error| format!("PM plan event log write failed: {error}"))?;
    let plan: PmProjectPlan = serde_json::from_value(inference.output)
        .map_err(|error| format!("PM plan JSON parsing failed: {error}"))?;
    validate_project_plan(&plan)?;

    Ok(PmLocalRunResult {
        plan,
        session_id: inference.session_id,
        events_path: events_path.to_string_lossy().to_string(),
        output_path: output_path.to_string_lossy().to_string(),
    })
}

'''
text = replace_section(text, start, end, run_pm)
text = text.replace("if !preflight.codex_chatgpt_auth {", "if !preflight.local_inference_available {")
text = text.replace("Codex", "Local Agent").replace("codex", "local_inference")
write(rel, text)


# Main implementation agents: replace app-server protocol with local runner process.
rel = "bloom-runtime/src/agent_runtime.rs"
text = read(rel)
if "MAX_LOCAL_AGENT_OUTPUT_BYTES" not in text:
    text = replace_once(
        text,
        "const MAX_AGENT_MESSAGE_DELTA_BYTES: usize = 512 * 1024;\n",
        "const MAX_AGENT_MESSAGE_DELTA_BYTES: usize = 512 * 1024;\nconst MAX_LOCAL_AGENT_OUTPUT_BYTES: usize = 4 * 1024 * 1024;\n",
    )
start = "fn append_event("
end = "fn is_runtime_owned_publication_blocker("
local_runner = '''fn run_local_agent(
    input: &AgentTaskRuntimeInput,
    worktree: &Path,
    branch: Option<&str>,
) -> Result<(String, String, String, AgentTaskReport, String, String), String> {
    let workspace = PathBuf::from(input.workspace_path.trim());
    let workspace_root = workspace
        .parent()
        .ok_or_else(|| "workspace 상위 경로를 확인할 수 없습니다.".to_string())?;
    let runtime_dir = workspace_root
        .join(".luna-runtime")
        .join("projects")
        .join(&input.project_id)
        .join("agents")
        .join(&input.agent_id)
        .join(&input.task_id);
    fs::create_dir_all(&runtime_dir)
        .map_err(|error| format!("Agent runtime directory 생성 실패: {error}"))?;
    let events_path = runtime_dir.join("local-agent-events.jsonl");
    let stderr_path = runtime_dir.join("local-agent.stderr.log");
    let runner = std::env::var("BLOOM_LOCAL_AGENT_RUNNER_PATH")
        .map_err(|_| "BLOOM_LOCAL_AGENT_RUNNER_PATH is required.".to_string())?;
    if !Path::new(runner.trim()).is_file() {
        return Err(format!("Bloom Local Agent runner를 찾을 수 없습니다: {runner}"));
    }

    let tool_state_root = std::env::temp_dir()
        .join("luna-agent-tools")
        .join(&input.project_id)
        .join(&input.task_id);
    let _tool_state_guard = AgentToolStateGuard::prepare(tool_state_root.clone())?;
    let pnpm_home = tool_state_root.join("pnpm-home");
    let xdg_data_home = tool_state_root.join("xdg-data");
    let xdg_cache_home = tool_state_root.join("xdg-cache");
    let xdg_state_home = tool_state_root.join("xdg-state");
    let npm_cache = tool_state_root.join("npm-cache");
    let corepack_home = tool_state_root.join("corepack");
    for directory in [&pnpm_home, &xdg_data_home, &xdg_cache_home, &xdg_state_home, &npm_cache, &corepack_home] {
        fs::create_dir_all(directory)
            .map_err(|error| format!("Agent tool state directory 생성 실패: {error}"))?;
    }

    let mut child = Command::new("node")
        .arg(runner.trim())
        .current_dir(worktree)
        .env("PNPM_HOME", &pnpm_home)
        .env("XDG_DATA_HOME", &xdg_data_home)
        .env("XDG_CACHE_HOME", &xdg_cache_home)
        .env("XDG_STATE_HOME", &xdg_state_home)
        .env("npm_config_cache", &npm_cache)
        .env("COREPACK_HOME", &corepack_home)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Bloom Local Agent runner 실행 실패: {error}"))?;
    let mut stdin = child.stdin.take().ok_or_else(|| "Local Agent stdin을 열 수 없습니다.".to_string())?;
    serde_json::to_writer(
        &mut stdin,
        &json!({
            "mode": "agent",
            "projectId": input.project_id,
            "taskId": input.task_id,
            "worktree": worktree.to_string_lossy(),
            "prompt": agent_prompt(input, branch),
        }),
    )
    .map_err(|error| format!("Local Agent 요청 직렬화 실패: {error}"))?;
    stdin.write_all(b"\n").and_then(|_| stdin.flush())
        .map_err(|error| format!("Local Agent 요청 전송 실패: {error}"))?;
    drop(stdin);

    let output = child.wait_with_output()
        .map_err(|error| format!("Local Agent 실행 결과 확인 실패: {error}"))?;
    fs::write(&stderr_path, &output.stderr)
        .map_err(|error| format!("Local Agent stderr 저장 실패: {error}"))?;
    if output.stdout.len() > MAX_LOCAL_AGENT_OUTPUT_BYTES || output.stderr.len() > MAX_LOCAL_AGENT_OUTPUT_BYTES {
        return Err(format!("Local Agent output exceeded the safe limit. limit={MAX_LOCAL_AGENT_OUTPUT_BYTES}"));
    }
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() { "Local Agent runner failed.".to_string() } else { format!("Local Agent runner failed: {detail}") });
    }
    let result: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Local Agent result JSON parsing failed: {error}"))?;
    let session_id = result.get("sessionId").and_then(Value::as_str)
        .ok_or_else(|| "Local Agent sessionId가 없습니다.".to_string())?.to_string();
    let turn_id = result.get("turnId").and_then(Value::as_str)
        .ok_or_else(|| "Local Agent turnId가 없습니다.".to_string())?.to_string();
    let report: AgentTaskReport = serde_json::from_value(
        result.get("report").cloned().ok_or_else(|| "Local Agent report가 없습니다.".to_string())?
    ).map_err(|error| format!("Local Agent report JSON parsing failed: {error}"))?;
    if !matches!(report.status.as_str(), "completed" | "blocked") {
        return Err(format!("Local Agent report status가 잘못되었습니다: {}", report.status));
    }
    let events = result.get("events").and_then(Value::as_array)
        .map(|items| items.iter().map(Value::to_string).collect::<Vec<_>>().join("\n"))
        .unwrap_or_default();
    fs::write(&events_path, events)
        .map_err(|error| format!("Local Agent event log 저장 실패: {error}"))?;
    Ok((
        session_id.clone(),
        session_id,
        turn_id,
        report,
        events_path.to_string_lossy().to_string(),
        stderr_path.to_string_lossy().to_string(),
    ))
}

'''
text = replace_section(text, start, end, local_runner)
text = text.replace("run_app_server_agent(&input, &worktree, branch.as_deref())?", "run_local_agent(&input, &worktree, branch.as_deref())?")
text = text.replace(
    "Git metadata is protected inside the Codex sandbox, so do not run Git write commands",
    "Git metadata is owned by Luna Runtime and the local model tool boundary forbids Git writes, so do not run Git write commands",
)
text = text.replace(
    "Before writing a review comment, search the PR for a top-level comment prefixed with your Luna Agent ID; if one exists, reuse or update your existing prefixed top-level comment instead of creating a duplicate. When reviewing a PR, leave a concise top-level PR comment prefixed with your Luna Agent ID and an evidence-based verdict. Do not merge, close, label, retarget, or otherwise mutate pull requests; the review comment is the only GitHub write this role owns.",
    "Do not create review comments or otherwise mutate GitHub from the local model tool boundary. Record every PR you actually inspected in reviewedPullRequests with an evidence-based verdict in the report.",
)
text = text.replace("Codex", "Local Agent").replace("codex", "local_agent")
write(rel, text)


# Worker: evaluator local-only and publish Local Agent runner path to the Rust bridge.
rel = "bloom-worker/run.js"
text = read(rel)
text = text.replace('const { createCodexSeniorEvaluatorRunner } = require("../.tmp/bloom-worker/bloomBouquetSeniorEvaluator.js");\n', "")
text = text.replace('const EVALUATOR_RUNTIMES = new Set(["codex", "local"]);', 'const EVALUATOR_RUNTIMES = new Set(["local"]);')
text = text.replace('const normalized = String(value || "codex").trim().toLowerCase() || "codex";', 'const normalized = String(value || "local").trim().toLowerCase() || "local";')
text = text.replace('throw new Error(`BLOOM_EVALUATOR_RUNTIME은 codex 또는 local이어야 합니다: ${normalized}`);', 'throw new Error(`BLOOM_EVALUATOR_RUNTIME은 local이어야 합니다: ${normalized}`);')
text = text.replace(
    '  const runner = evaluatorRuntime === "local"\n    ? createLocalSeniorEvaluatorRunner()\n    : createCodexSeniorEvaluatorRunner({ cwd: path.resolve(__dirname, "..") });',
    '  const runner = createLocalSeniorEvaluatorRunner();',
)
marker = 'const EVALUATOR_RUNTIMES = new Set(["local"]);\n'
if "BLOOM_LOCAL_AGENT_RUNNER_PATH" not in text:
    text = text.replace(
        marker,
        marker + '\nif (!process.env.BLOOM_LOCAL_AGENT_RUNNER_PATH) {\n  process.env.BLOOM_LOCAL_AGENT_RUNNER_PATH = path.resolve(__dirname, "../.tmp/bloom-worker/bloomLocalAgentRuntime.js");\n}\n',
        1,
    )
write(rel, text)


# Remove the dead Codex evaluator transport; keep shared prompt/schema/parser contracts.
rel = "bloom-runtime/ts/bloomBouquetSeniorEvaluator.ts"
text = read(rel)
text = text.replace('import { spawn } from "node:child_process";\nimport { createInterface } from "node:readline";\n\n', "")
text = text.replace('const MAX_JSONL_LINE_BYTES = 10 * 1024 * 1024;\nconst DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;\n\n', "")
if "export type CodexEvaluatorRequest" in text:
    text = replace_section(text, "export type CodexEvaluatorRequest", "function evidenceAvailability(", "")
if "function createDefaultCodexTransport(" in text:
    text = text[:text.find("function createDefaultCodexTransport(")].rstrip() + "\n"
write(rel, text)


# Runtime TypeScript preflight contract.
rel = "bloom-runtime/ts/runtime.ts"
text = read(rel)
text = text.replace(
    '''  codexAvailable: boolean;\n  codexAuthenticated: boolean;\n  codexChatgptAuth: boolean;\n  codexAuthMode: "chatgpt" | "other" | "none";\n''',
    '''  localInferenceAvailable: boolean;\n  localInferenceMode: "local" | "unavailable";\n''',
)
write(rel, text)

for rel in [
    "bloom-runtime/ts/projectIntakeState.ts",
    "bloom-runtime/ts/replanState.ts",
    "bloom-runtime/ts/store.ts",
]:
    text = read(rel).replace("PM Codex", "PM Local Agent").replace("Codex", "Local Agent")
    write(rel, text)


# Compiler includes.
for rel in ["bloom-runtime/tsconfig.worker.json", "bloom-runtime/tsconfig.policy-tests.json"]:
    data = json.loads(read(rel))
    include = data.setdefault("include", [])
    for item in ["ts/bloomLocalAgentRuntime.ts"]:
        if item not in include:
            include.append(item)
    write(rel, json.dumps(data, ensure_ascii=False, indent=2) + "\n")


# Worker entrypoint policy now requires local-only evaluator behavior.
rel = "bloom-worker/run.policy-test.js"
text = read(rel)
text = text.replace('  assert.match(source, /createCodexSeniorEvaluatorRunner/);\n', '  assert.doesNotMatch(source, /createCodexSeniorEvaluatorRunner/);\n')
text = text.replace('  assert.match(source, /evaluatorRuntime === [\'\"]local[\'\"]/);\n', '  assert.match(source, /createLocalSeniorEvaluatorRunner\(\)/);\n')
write(rel, text)


# Senior evaluator policy tests no longer exercise a removed transport.
rel = "bloom-runtime/ts/bloomBouquetSeniorEvaluator.policy-test.ts"
text = read(rel)
text = text.replace("  createCodexSeniorEvaluatorRunner,\n", "")
text = text.replace("  type CodexEvaluatorRequest,\n", "")
text = text.replace("  type CodexEvaluatorTransport,\n", "")
if "async function testCodexRunnerUsesReadOnlySandbox()" in text:
    text = replace_section(text, "async function testCodexRunnerUsesReadOnlySandbox()", "async function main()", "")
text = text.replace("  await testCodexRunnerUsesReadOnlySandbox();\n", "")
write(rel, text)


active_files = [
    "bloom-worker/run.js",
    "bloom-runtime/src/agent_runtime.rs",
    "bloom-runtime/src/intake_runtime.rs",
    "bloom-runtime/src/failure_router_runtime.rs",
    "bloom-runtime/src/replan_runtime.rs",
    "bloom-runtime/src/retrospective_runtime.rs",
    "bloom-runtime/src/project_runtime.rs",
    "bloom-runtime/src/market_discovery_runtime.rs",
    "bloom-runtime/ts/bloomBouquetSeniorEvaluator.ts",
]
for rel in active_files:
    lowered = read(rel).lower()
    if 'command::new("codex")' in lowered or 'run_checked_with_stdin("codex"' in lowered or 'createcodexseniorevaluatorrunner' in lowered:
        raise RuntimeError(f"active Codex process path remains in {rel}")

print("Bloom local runtime migration applied")
