# FocusTime Extension

FocusTime is a Chrome extension for tracking website usage, setting daily limits, blocking distracting domains, and viewing app usage through a local Windows tracker.

## Files

- `manifest.json` - Chrome extension manifest
- `background.js` - website tracking, limits, and blocking logic
- `dashboard.html` / `dashboard.js` / `dashboard.css` - main dashboard
- `popup.html` / `popup.js` / `popup.css` - toolbar popup
- `FocusTimeTracker.ps1` - local Windows app usage tracker
- `Start-FocusTimeTracker.bat` - tracker launcher

## Local Tracker

Run `Start-FocusTimeTracker.bat` before using app tracking features.
