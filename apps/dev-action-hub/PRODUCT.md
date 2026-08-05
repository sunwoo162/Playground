# Dev Action Hub

## Product Definition

Dev Action Hub is an integrated developer workspace for project rooms, direct messages, GitHub Actions watching, shared notes, tasks, API specs, persona notes, deployment checks, assistant threads, and Discord-style collaboration.

## Market-Ready Baseline

- Project rooms, direct messages, docs, tasks, API specs, personas, deploy checks, GitHub watches, and assistant thread state persist in browser storage.
- GitHub Actions runs can be checked from saved watched repositories.
- Push notification setup now returns explicit user-facing outcomes for unsupported browsers, missing VAPID keys, denied permissions, existing subscriptions, and registration failures.
- The app separates project-room and DM workflows while preserving the selected DM across sessions.
- Deployment and API checklist data are local-first so the workspace remains usable without server roundtrips.

## Stack

- React and TypeScript for the client workspace.
- Vite for local development and production builds.
- Browser localStorage for workspace persistence.
- GitHub Actions REST API for workflow status reads.
- Browser Service Worker and Push APIs for optional notifications.

## Required User Setup

- Browser storage must be available for workspace persistence.
- GitHub public API access is required for live Actions checks.
- Push notifications require browser permission and server VAPID keys.
- Shared or authenticated backend features depend on Playground server routes.

## Verification

- `npm run build --prefix apps/dev-action-hub`
- `npm run harness`
