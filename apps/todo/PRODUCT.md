# Todo Product Definition

## User

Students and builders who need a fast daily task board without account setup.

## Product Job

Let the user plan a day, track completion, review previous days, and keep task data portable through backup files.

## MVP Workflow

1. Select a date.
2. Add tasks with priority and memo.
3. Mark tasks done or delete them.
4. Filter all, open, and completed tasks.
5. Clear completed tasks.
6. Export or restore all saved day lists.

## Current Stack

- React + TypeScript + Vite
- LocalStorage by date
- JSON backup/restore

## Why This Stack

This app is intentionally local-first and account-free. LocalStorage keeps the workflow instant, while JSON backup/restore covers portability and browser data-loss risk.

## Production Requirements

- Keep the app positioned as a lightweight daily board, not a full project manager.
- Add cloud sync only if this becomes cross-device or collaborative.
- Avoid mixing it with calendar/study planner unless the combined workflow is clearly better.

## Verification

Use:

```powershell
pnpm --filter ./apps/todo run build
pnpm run harness
```
