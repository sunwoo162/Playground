# Site Macro Native Bridge

Chrome Native Messaging host for `apps/site-macro-extension`.

## Setup

1. Install .NET SDK 8 or newer.
2. Build the bridge:

```powershell
apps\site-macro-native-bridge\build.ps1
```

3. Open `chrome://extensions`, enable developer mode, and copy the Site Macro extension ID.
4. Register the host:

```powershell
apps\site-macro-native-bridge\install-chrome-host.ps1 -ExtensionId YOUR_EXTENSION_ID
```

## Supported Native Actions

- `key`: sends a key such as `Enter`, `Tab`, `Escape`, `Backspace`, `Delete`.
- `type`: sends text to the active target window.
- `nativeClick`: clicks screen coordinates using action `x` and `y`.
- `wait`: waits for `ms`.
- `listWindows`: returns currently opened Windows app windows with icons so the extension can show a clickable picker.

The target window is found by process name and/or window title from the Site Macro options page.
