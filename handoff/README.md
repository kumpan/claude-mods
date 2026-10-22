# handoff

Replaces Claude Code's compaction summary with a structured handoff, and **asks you before Claude carries on working** after a compaction.

```
/plugin install handoff@kumpan-mods
```

Based on [trytofly94/handoff-compact](https://github.com/trytofly94/handoff-compact) (MIT). The difference: after an automatic compaction, Claude Code normally keeps working straight away from the summary. Here it stops at its first tool call and asks.

## What happens on a compaction

Whenever Claude Code compacts (automatically when the context fills up, or when you run `/compact`):

1. A fork of the session writes a handoff along a fixed outline: goal, state and what proves it, in progress, next step, decisions and reasons, ruled out, open questions, files and commits, how to verify. The fork reads the conversation from the prompt cache and has no tools.
2. Your last 10 prompts and Claude's last 10 answers are added word for word (answers shortened).
3. The conversation is replaced by that one message, and a copy is saved to `~/.claude/handoffs/<session>-<time>.md`. A toast shows the path.
4. The first time Claude tries to use a tool afterwards, you get a question: **Continue** or **Stop and wait**.
   - **Continue**: it carries on from the handoff.
   - **Stop and wait**: every tool is refused until you write again. Claude says in two lines where things stand and waits.
   - If you type something yourself instead, that counts as your answer: no question.

Text after `/compact` (e.g. `/compact keep the test plan`) is passed to the fork as what to stress.

## Good to know

- **If the fork fails** (cold cache, API error), Claude Code compacts the usual way, told to follow the same outline. You still get the question afterwards.
- **Headless runs** (`claude -p`, scheduled jobs): there is nobody to answer, so it stops. Don't install it where sessions must carry on unattended.
- **Subagents** compact their own transcripts the usual way and are never asked about.
- Claude Code's background pre-compaction is turned off, since its result would be thrown away.
- The handoff costs one model call over the cached conversation, about what Claude Code's own summary costs.
- Handoff files are never cleaned up; delete old ones in `~/.claude/handoffs` when you like.
- Prompts from before an earlier compaction are not carried into the next handoff's word-for-word part; the handoff text itself carries them on.

## Files

- `hooks/register.ts`: the compaction hook, the question, and the tool gate.
- `test/handoff.test.ts`: tests (`claude plugin test handoff`).
- `LICENSE`: MIT, from handoff-compact.
