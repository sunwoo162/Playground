# Luna

Luna is the desktop pet project.

This app intentionally contains only desktop-pet responsibilities:

- character appearance and future customization
- pet behavior and animation
- always-on-top desktop window behavior
- dragging and window recovery
- pet-specific settings

The autonomous software-building Agent platform is a separate product named **Bloom**. PM planning, Agent teams, Review/QA, Builder workers, orchestration snapshots, GitHub/Codex execution, and integration logic do not belong in Luna.

## Development

```bash
pnpm --dir apps/desktop run dev
pnpm --dir apps/desktop run build
pnpm --dir apps/desktop run tauri dev
```

`apps/desktop` is kept as the repository path for lockfile/workspace compatibility, but the package itself is `luna-desktop-pet` and must stay free of Bloom runtime code.
