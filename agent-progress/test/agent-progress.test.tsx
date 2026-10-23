import { expect, test } from 'claude-code/testing'

const PLUGIN = 'agent-progress'
const TOOL = 'mcp__agent-progress__progress'
const band = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} } as never
const pane = { title: 'Agents', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as never

test('the progress tool keeps counters per title and bounds its input', async $ => {
  expect(await $.tool.call({ tool: TOOL, title: 'Ship it', total: 4, done: 0 } as never)).toMatchObject({ result: 'ok: Ship it 0/4' })
  expect(await $.tool.call({ tool: TOOL, done: 9 } as never)).toMatchObject({ result: 'ok: Ship it 4/4' })
  expect(await $.tool.call({ tool: TOOL, title: 'Next', total: 1e9 } as never)).toMatchObject({ result: 'ok: Next 0/200' })
  expect(await $.tool.call({ tool: TOOL, finished: true } as never)).toMatchObject({ result: 'ok: Next Done' })
  const hijack: any = await $.tool.call({ tool: TOOL, agentId: 'a1', title: 'Hijack' } as never)
  expect(hijack.result).toMatch(/^ignored/)
})

test('a turn that ends with the bar unfinished clears it', async ($, on) => {
  on('turn.complete', () => ({ text: 'ok' }) as never)
  await $.tool.call({ tool: TOOL, title: 'Stuck', total: 3, done: 0 } as never)
  await $.turn.complete({ reason: 'answer', answer: 'done' } as never)
  expect(await $.tool.call({ tool: TOOL, done: 1 } as never)).toMatchObject({ result: 'ok: Progress 1' })
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: band shows once progress is reported, pane draws empty`, async ($, on) => {
    // Stands for the engine's own drawing beneath the plugin.
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    const quiet = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    expect(await quiet.findAll({ type: 'Svg' })).toHaveLength(0)
    await quiet.unmount()

    await $.tool.call({ tool: TOOL, title: 'Ship it', total: 4, done: 1 } as never)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    if (surface === 'desktop') {
      const [row] = await ui.findAll({ type: 'Svg' })
      expect(String(row?.props.source)).toContain('Ship it')
      expect(row?.props.alt).toBe('Ship it: 1/4  25%')
    } else {
      expect(await ui.find({ type: 'Text', text: /1\/4  25%/ })).toBeDefined()
    }
    expect(await ui.find({ key: 'dismiss' })).toBeDefined()
    await ui.unmount()

    const p = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'agent-progress', props: pane })
    expect(await p.find({ type: 'Text', text: /No subagents yet/ })).toBeDefined()
    await p.unmount()
  })
}
