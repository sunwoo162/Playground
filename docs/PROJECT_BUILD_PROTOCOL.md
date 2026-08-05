# Project Build Protocol

This is the default workflow for future `Playground` project requests.

## 1. Define Before Building

Before creating or editing app code, write down the product assumptions:

- Who uses it
- What job it solves
- The first complete workflow
- What data must be stored
- What can run locally
- What requires real accounts, API keys, auth, payments, or deployment settings

If the user says to proceed without questions, make conservative product assumptions and document them in the app README or `PRODUCT.md`.

## 2. Choose Technology For A Reason

Default to the existing repo stack unless the product requires otherwise.

- Use React + TypeScript + Vite for normal apps.
- Use Express routes in the existing server for shared backend behavior.
- Use LocalStorage only for local-only personal tools.
- Use server persistence for multi-device, collaborative, authenticated, financial, notification, or long-lived data.
- Use proven libraries for complex domains such as realtime media, parsing, charts, 3D scenes, audio processing, or authentication.
- Use Chrome MV3 only for browser-extension products.
- Use native bridge code only when browser APIs cannot perform the task.

Do not add a database, auth system, AI model, realtime provider, or payment integration just because it sounds production-like. Add it when the product requires it, then document exactly what credential or setup is needed.

## 3. Required Deliverables

A new or seriously reworked app should include:

- Working source code
- Clear app README or `PRODUCT.md`
- Empty, loading, error, and permission states
- Local run instructions
- Build command
- Production blockers
- Environment variables in `.env.example` where applicable
- Verification notes from actual commands run

## 4. Acceptance Checklist

Before marking a task complete:

- App builds successfully, or the build blocker is documented with the exact error.
- App runs locally, or the run blocker is documented.
- Primary workflow has been exercised.
- UI is checked for obvious mobile and desktop layout failures.
- Portal path and asset base path are correct if hosted under `/apps/<id>/`.
- User-provided missing pieces are listed plainly.
- No generated template README remains as the main project explanation.

## 5. Existing App Policy

For existing apps, do not expand first. Stabilize first:

1. Identify product purpose.
2. Identify current technical shape.
3. Check build/run.
4. Replace template docs.
5. List production blockers.
6. Only then add features.

## 6. Decision Language

When reporting a plan or result, say:

- What will be built
- What technology is used
- Why it is used
- What is missing
- What the user must provide for production
- What was verified

Avoid hiding gaps behind mock data. Mock data is acceptable only when labeled as local/demo behavior.
