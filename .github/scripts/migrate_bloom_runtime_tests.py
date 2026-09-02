from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

output_guard = r'''#[cfg(unix)]
mod runtime_under_test {
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/agent_runtime.rs"));

    pub(super) fn exercise_runaway_output_guard() -> Result<(), String> {
        use std::{env, time::{SystemTime, UNIX_EPOCH}};

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_nanos();
        let project_id = format!("builder-output-guard-{stamp}");
        let root = env::temp_dir().join(format!("luna-output-guard-{}-{stamp}", std::process::id()));
        let workspace = root.join("workspace");
        let worktree = root.join("worktree");
        std::fs::create_dir_all(&workspace).map_err(|error| error.to_string())?;
        std::fs::create_dir_all(&worktree).map_err(|error| error.to_string())?;

        let fake_runner = root.join("fake-local-agent.js");
        std::fs::write(
            &fake_runner,
            r#"const chunks=[];process.stdin.on('data',c=>chunks.push(c));process.stdin.on('end',()=>{process.stdout.write('x'.repeat(5*1024*1024));});"#,
        )
        .map_err(|error| error.to_string())?;

        let original_runner = env::var_os("BLOOM_LOCAL_AGENT_RUNNER_PATH");
        env::set_var("BLOOM_LOCAL_AGENT_RUNNER_PATH", &fake_runner);
        let input = AgentTaskRuntimeInput {
            organization: "sunwoo162".to_string(),
            project_id,
            team_id: "rose".to_string(),
            team_name: "Rose".to_string(),
            role: "idea".to_string(),
            agent_id: "rose:idea".to_string(),
            task_id: "PB-001".to_string(),
            task_slug: "idea".to_string(),
            title: "Output guard regression".to_string(),
            summary: "Reject runaway agent output".to_string(),
            acceptance_criteria: vec!["Reject oversized local Agent output".to_string()],
            user_request: "Test runaway output".to_string(),
            product_summary: "Test product".to_string(),
            architecture_summary: "Test architecture".to_string(),
            repository_full_name: "sunwoo162/test-repository".to_string(),
            workspace_path: workspace.to_string_lossy().to_string(),
            dependencies: vec![],
        };
        let result = run_local_agent(&input, &worktree, None);

        if let Some(value) = original_runner { env::set_var("BLOOM_LOCAL_AGENT_RUNNER_PATH", value); }
        else { env::remove_var("BLOOM_LOCAL_AGENT_RUNNER_PATH"); }
        let _ = std::fs::remove_dir_all(&root);

        match result {
            Err(error) if error.contains("safe limit") => Ok(()),
            Err(error) => Err(format!("unexpected output guard error: {error}")),
            Ok(_) => Err("runaway local Agent output must be rejected".to_string()),
        }
    }
}

#[test]
#[cfg(unix)]
fn rejects_local_agent_output_over_safe_limit() {
    if let Err(error) = runtime_under_test::exercise_runaway_output_guard() {
        panic!("{error}");
    }
}
'''
(ROOT / "bloom-runtime/tests/agent_output_guard.rs").write_text(output_guard, encoding="utf-8")

rel = ROOT / "bloom-runtime/ts/agentRuntimeOwnedPublishing.policy-test.ts"
text = rel.read_text(encoding="utf-8")
text = text.replace("outside the Codex sandbox", "outside the local model tool boundary")
text = text.replace("writer prompt must tell Codex", "writer prompt must tell the local model")
text = text.replace("after the sandboxed turn", "after the local model turn")
text = text.replace("before spawning Codex", "before spawning the local Agent runner")
start = text.find('assert(\n  source.includes("reuse or update your existing prefixed top-level comment instead of creating a duplicate")')
if start >= 0:
    end = text.find('console.log("PASS  Luna Runtime owns publishing and cleans task-scoped tool state.");', start)
    if end < 0:
        raise RuntimeError("review policy assertion end marker missing")
    replacement = '''assert(\n  source.includes("Do not create review comments or otherwise mutate GitHub from the local model tool boundary"),\n  "review agents must not perform GitHub mutations from the local model tool boundary",\n);\nassert(\n  source.includes("Record every PR you actually inspected in reviewedPullRequests"),\n  "review agents must preserve inspected PR evidence in the structured report",\n);\n\n'''
    text = text[:start] + replacement + text[end:]
rel.write_text(text, encoding="utf-8")

print("Bloom local runtime regression tests migrated")
