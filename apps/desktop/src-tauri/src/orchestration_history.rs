use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const SNAPSHOT_SCHEMA_VERSION: u32 = 1;
const MAX_SNAPSHOT_BYTES: usize = 10 * 1024 * 1024;
const MAX_HISTORY_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationSnapshotEnvelope {
    pub schema_version: u32,
    pub recorded_at: String,
    pub reason: String,
    pub snapshot: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistOrchestrationSnapshotResult {
    pub snapshot_path: String,
    pub history_path: String,
    pub history_bytes: u64,
}

fn orchestration_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Luna app data directory 확인 실패: {error}"))?;
    let directory = app_data.join("project-teams").join("orchestration");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Orchestration history directory 생성 실패: {error}"))?;
    Ok(directory)
}

fn rotate_history_if_needed(directory: &Path) -> Result<(), String> {
    let history_path = directory.join("history.jsonl");
    let size = match fs::metadata(&history_path) {
        Ok(metadata) => metadata.len(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Orchestration history metadata 확인 실패: {error}")),
    };

    if size < MAX_HISTORY_BYTES {
        return Ok(());
    }

    let previous_path = directory.join("history.previous.jsonl");
    if previous_path.exists() {
        fs::remove_file(&previous_path)
            .map_err(|error| format!("이전 Orchestration history 삭제 실패: {error}"))?;
    }
    fs::rename(&history_path, &previous_path)
        .map_err(|error| format!("Orchestration history rotation 실패: {error}"))?;
    Ok(())
}

fn append_history(directory: &Path, envelope: &OrchestrationSnapshotEnvelope) -> Result<u64, String> {
    rotate_history_if_needed(directory)?;
    let history_path = directory.join("history.jsonl");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&history_path)
        .map_err(|error| format!("Orchestration history 열기 실패: {error}"))?;
    let line = serde_json::to_string(envelope)
        .map_err(|error| format!("Orchestration history JSON 직렬화 실패: {error}"))?;
    file.write_all(line.as_bytes())
        .and_then(|_| file.write_all(b"\n"))
        .and_then(|_| file.flush())
        .map_err(|error| format!("Orchestration history 기록 실패: {error}"))?;
    fs::metadata(&history_path)
        .map(|metadata| metadata.len())
        .map_err(|error| format!("Orchestration history 크기 확인 실패: {error}"))
}

fn write_latest_snapshot(directory: &Path, envelope: &OrchestrationSnapshotEnvelope) -> Result<PathBuf, String> {
    let latest_path = directory.join("latest.json");
    let temporary_path = directory.join("latest.tmp.json");
    let backup_path = directory.join("latest.backup.json");
    let payload = serde_json::to_vec_pretty(envelope)
        .map_err(|error| format!("Orchestration snapshot JSON 직렬화 실패: {error}"))?;

    fs::write(&temporary_path, payload)
        .map_err(|error| format!("Orchestration temporary snapshot 기록 실패: {error}"))?;

    if backup_path.exists() {
        fs::remove_file(&backup_path)
            .map_err(|error| format!("이전 Orchestration snapshot backup 삭제 실패: {error}"))?;
    }
    if latest_path.exists() {
        fs::rename(&latest_path, &backup_path)
            .map_err(|error| format!("Orchestration snapshot backup 생성 실패: {error}"))?;
    }

    if let Err(error) = fs::rename(&temporary_path, &latest_path) {
        if backup_path.exists() && !latest_path.exists() {
            let _ = fs::rename(&backup_path, &latest_path);
        }
        return Err(format!("Orchestration latest snapshot 교체 실패: {error}"));
    }

    if backup_path.exists() {
        let _ = fs::remove_file(&backup_path);
    }
    Ok(latest_path)
}

