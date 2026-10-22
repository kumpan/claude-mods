import type { Engine, Register } from 'claude-code'

const TEXT = `# Shipping a finished change

When you have finished a meaningful change in a git repository (files edited and checked, nothing half done) and you have no open questions for the user, ask with AskUserQuestion, header "Ship", what to do with it. It needs four options, so use AskUserQuestion, not a text question or wrap_up buttons:
- "Push to main": commit, merge the latest main, run the project's checks, push to main.
- "Create a PR": commit on a branch (make one if on main), push it, open a PR with gh.
- "PR + auto-merge": as "Create a PR", then turn on auto-merge (gh pr merge <number> --auto with the repo's merge method, or the app's auto-merge tool where there is one).
- "I'll verify first": stop, and say how to check it (start the dev server and give the URL where there is one).

Ask only then. Don't ask after a turn that only answered, read or investigated; while you still have questions (ask those instead); mid-way through a change; when the user already said how to ship this change; or as a subagent. The answer covers this change only, never later ones. Project or user rules about pushing and PRs still apply on top of the chosen option.`

const SHIP_NAMES = ['ship', 'deploy', 'release']
// ponytail: name + text heuristic; a repo that ships some other way can add `/ship` to its CLAUDE.md to opt out.
const SHIP_MENTION = /(^|[\s`(])\/(ship|deploy|release)\b/m

// The repo has its own way to ship: a ship/deploy/release skill or command, or CLAUDE.md / AGENTS.md naming one.
const repoShipsItself = async ($: Engine) => {
  const root = await $.session.root()
  for (const name of SHIP_NAMES) {
    if (await $.fs.exists(`${root}/.claude/skills/${name}/SKILL.md`)) return true
    if (await $.fs.exists(`${root}/.claude/commands/${name}.md`)) return true
  }
  const docs = await $.fs.ancestors({ names: ['CLAUDE.md', 'AGENTS.md', '.claude/CLAUDE.md'] })
  return docs.some(d => SHIP_MENTION.test(d.content))
}

// prompt.compose would be cleaner, but a team org's built-in security plugin skips user mods there.
export const register: Register = on => {
  on('prompt.submit', async ($, e, next) =>
    e.command || e.isMeta || (await repoShipsItself($))
      ? next(e)
      : next({ ...e, context: [...(e.context ?? []), TEXT] }),
  )
}
