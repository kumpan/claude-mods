# Kumpan Claude Code mods

A plugin marketplace of Claude Code mods. Each mod is its own folder with a `.claude-plugin/plugin.json`, and every one is listed in `.claude-plugin/marketplace.json`.

## Install

At the Claude Code prompt:

```
/plugin marketplace add kumpan/claude-mods
/plugin install ship-prompt@kumpan-mods
```

From a shell:

```bash
claude plugin marketplace add kumpan/claude-mods
claude plugin install ship-prompt@kumpan-mods
```

Restart Claude Code after installing. The repo is private, so you need read access to `kumpan/claude-mods` and git set up for GitHub on your machine.

Get updates with `/plugin marketplace update kumpan-mods`.

## Mods

| Mod | What it does |
| --- | --- |
| [ship-prompt](./ship-prompt) | When a change is finished, asks whether to push to main, open a PR, open a PR with auto-merge, or verify first. Skips repos that already have a ship/deploy/release skill or command, or a `CLAUDE.md` / `AGENTS.md` that mentions `/ship`, `/deploy` or `/release`. |

## Adding a mod

1. Create `<mod-name>/.claude-plugin/plugin.json` (`name`, `version`, `description`), `<mod-name>/hooks/hooks.json` (`{ "modules": ["./register.ts"] }`) and `<mod-name>/hooks/register.ts`. In Claude Code, ask Claude to "make a mod" and it will load the authoring guide.
2. Add an entry to `.claude-plugin/marketplace.json`.
3. Check it: `claude plugin validate <mod-name>` and `claude plugin test <mod-name>`.
4. Raise `version` in its `plugin.json` on every change. Installed copies only update when the version changes.

To work on a mod locally, add this checkout as a marketplace: `claude plugin marketplace add <path to this repo>`.
