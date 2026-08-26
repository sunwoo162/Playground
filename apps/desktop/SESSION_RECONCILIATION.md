# Luna interrupted Agent reconciliation

## Scope

Luna now reconciles persisted Agent Tasks that were still recorded as `running` when the desktop process stopped. This recovery is intentionally evidence-based: Luna does not assume that an interrupted Task failed, and it does not assume that it succeeded.

The implemented feature recovers **already-terminal App Server results whose completion evidence was written before the process loss**. It is not a live-process reconnect or a true pause/resume mechanism for an in-flight Codex turn.

## Startup order

The main desktop window starts Project Teams in this order:

1. restore durable orchestration state;
2. inspect persisted `running` Agent Tasks;
3. reconcile each eligible Task from App Server and repository evidence;
4. apply the result through the normal Project Teams state transitions;
5. render the React application.

The pet window does not run the reconciliation bootstrap a second time.

## Required App Server evidence

A Task is recoverable only when its persisted project metadata is complete and the Agent event log provides evidence for the same completed turn. Luna reads the existing `.luna-runtime` Agent event log and requires:

- a `thread/start` response with a thread ID;
- a `turn/start` response with a turn ID;
- `turn/completed` for that same turn with `status=completed`;
- a final structured `agentMessage` that parses as a valid Luna Agent report.

If this evidence is absent, malformed, incomplete, or refers to a non-completed turn, Luna does not infer success. The Task is routed through the existing blocked/failure recovery path.

## Repository writer evidence gate

Repository-changing Agents have an additional gate. Both normal Agent completion and restart reconciliation use the same hardened repository evidence wrapper.

Before execution or reconciliation, the project workspace `origin` must exactly identify the expected GitHub repository using an allowed HTTPS or SSH GitHub origin form. Host-suffix lookalikes are not accepted.

For a completed writer result, all of the following must agree:

```text
reported commit SHA
        =
worktree HEAD
        =
origin branch SHA
        =
open develop-targeting PR headRefOid
```

The referenced PR number must also exist in the expected repository for the expected Agent branch. A mismatch at any point prevents the result from being accepted as completed.

## State handling

A recovered terminal result is applied through the same `completeAgentTask` path used by normal execution, preserving session/thread/turn identifiers, verification output, evidence, commit and PR metadata, and dependency readiness.

An unrecoverable result is applied through the existing failure/blocking path. This preserves an explicit reconciliation reason instead of silently retrying or fabricating a successful result.

The ordinary interrupted-task hard-block behavior remains the final fallback when startup reconciliation itself cannot safely run.

## Relationship to execution control

`/pause`, `/resume`, and `/stop` remain cooperative wave-boundary controls. They do not suspend and later continue the same active Codex turn.

Restart reconciliation improves a different case: if a turn had already reached a terminal result and durable event/repository evidence exists, Luna can recover that result after restart instead of automatically losing it.

## Not implemented

The following are still outside the implemented reconciliation scope:

- reconnecting to a Codex OS process that is still executing after Luna loses its frontend/runtime process;
- resuming a partially executed turn from its exact in-flight point;
- true non-destructive in-turn pause/resume;
- claiming completion when terminal App Server evidence or required writer repository evidence is missing.

These limitations should remain explicit in product and operations documentation.