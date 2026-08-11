# Action Notifier

## Product Definition

Action Notifier watches selected GitHub repositories and sends browser push notifications when GitHub Actions runs change state.

## Market-Ready Baseline

- Users can connect repositories by `owner/repo` or GitHub URL.
- Each repository can be individually enabled or disabled for notifications.
- Recent workflow runs are visible with status, conclusion, branch, and direct Actions links.
- Browser push setup handles unsupported browsers, missing VAPID keys, and service worker registration failures with visible messages.
- The watch list can be exported and imported as JSON for migration or recovery.
- Repository deletion and import failures are shown without leaving the UI in an unknown state.

## Stack

- React and TypeScript for the app UI.
- Vite for development and production builds.
- Playground `/api/action-notifier` routes for GitHub watch persistence.
- Browser Service Worker and Push APIs for notifications.
- JSON import/export for portable watch configuration.

## Required User Setup

- GitHub authentication is required to manage watched repositories.
- Browser notification permission is required for push alerts.
- Server VAPID public/private keys must be configured for push subscriptions.

## Verification

- `pnpm --filter ./apps/action-notifier run build`
- `pnpm run harness`
