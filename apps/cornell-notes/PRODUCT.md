# Cornell Notes Product Definition

## User

Students and developers who want structured notes that separate cues, detailed material, and final summaries.

## Product Job

Capture learning in Cornell-note format, review notes by subject, share/import a note, and publish selected notes to GitHub or Velog.

## MVP Workflow

1. Create subjects.
2. Create a note with title, date, subject, cues, detailed notes, and summary.
3. Use Markdown tools in the detail area.
4. View notes as rendered Markdown.
5. Search and filter by subject.
6. Share a note link or open detail-only editing.
7. Export and restore local backup files.
8. Optionally commit to GitHub or publish to Velog after credentials are configured.

## Current Stack

- React + TypeScript + Vite
- LocalStorage for notes, subjects, and integration settings
- react-markdown for preview
- Playground server endpoints for GitHub commit and Velog publish

## Production Requirements

- Backup excludes Velog access tokens by default.
- GitHub and Velog integrations require explicit user credentials.
- Cloud sync should be added before treating this as cross-device storage.
- Shared note hash URLs are convenient but not private.

## Verification

Use:

```powershell
npm run build --prefix apps/cornell-notes
npm run harness
```
