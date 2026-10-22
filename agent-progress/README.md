# agent-progress

A plain progress bar above the prompt for multi-step work, and a panel of subagents.

```
/plugin install agent-progress@kumpan-mods
```

Based on [johnnyvizz/claude-kit's savvy-progress](https://github.com/JohnnyVizz/claude-kit/tree/main/plugins/savvy-progress), without the playful parts: no crabs, no twinkling bar, no dotted grid, no languages but English. Claude's clay and ivory palette, and nothing moves.

## What it shows

- **Progress bar** above the prompt: Claude's mark, the task's title, a thin bar, `done/total` and percent. Under it the step list stays on screen: finished steps folded into one line, the current step in bold, the rest dimmed. It appears when Claude reports progress, or while subagents run (then just `N running`). `✕` hides it until the next report.
- **Agents panel** (`/agents-panel` toggles it, `/agents-panel open` opens it; the `Agents N` button on the bar does the same): running and finished subagents, each with type, model and effort, context fill, tokens, estimated cost and time. Finished ones fold away under their heading.

## The tool it adds

`mcp__agent-progress__progress` (`title`, `steps`, `done`, `finished`; `total` when steps are not named). It is listed up front, so Claude sees it in every request (about 100 tokens) and calls it on every request that edits files or runs commands, even small ones. Only the main session can move the bar; a call from a subagent is ignored.

## Good to know

- Cost is an estimate from token counts and list prices in `hooks/register.tsx` (`PRICES`), not a bill. Cache writes are priced at the 1-hour rate.
- Left out from savvy-progress: per-worker step reports, a compact panel mode, auto-opening the panel.

## Files

- `hooks/register.tsx`: the tool, the bar, the panel.
- `types/index.d.ts`: the state it keeps.
- `test/agent-progress.test.tsx`: tests (`claude plugin test agent-progress`).
