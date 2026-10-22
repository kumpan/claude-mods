# Kumpan Claude Code mods

A Claude Code plugin marketplace, `kumpan-mods`. Each mod is a plugin in its own folder, and you install only the ones you want: adding the marketplace installs nothing by itself.

## Mods

| Mod | What it does |
| --- | --- |
| [ship-prompt](./ship-prompt) | When a change is finished, asks whether to push to main, open a PR, open a PR with auto-merge, or verify first. Stays quiet in repos with their own ship flow. |

Each mod's folder has a README with what it does and what to know before installing it.

## Commands

At the Claude Code prompt (the same commands run from a shell as `claude plugin ...`):

| Command | What it does |
| --- | --- |
| `/plugin marketplace add kumpan/claude-mods` | Add this marketplace (once per machine). Installs no mods. |
| `/plugin install <mod>@kumpan-mods` | Install one mod, e.g. `/plugin install ship-prompt@kumpan-mods`. Restart Claude Code after. |
| `/plugin` | Browse the marketplace and your installed plugins. |
| `/plugin marketplace update kumpan-mods` | Fetch the latest version of the marketplace. |
| `/plugin update <mod>@kumpan-mods` | Update an installed mod after the marketplace update. |
| `/plugin disable <mod>@kumpan-mods` | Turn a mod off without removing it (`enable` turns it back on). |
| `/plugin uninstall <mod>@kumpan-mods` | Remove a mod. |
| `/plugin marketplace remove kumpan-mods` | Remove the marketplace. Uninstall its mods first. |

The repo is private: you need read access to `kumpan/claude-mods` and git set up for GitHub on your machine.

Mods from other people come from their own marketplaces and sit side by side with these. Install what you want from each.

## Adding a mod

1. Make a folder `<mod-name>/` with `.claude-plugin/plugin.json` (`name`, `version`, `description`), `hooks/hooks.json` (`{ "modules": ["./register.ts"] }`), `hooks/register.ts`, and a `README.md`. Ask Claude Code to "make a mod" and it loads the authoring guide.
2. Add it to `.claude-plugin/marketplace.json` and to the table above.
3. Check it: `claude plugin validate <mod-name>` and `claude plugin test <mod-name>`.
4. Raise `version` in its `plugin.json` on every change. Installed copies only update when the version changes.

## Working on mods locally

Clone the repo and add the clone as the marketplace instead of GitHub, so your edits load without a push:

```bash
git clone https://github.com/kumpan/claude-mods.git ~/repos/claude-mods
claude plugin marketplace add ~/repos/claude-mods
claude plugin install ship-prompt@kumpan-mods
```

If you had already added the GitHub marketplace, remove it first (`claude plugin marketplace remove kumpan-mods`), since both use the name `kumpan-mods`. After an edit, raise the version and run `claude plugin update <mod>@kumpan-mods`, then restart.
