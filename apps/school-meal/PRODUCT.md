# School Meal Product Definition

## User

Students and parents who want a fast daily view of school meals, timetable, and school events.

## Product Job

Let the user save one school/class, check meals and timetable for any date, mark ingredients they care about, and receive meal-time reminders.

## MVP Workflow

1. Search and select a school.
2. Choose grade and class.
3. View meals, timetable, and academic schedule for the selected date.
4. Mark allergy or disliked ingredients by category or keyword.
5. Add meal notifications.
6. Export or reset local school settings.

## Current Stack

- React + TypeScript + Vite
- LocalStorage for school settings and alert preferences
- Playground Express server as NEIS proxy
- Browser Notifications API
- Optional Chrome extension launcher

## Why This Stack

NEIS requests should be proxied by the server so API keys are not exposed to the browser. LocalStorage is appropriate for school/class preferences because they are device-local and not sensitive enough to require an account by default.

## Production Requirements

- `NEIS_API_KEY` must be configured on the server.
- Server endpoints must return useful errors for missing keys and upstream failures.
- Browser notification behavior must be tested on the target browsers.
- Extension default URL must match the deployed app URL.
- The app should keep distinguishing "no meal data" from "API failed."

## Required User Inputs For Production

- Default target school or region, if any
- Whether parent/student accounts are needed
- Hosted service URL for the Chrome extension
- Privacy copy if settings or notification data ever leave the browser

## Verification

Use:

```powershell
pnpm --filter ./apps/school-meal run build
pnpm run harness
```