fn read_snapshot_file(path: &Path) -> Result<Option<OrchestrationSnapshotEnvelope>, String> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Orchestration snapshot 읽기 실패: {error}")),
    };
    if content.len() > MAX_SNAPSHOT_BYTES * 2 {
        return Err("Orchestration snapshot 파일이 안전 한도를 초과했습니다.".to_string());
    }
    let envelope: OrchestrationSnapshotEnvelope = serde_json::from_str(&content)
        .map_err(|error| format!("Orchestration snapshot JSON 파싱 실패: {error}"))?;
    if envelope.schema_version != SNAPSHOT_SCHEMA_VERSION {
        return Err(format!(
            "지원하지 않는 Orchestration snapshot schema입니다: {}",
            envelope.schema_version
        ));
    }
    Ok(Some(envelope))
}

fn read_latest_history_line(path: &Path) -> Result<Option<OrchestrationSnapshotEnvelope>, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Orchestration history 읽기 실패: {error}")),
    };
    let reader = BufReader::new(file);
    let mut latest = None;
    for line in reader.lines() {
        let line = line.map_err(|error| format!("Orchestration history line 읽기 실패: {error}"))?;
        if line.trim().is_empty() || line.len() > MAX_SNAPSHOT_BYTES * 2 {
            continue;
        }
        if let Ok(candidate) = serde_json::from_str::<OrchestrationSnapshotEnvelope>(&line) {
            if candidate.schema_version == SNAPSHOT_SCHEMA_VERSION {
                latest = Some(candidate);
            }
        }
    }
    Ok(latest)
}

fn validate_record(recorded_at: &str, reason: &str, snapshot: &Value) -> Result<(), String> {
    if recorded_at.trim().is_empty() || recorded_at.len() > 80 {
        return Err("Orchestration snapshot recordedAt 형식이 잘못되었습니다.".to_string());
    }
    let reason = reason.trim();
    if reason.is_empty() || reason.len() > 160 {
        return Err("Orchestration snapshot reason은 1~160자여야 합니다.".to_string());
    }
    let snapshot_size = serde_json::to_vec(snapshot)
        .map_err(|error| format!("Orchestration snapshot 크기 계산 실패: {error}"))?
        .len();
    if snapshot_size > MAX_SNAPSHOT_BYTES {
        return Err(format!(
            "Orchestration snapshot이 {}MB 안전 한도를 초과했습니다.",
            MAX_SNAPSHOT_BYTES / 1024 / 1024
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn persist_orchestration_snapshot(
    app: AppHandle,
    snapshot: Value,
    recorded_at: String,
    reason: String,
) -> Result<PersistOrchestrationSnapshotResult, String> {
    validate_record(&recorded_at, &reason, &snapshot)?;
    let directory = orchestration_dir(&app)?;
    let envelope = OrchestrationSnapshotEnvelope {
        schema_version: SNAPSHOT_SCHEMA_VERSION,
        recorded_at,
        reason: reason.trim().to_string(),
        snapshot,
    };

    let history_bytes = append_history(&directory, &envelope)?;
    let snapshot_path = write_latest_snapshot(&directory, &envelope)?;
    let history_path = directory.join("history.jsonl");

    Ok(PersistOrchestrationSnapshotResult {
        snapshot_path: snapshot_path.to_string_lossy().to_string(),
        history_path: history_path.to_string_lossy().to_string(),
        history_bytes,
    })
}

#[tauri::command]
pub fn load_orchestration_snapshot(
    app: AppHandle,
) -> Result<Option<OrchestrationSnapshotEnvelope>, String> {
    let directory = orchestration_dir(&app)?;
    for path in [directory.join("latest.json"), directory.join("latest.backup.json")] {
        match read_snapshot_file(&path) {
            Ok(Some(snapshot)) => return Ok(Some(snapshot)),
            Ok(None) => {}
            Err(_) => {}
        }
    }

    if let Some(snapshot) = read_latest_history_line(&directory.join("history.jsonl"))? {
        return Ok(Some(snapshot));
    }
    read_latest_history_line(&directory.join("history.previous.jsonl"))
}
