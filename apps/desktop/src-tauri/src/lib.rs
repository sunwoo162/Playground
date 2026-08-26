mod agent_runtime;
mod project_runtime;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            project_runtime::greet,
            project_runtime::project_runtime_preflight,
            project_runtime::bootstrap_project_repository,
            project_runtime::start_project_runtime,
            agent_runtime::dispatch_agent_task
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
