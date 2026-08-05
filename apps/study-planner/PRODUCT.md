# Study Planner Product Definition

## User

Students and self-learners who need a lightweight study operating system they can use every day without setting up a backend.

## Product Job

Help the user decide what to study now, record focused sessions, review progress, and keep their study data portable.

## MVP Workflow

1. Create subjects with daily goals.
2. Start a study timer for one subject.
3. Add an optional memo while studying.
4. Stop the timer and save the session.
5. Review today's progress, weekly stats, calendar history, and subject totals.
6. Export a JSON backup or restore from a backup file.

## Current Stack

- React + TypeScript + Vite
- LocalStorage first persistence
- Existing Playground API calls with LocalStorage fallback
- Browser notifications for reminders and long sessions

## Why This Stack

The app is a personal productivity tool that must work even when the shared backend is unavailable. LocalStorage keeps the product immediately usable. Backup/restore covers the largest risk of local-first storage: browser data loss and device migration.

## Production Readiness

Ready for local daily use:

- Study timer
- Subject goals
- Stats and calendar
- Notes
- Group tab shell
- Data backup, restore, and reset

Not yet production-complete:

- Cross-device sync needs a stable authenticated backend contract.
- Group study requires realtime presence and invitation lifecycle QA.
- Browser notification reliability varies by OS/browser.
- Local backup files are user-managed and not encrypted.

## Required User Inputs For Production

- Whether cloud sync is required
- Whether group study should be public, invite-only, or account-only
- Backup/export policy if sensitive study notes are stored
- Hosted deployment path and authentication requirements

## Verification

Use:

```powershell
npm run build --prefix apps/study-planner
npm run harness
```
