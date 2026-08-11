# Coding Log

## Product Definition

Coding Log is a problem-solving journal for programmers who practice with Programmers and Baekjoon. It keeps each solution searchable by platform, level, status, language, tags, date, approach, code, and visibility.

## Market-Ready Baseline

- Users can write, edit, delete, filter, and review their own solution logs.
- Community logs, likes, and comments are available when the Playground API session is authenticated.
- GitHub commit and Velog publishing are explicit actions with visible success or failure states.
- Backup export downloads the user's current logs as JSON.
- Backup restore imports logs through the API and strips account-owned identity fields before recreating records.
- Velog access tokens are never included in exported backups.

## Stack

- React and TypeScript for the client application.
- Vite for local development and production builds.
- Playground `/api/coding-log`, `/github/commit`, and `/velog/publish` endpoints for persistence and integrations.
- Browser localStorage only for Velog publishing preferences.

## Required User Setup

- A signed-in Playground session is required for personal logs, community actions, and restore.
- GitHub commit requires the server-side GitHub integration to be configured.
- Velog publishing requires a user-provided Velog `access_token`; exported backups intentionally omit it.

## Verification

- `pnpm --filter ./apps/coding-log run build`
- `pnpm run harness`
