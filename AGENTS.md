# Codex Local Rules

- When a Codex task is complete, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\notify-task-complete.ps1` before the final response when shell execution is available.
- If the notification command fails because audio is unavailable, continue normally and mention it briefly only when relevant.
- For any new app/project request or significant existing app change, follow `docs/PROJECT_BUILD_PROTOCOL.md` and treat `docs/PRODUCT_REDEFINITION_2026-08-06.md` plus `docs/app-registry.json` as the current product baseline. Define product scope, required inputs, stack choices, production blockers, and verification before calling the work complete.
- For this `Playground` repository only, after completing and verifying a task, automatically stage only the files changed by Codex for that task, create a clear commit, and push the current branch. Do not include unrelated pre-existing user changes in the commit.
