# Team allocation verification cases

- All five teams idle with no history: choose the first catalog team only as the final deterministic tie-break.
- After one assignment to a team: prefer an idle team with fewer assignments.
- Equal assignment counts: prefer the team whose last assignment is older.
- Reserved or working teams: never select them.
- A team with `activeProjectId` set: never select it even if its status is `idle`.
- Do not use `averageScore`, team persona, or inferred specialty as an allocation input.
