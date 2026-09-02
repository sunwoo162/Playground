#[cfg(unix)]
mod runtime_under_test {
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/agent_runtime.rs"));

    pub(super) fn exercise_runaway_output_guard() -> Result<(), String> {
        use std::{
            env,
            os::unix::fs::PermissionsExt,
            time::{SystemTime, UNIX_EPOCH},
        };

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_nanos();
        let project_id = format!("builder-output-guard-{stamp}");
        let root =
            env::temp_dir().join(format!("luna-output-guard-{}-{stamp}", std::process::id()));
        let workspace = root.join("workspace");
        let worktree = root.join("worktree");
        let bin = root.join("bin");
        std::fs::create_dir_all(&workspace).map_err(|error| error.to_string())?;
        std::fs::create_dir_all(&worktree).map_err(|error| error.to_string())?;
        std::fs::create_dir_all(&bin).map_err(|error| error.to_string())?;

        let fake_codex = bin.join("codex");
        std::fs::write(
            &fake_codex,
            r#"#!/usr/bin/env bash
set -euo pipefail
IFS= read -r _
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r _
IFS= read -r _
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-test"}}}'
IFS= read -r _
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-test"}}}'
chunk="$(printf '%1024s' '' | tr ' ' x)"
for _ in $(seq 1 600); do
  printf '{"method":"item/agentMessage/delta","params":{"delta":"%s"}}\n' "$chunk"
done
printf '%s\n' '{"method":"item/completed","params":{"item":{"type":"agentMessage","text":"{\"status\":\"completed\",\"summary\":\"ok\",\"rationaleSummary\":\"ok\",\"evidence\":[],\"verification\":[],\"commitSha\":null,\"pullRequestNumber\":null,\"pullRequestUrl\":null,\"reviewedPullRequests\":[],\"blockers\":[]}"}}}'
printf '%s\n' '{"method":"turn/completed","params":{"turn":{"id":"turn-test","status":"completed"}}}'
"#,
        )
        .map_err(|error| error.to_string())?;
        let mut permissions = std::fs::metadata(&fake_codex)
            .map_err(|error| error.to_string())?
            .permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&fake_codex, permissions).map_err(|error| error.to_string())?;

        let original_path = env::var_os("PATH").unwrap_or_default();
        let mut path_entries = vec![bin];
        path_entries.extend(env::split_paths(&original_path));
        env::set_var(
            "PATH",
            env::join_paths(path_entries).map_err(|error| error.to_string())?,
        );

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
            acceptance_criteria: vec!["Reject oversized streamed agent output".to_string()],
            user_request: "Test runaway output".to_string(),
            product_summary: "Test product".to_string(),
            architecture_summary: "Test architecture".to_string(),
            repository_full_name: "sunwoo162/test-repository".to_string(),
            workspace_path: workspace.to_string_lossy().to_string(),
            dependencies: vec![],
        };
        let result = run_app_server_agent(&input, &worktree, None);

        env::set_var("PATH", original_path);
        let _ = std::fs::remove_dir_all(&root);

        match result {
            Err(error) if error.contains("누적 출력 안전 한도") => Ok(()),
            Err(error) => Err(format!("unexpected output guard error: {error}")),
            Ok(_) => Err("runaway agent message delta stream must be rejected".to_string()),
        }
    }
}

#[test]
#[cfg(unix)]
fn rejects_agent_message_delta_stream_over_safe_limit() {
    if let Err(error) = runtime_under_test::exercise_runaway_output_guard() {
        panic!("{error}");
    }
}
