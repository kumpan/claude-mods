# ship-prompt

Once Claude finishes a change in a git repo, it asks how to ship it, with four options:

- **Push to main**: commit, merge the latest main, run the project's checks, push to main.
- **Create a PR**: commit on a branch (a new one if you're on main), push it, open a PR with `gh`.
- **PR + auto-merge**: the same, then turn on auto-merge.
- **I'll verify first**: stop and say how to check it (the dev server URL where there is one).

```
/plugin install ship-prompt@kumpan-mods
```

## When it asks

Only after a finished change: files edited and checked, and nothing left to ask you. It doesn't ask after a turn that only answered a question or investigated, partway through a change, when you already said how to ship, or inside a subagent. Your answer covers that one change.

Your repo's own rules about pushing and PRs (in `CLAUDE.md`, for example) still apply on top of the option you pick.

## Repos with their own ship flow

It stays quiet in a repo that already decides how changes ship. It checks the session's project root for:

- a skill or command named `ship`, `deploy` or `release`: `.claude/skills/<name>/SKILL.md` or `.claude/commands/<name>.md`;
- a `CLAUDE.md`, `AGENTS.md` or `.claude/CLAUDE.md`, in the project or any folder above it, mentioning `/ship`, `/deploy` or `/release`.

The check goes by names and wording. A repo that ships some other way still gets the question; add a line mentioning `/ship` to its `CLAUDE.md` to turn it off there.

## Good to know

- It needs git and, for the PR options, the GitHub CLI (`gh`) signed in.
- "Push to main" pushes straight to main. Skip that option in repos with branch protection.
- It adds its instructions on every prompt you send (not on slash commands), which costs a few hundred tokens per prompt.

## Files

- `hooks/register.ts`: the hook and the repo check.
- `test/ship-detect.test.ts`: tests for the repo check (`claude plugin test ship-prompt`).
