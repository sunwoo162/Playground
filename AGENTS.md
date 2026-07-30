# Codex Local Rules

- When a Codex task is complete, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\notify-task-complete.ps1` before the final response when shell execution is available.
- If the notification command fails because audio is unavailable, continue normally and mention it briefly only when relevant.
