# Dev Term Roulette

## Product Definition

Dev Term Roulette is a study game that randomly selects developer terms, avoids repeat picks per account/list, and starts a 15-minute review timer for deliberate concept practice.

## Market-Ready Baseline

- Users can study from built-in frontend, backend, and computer-science term pools.
- Users can switch to a custom word list with newline or comma-separated terms.
- Terms are selected without repeats within the same account and custom-list signature.
- A 15-minute timer starts after each spin and can notify the user when review time ends.
- Recent results and current session state can be exported as JSON.
- Notification permission is requested only when the timer starts.

## Stack

- React and TypeScript for the interactive game.
- Vite for local development and production builds.
- Browser localStorage for per-account seen-term tracking.
- Browser Notification API for optional timer completion alerts.
- JSON export for portable study session records.

## Required User Setup

- No account is required; unauthenticated users are tracked as `guest`.
- Browser notification permission is optional and only needed for timer alerts.
- Custom games require at least three terms.

## Verification

- `npm run build --prefix apps/dev-term-roulette`
- `npm run harness`
