# Focus Room

## Product Definition

Focus Room is an immersive 3D study environment that combines a timed focus session, room navigation, ambient progress feedback, and direct access to the Study Planner app.

## Market-Ready Baseline

- Users can enter a focused room, start or pause a timer, and leave without losing control of the page.
- Pointer lock is released when opening the embedded planner workspace.
- The Study Planner is available both as an in-room laptop preview and as a full workspace overlay.
- The planner iframe is non-interactive in the small room preview, preventing accidental pointer capture inside the 3D scene.
- The full planner workspace includes close and new-window controls for recovery.

## Stack

- React and TypeScript for the application shell.
- Three.js for the 3D room rendering.
- Vite for local development and production builds.
- Embedded Playground app routing for `/apps/study-planner/`.

## Required User Setup

- No account is required for the room itself.
- Study Planner data and integrations follow the Study Planner app's own requirements.
- Browser pointer lock permission is required for immersive room navigation.

## Verification

- `npm run build --prefix apps/focus-room`
- `npm run harness`
