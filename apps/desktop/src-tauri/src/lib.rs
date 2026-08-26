mod agent_runtime;
mod failure_router_runtime;
mod integration_runtime;
mod project_runtime;
mod retrospective_runtime;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            project_runtime::greet,
            project_runtime::project_runtime_preflight,
            project_runtime::bootstrap_project_repository,
            project_runtime::start_project_runtime,
            agent_runtime::dispatch_agent_task,
            failure_router_runtime::route_agent_failure,
            integration_runtime::merge_project_pull_requests,
            retrospective_runtime::run_project_retrospectives
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
