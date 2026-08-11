# Voice Studio Product Definition

## User

Streamers, students, and creators who need a browser-based voice practice and monitoring panel.

## Product Job

Let the user monitor microphone input, apply natural voice processing presets, fine-tune the processing chain, check pitch, and test browser TTS without installing desktop audio software.

## MVP Workflow

1. Open Voice Studio.
2. Turn on the microphone and grant permission.
3. Select a natural voice preset.
4. Enable monitoring when the user wants to hear the processed signal.
5. Adjust gate, body, clarity, air, compression, warmth, room, width, vibrato, and mix.
6. Use pitch monitoring for singing or speech control.
7. Test browser TTS with selected system voices.

## Current Stack

- React + TypeScript + Vite
- Web Audio API
- Browser MediaDevices microphone permission
- Browser SpeechSynthesis for TTS
- Optional Chrome launcher extension

## Why This Stack

Voice Studio must run close to the browser audio stack for low-friction microphone access and extension use. Web Audio is enough for local monitoring, analysis, filtering, compression, saturation, delay, and TTS testing without a server.

## Production Requirements

- Permission-denied and unsupported-browser states must remain explicit.
- Audio monitoring should default off to avoid feedback loops.
- Presets must stay natural enough for practical use, not only novelty effects.
- Browser/OS latency should be documented.
- Cloud TTS or voice cloning requires a separate provider, API key, consent policy, and safety review.

## Required User Inputs For Production

- Whether this is for streaming, learning, anonymous voice masking, or accessibility
- Target browser and OS
- Whether cloud TTS voices are required
- Whether presets should be optimized for Korean speech, singing, or both

## Verification

Use:

```powershell
pnpm --filter ./apps/voice-studio run build
pnpm run harness
```
