# Bloom Greenfield Bootstrap Rail v1

## Problem

Live E2E run #55 proved the current no-progress guard fails fast, but the first writer still cannot reliably escape a brand-new repository. The failed Local Agent left no product files and the first tool failure could not be reconstructed because action events are persisted only after a successful runner exit.

## Goals

- Preserve every Local Agent action/result boundary as it happens, including failed runner exits.
- Insert an explicit `bootstrap` phase between repository creation and normal Agent waves.
- Use a bounded, deterministic scaffold profile instead of parsing arbitrary PM prose.
- Keep existing repository, branch, review, PR, merge, and release evidence gates intact.
- Preserve compatibility with older snapshots/plans that do not contain a scaffold profile.

## Non-goals

- Do not generate full product functionality during bootstrap.
- Do not replace Frontend/Backend implementation Agents.
- Do not infer completion from prepared scaffold files alone.
- Do not add a second LLM bootstrap Agent.