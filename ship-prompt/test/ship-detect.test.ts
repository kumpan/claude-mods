import { expect, test } from 'claude-code/testing'

const submit = async ($: any, on: any, files: { skill?: boolean; doc?: string }) => {
  let context: readonly string[] = []
  on('session.root', () => ({ value: '/repo' }))
  on('fs.exists', (_: any, e: any) => ({ value: !!files.skill && e.path === '/repo/.claude/skills/ship/SKILL.md' }))
  on('fs.ancestors', () => ({ value: files.doc ? [{ dir: '/repo', name: 'CLAUDE.md', content: files.doc }] : [] }))
  on('prompt.submit', (_: any, e: any) => { context = e.context ?? []; return { text: e.text } })
  await $.prompt.submit({ text: 'fix the bug' })
  return context.some(c => c.startsWith('# Shipping a finished change'))
}

test('asks in a repo with no ship flow', async ($, on) => {
  expect(await submit($, on, { doc: 'Use pnpm. Open a PR when done.' })).toBe(true)
})

test('skips when the repo has a ship skill', async ($, on) => {
  expect(await submit($, on, { skill: true })).toBe(false)
})

test('skips when CLAUDE.md names a ship command', async ($, on) => {
  expect(await submit($, on, { doc: 'Never open a PR unprompted — only via the `/ship` skill.' })).toBe(false)
})

test('a /releases path is not a ship command', async ($, on) => {
  expect(await submit($, on, { doc: 'See apps/web/releases and /releases/123.' })).toBe(true)
})
