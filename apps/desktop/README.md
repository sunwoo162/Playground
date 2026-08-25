# Luna

Luna is a Windows desktop companion built around a persistent desktop pet and a separate management window. The pet stays close to the user while the management window configures Luna, commands, characters, and future custom behaviors.

## Product definition

- **User:** a Windows user who wants a lightweight desktop companion they can personalize.
- **Primary job:** keep a character on the desktop and configure how that character looks and reacts without editing source code.
- **Current MVP workflow:** open the management window, move to **캐릭터**, choose **캐릭터 추가하기**, upload a required default image and a required movement image, then continue to the setup step to name the character and configure the movement label, default playback interval, and loop behavior.
- **Non-goals for this iteration:** cloud accounts, AI generation, marketplace distribution, and durable behavior-pack storage.

## Stack

- Tauri 2 for the Windows desktop shell and native window behavior.
- React 19 + TypeScript for the management-window UI.
- Vite for local development and frontend builds.
- In-memory React state for the current character draft. The uploaded image files are not uploaded to a server.

## Character creation behavior

The character creation flow has two steps.

### Step 1: required images

The image screen accepts PNG, JPG, and JPEG files up to 10 MB each. Two images are required:

1. **기본 상태** — the character's default pose.
2. **움직이는 상태** — an example movement pose such as walking or running.

The **다음** action becomes available only after both images pass validation.

### Step 2: character setup

The setup screen requires a character name and a movement name. It also lets the user choose a default playback interval from 50 to 1000 ms and whether the movement should loop. Going back to the image step preserves setup values that were already entered in the current session.

After **캐릭터 생성**, the character page shows the configured name and movement summary. The current iteration still keeps the draft only for the current app session. Durable local asset storage and behavior animation manifests are intentionally deferred until their storage contract is defined.

## Run locally

From `apps/desktop`:

```bash
pnpm install
pnpm dev
```

To run the desktop shell:

```bash
pnpm tauri dev
```

## Build

Frontend verification:

```bash
pnpm build
```

Desktop bundle:

```bash
pnpm tauri build
```

## Production blockers

- Persist imported character assets into an app-owned local directory instead of session memory.
- Define the character/behavior manifest format and migration strategy.
- Verify image permission and invalid-file states through packaged Tauri builds.
- Verify management-window creation/launch behavior from the desktop pet.
- Test multi-monitor and DPI behavior on Windows.
- Decide on Windows signing and installer distribution before public release.
