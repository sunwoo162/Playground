# Voice Phishing

## Product Definition

Voice Phishing is a browser-based fraud awareness simulator that teaches users how scam calls escalate through fear, malicious app installation, money transfer pressure, and authentication-code theft.

## Market-Ready Baseline

- Users can complete a guided scam-call scenario without entering real personal data.
- Every risky choice updates a visible risk score and shows the simulated impact.
- Speech synthesis is optional; the transcript remains usable when voice playback is unavailable.
- Completed sessions are submitted to the Playground API when authenticated.
- Users can export a local JSON training report for classroom or self-review use.
- Emergency action links for 112 and 1332 are visible at the final screen.

## Stack

- React for the simulator flow.
- Vite for development and production builds.
- Browser SpeechSynthesis for optional Korean call narration.
- Playground `/api/voice-phishing/sessions` routes for authenticated session storage.
- JSON export for portable reports.

## Required User Setup

- No real banking, identity, or account data should be entered.
- Login is required only for server-side session history.
- Browser voice synthesis support is optional.

## Verification

- `npm run build --prefix apps/voice-phishing`
- `npm run harness`
