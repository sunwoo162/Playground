# Virtual Study Room Product Definition

## User

Students who want a shared online room for silent study, screen sharing, ambient media, and light accountability.

## Product Job

Create a room where the user can study with camera, screen sharing, music/repeat bots, and friend invitations.

## MVP Workflow

Current local/demo workflow:

1. Open a room.
2. Turn camera on or off.
3. Share the screen locally.
4. Add repeat or music bot tiles with YouTube links.
5. Copy a room link.
6. Invite friends through the existing Playground friend API shell.

## Current Stack

- React + TypeScript + Vite
- Browser MediaDevices camera access
- Browser DisplayMedia screen sharing
- YouTube embeds for bot tiles
- Local in-browser tile state
- Existing Playground API endpoint shell for invitations

## Why This Stack

The current client can validate room layout, media permission UX, screen sharing, and bot controls without adding realtime infrastructure prematurely.

## Production Requirements

- Realtime backend for room membership and tile state
- WebRTC or managed media provider for remote camera/audio
- Authenticated room lifecycle
- Invite delivery and acceptance state
- Moderation controls, room privacy, and disconnect handling
- YouTube embed failure handling and provider policy review

## Required User Inputs For Production

- Realtime provider choice
- Room privacy model: public, link-only, friend-only, or account-only
- Whether camera/audio are required or optional
- Moderation and reporting policy
- Expected room size and media quality target

## Verification

Use:

```powershell
npm run build --prefix apps/virtual-study-room
npm run harness
```
