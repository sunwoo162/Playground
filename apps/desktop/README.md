# Luna

Luna is a Windows desktop companion built around a persistent desktop pet and a separate management window. The pet stays close to the user while the management window configures Luna, commands, characters, and future custom behaviors.

## Product definition

- **User:** a Windows user who wants a lightweight desktop companion they can personalize.
- **Primary job:** keep a character on the desktop and configure how that character looks and reacts without editing source code.
- **Current MVP workflow:** open the management window, move to **캐릭터**, choose **캐릭터 추가하기**, upload a required default image and a required movement image, preview both images, then keep the draft ready for the next character-setup step.
- **Non-goals for this iteration:** cloud accounts, AI generation, marketplace distribution, and durable behavior-pack storage.

## Stack

- Tauri 2 for the Windows desktop shell and native window behavior.
- React 19 + TypeScript for the management-window UI.
- Vite for local development and frontend builds.
- In-memory React state for the current character draft. The uploaded image files are not uploaded to a server.

## Character creation behavior

The character creation screen accepts PNG, JPG, and JPEG files up to 10 MB each. Two images are required:

1. **기본 상태** — the character's default pose.
2. **움직이는 상태** — an example movement pose such as walking or running.

The **다음** action becomes available only after both images pass validation. In this iteration the draft is kept only for the current app session and is surfaced back on the character page. Durable local asset storage and behavior animation manifests are intentionally deferred until their storage contract is defined.

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
