# Commute Alarm

## Product Definition

Commute Alarm is a Seoul transit arrival and stop-alert tool that combines GPS distance tracking with live subway and bus data so users can prepare before reaching their destination.

## Market-Ready Baseline

- Users can search subway stations, load nearby bus stops, choose a target, and start/stop distance tracking.
- Browser notification permission, geolocation support, and API configuration failures are shown as user-facing status messages.
- Arrival data refreshes automatically every 30 seconds for the selected target.
- Alarm settings can be exported and imported as JSON.
- Alert distance is clamped to the supported 200m to 2000m range on import.

## Stack

- React and TypeScript for the client.
- Vite for development and production builds.
- Browser Geolocation, Notification, Vibration, and Web Audio APIs for alert behavior.
- Playground `/commute-api` routes for Seoul subway and bus data.
- Browser localStorage and JSON files for settings persistence.

## Required User Setup

- Location permission is required for distance tracking.
- Browser notification permission is required for notification alerts.
- Server environment variables for Seoul transit APIs must be configured for live data.

## Verification

- `npm run build --prefix apps/commute-alarm`
- `npm run harness`
