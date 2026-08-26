# Luna Runtime Control

## Goal

Luna Agent projects must survive ordinary desktop interruptions without losing verified Git/PR work or silently treating unfinished work as complete.

This runtime layer provides cooperative project control, durable state backup, Windows keep-awake support, and startup reconciliation for interrupted Agent tasks.

## Project execution controls

Each project owns a persisted execution control state:

- `running`
- `paused`
- `stopped`

### Pause

Pause is cooperative. Luna does not kill an Agent process in the middle of a task because that can leave a half-written worktree, partial commit, or inconsistent PR state.

When Pause is requested:

1. the control state is persisted immediately;
2. the currently running Agent wave is allowed to finish;
3. Luna checks the control state before starting the next wave;
4. no new Agent task or integration stage starts until Resume.

### Resume

Resume preserves completed tasks, branches, commits, worktrees, PRs, evidence, and verification records. Luna continues from dependency-ready unfinished tasks.

### Stop

Stop uses the same safe boundary as Pause but represents a stronger user intent. Existing artifacts remain intact. A stopped project can still be explicitly resumed later.

## Durable project state

The existing project-team state remains available through local storage for synchronous UI access, and Luna mirrors the serialized state into the Tauri application data directory as:

```text
project-teams-state-v1.json
```

If local storage is missing on startup, Luna restores the last valid schema-v1 state from this file before loading project runtime state.

This file mirror is a recovery layer, not the final database architecture. A future version may replace it with normalized persistent storage.

## Startup Agent reconciliation

Older behavior marked every `running` task as blocked when Luna restarted. That was safe but could discard evidence that an Agent had already completed its Git/PR contract just before the desktop process exited.

Startup reconciliation now evaluates interrupted tasks using actual evidence.

### Evidence sources

Luna checks:

- deterministic Agent event logs under `.luna-runtime`;
- Codex `turn/completed` and structured final Agent report;
- expected Agent worktree;
- current worktree branch;
- uncommitted Git changes;
- local HEAD;
- remote Agent branch;
- `develop`-targeting GitHub PR state.

### Recovery outcomes

#### `completed`

A task is restored as done when Luna can verify a completed Agent report, or for repository-writing Agents when a clean expected worktree plus a valid remote PR proves the work was completed.

Recovered commit and PR identifiers are stored back into the task state.

#### `retry`

A task returns to `ready` when no reliable completion evidence exists and there is no unsafe partial work requiring manual inspection.

The prior attempt count is preserved, so bounded retry policy still applies.

#### `blocked`

A task remains blocked when automatic recovery would be unsafe, including cases such as:

- uncommitted changes in the interrupted worktree;
- completed event data that disagrees with repository state;
- missing or invalid PR evidence for repository-writing work;
- missing repository/workspace/plan metadata.

Luna never converts ambiguous partial work into a successful task.

## Windows keep-awake behavior

While a Luna runtime stage is active, the Tauri process requests Windows system execution continuity with `SetThreadExecutionState` and `ES_SYSTEM_REQUIRED`.

This prevents ordinary idle system sleep while Agent work is active.

It does **not** override explicit operating-system power actions such as:

- Shut down
- Hibernate
- a lid-close policy configured to force sleep or hibernation

For local Agent execution to continue with the laptop lid closed, Windows must be configured so the AC-power lid-close action is **Do nothing**. Power should remain connected for long-running work.

## Remote Runner

Remote execution is a separate next-stage architecture. It is required if Agent work must continue when the laptop itself is asleep, hibernated, shut down, disconnected, or out of battery.

Remote Runner must eventually own the durable orchestration loop rather than merely proxy one Agent call. The desktop app should then become a control/monitoring client that can disconnect without stopping project execution.
