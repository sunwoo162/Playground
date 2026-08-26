use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const STATE_FILE_NAME: &str = "project-teams-state-v1.json";

fn state_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Luna app data 경로를 확인하지 못했습니다: {error}"))?;

    fs::create_dir_all(&directory)
        .map_err(|error| format!("Luna app data 폴더를 만들지 못했습니다: {error}"))?;

    Ok(directory.join(STATE_FILE_NAME))
}

#[tauri::command]
pub fn load_project_teams_state_file(app: AppHandle) -> Result<Option<String>, String> {
    let path = state_file_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    fs::read_to_string(path)
        .map(Some)
        .map_err(|error| format!("프로젝트 상태 파일을 읽지 못했습니다: {error}"))
}

#[tauri::command]
pub fn save_project_teams_state_file(
    app: AppHandle,
    state_json: String,
) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&state_json)
        .map_err(|error| format!("프로젝트 상태 JSON이 유효하지 않습니다: {error}"))?;

    let path = state_file_path(&app)?;
    let temporary_path = path.with_extension("json.tmp");

    fs::write(&temporary_path, state_json)
        .map_err(|error| format!("프로젝트 상태 임시 파일 저장에 실패했습니다: {error}"))?;

    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("기존 프로젝트 상태 파일 교체 준비에 실패했습니다: {error}"))?;
    }

    fs::rename(&temporary_path, &path)
        .map_err(|error| format!("프로젝트 상태 파일 교체에 실패했습니다: {error}"))?;

    Ok(())
}
