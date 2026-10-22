import { expect, test } from 'claude-code/testing'

const MESSAGES = [
  { role: 'user', text: 'Fix the login bug', toolUses: [] },
  { role: 'assistant', text: 'Found it in auth.ts', toolUses: [] },
]

// Stands in for the engine: a fork that answers (or not), a session, files and the ask dialog.
const engine = (on: any, opts: { fork?: boolean; answer?: string } = {}) => {
  const seen = { asks: 0, compactInstructions: undefined as string | undefined, ran: [] as string[] }
  on('model.fork', () => ({ value: opts.fork === false ? { isAnswered: false, reason: 'api-error' } : { isAnswered: true, text: '1. GOAL: fix login' } }))
  on('session.messages', () => ({ value: MESSAGES }))
  on('session.id', () => ({ value: 's1' }))
  on('env.get', () => ({ value: '/home/me' }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('session.compact', (_: any, e: any) => {
    seen.compactInstructions = e.instructions
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
  })
  on('tool.call', (_: any, e: any) => {
    if (e.tool === 'AskUserQuestion') {
      seen.asks++
      const answers = { [e.questions[0].question]: opts.answer ?? 'Continue' }
      return { result: { questions: e.questions, answers } }
    }
    seen.ran.push(e.command)
    return { result: {} }
  })
  return seen
}

test('compaction becomes one handoff message', async ($, on) => {
  engine(on)
  const r: any = await $.session.compact({ messages: MESSAGES } as any)
  expect(r.messages).toHaveLength(1)
  expect(r.messages[0].text).toContain('[handoff]')
  expect(r.messages[0].text).toContain('1. GOAL: fix login')
  expect(r.messages[0].text).toContain('> Fix the login bug')
  expect(r.messages[0].text).toContain('/home/me/.claude/handoffs/s1-')
})

test('a failed fork falls back to the outline as instructions', async ($, on) => {
  const seen = engine(on, { fork: false })
  await $.session.compact({ messages: MESSAGES } as any)
  expect(seen.compactInstructions).toContain('NEXT STEP')
})

test('Continue lets the tool run, asked once', async ($, on) => {
  const seen = engine(on, { answer: 'Continue' })
  await $.session.compact({ messages: MESSAGES } as any)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'pwd' })
  expect(seen.asks).toBe(1)
  expect(seen.ran).toEqual(['ls', 'pwd'])
})

test('Stop denies every tool until the user writes again', async ($, on) => {
  const seen = engine(on, { answer: 'Stop and wait' })
  await $.session.compact({ messages: MESSAGES } as any)
  const first: any = await $.tool.call({ tool: 'Bash', command: 'ls' })
  const second: any = await $.tool.call({ tool: 'Bash', command: 'pwd' })
  expect(first.deny).toContain('stop')
  expect(second.deny).toContain('stop')
  expect(seen.asks).toBe(1)
  expect(seen.ran).toEqual([])

  await $.prompt.submit({ text: 'ok go on' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(seen.ran).toEqual(['ls'])
})

test('no question without a compaction', async ($, on) => {
  const seen = engine(on)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(seen.asks).toBe(0)
  expect(seen.ran).toEqual(['ls'])
})
