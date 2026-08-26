#[cfg(target_os = "windows")]
mod platform {
    const ES_CONTINUOUS: u32 = 0x8000_0000;
    const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;

    #[link(name = "kernel32")]
    extern "system" {
        fn SetThreadExecutionState(es_flags: u32) -> u32;
    }

    pub fn set_keep_awake(enabled: bool) -> Result<bool, String> {
        let flags = if enabled {
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED
        } else {
            ES_CONTINUOUS
        };

        let result = unsafe { SetThreadExecutionState(flags) };
        if result == 0 {
            return Err("Windows SetThreadExecutionState 호출에 실패했습니다.".to_string());
        }

        Ok(enabled)
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn set_keep_awake(_enabled: bool) -> Result<bool, String> {
        Ok(false)
    }
}

#[tauri::command]
pub fn set_runtime_keep_awake(enabled: bool) -> Result<bool, String> {
    platform::set_keep_awake(enabled)
}
