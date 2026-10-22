import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode } from 'claude-code'

import type { AgentRun, Flow } from '../types'

// A plain take on johnnyvizz/claude-kit's savvy-progress: the same bar and panel,
// without the crabs, the twinkle or the grid. Claude's own palette, nothing moves.

const flow = atom({ plugin: 'agent-progress', key: 'flow' } as const, null)
const agents = atom({ plugin: 'agent-progress', key: 'agents' } as const, [])
const isDoneCollapsed = atom({ plugin: 'agent-progress', key: 'isDoneCollapsed' } as const, false)
const now = atom({ plugin: 'agent-progress', key: 'now' } as const, 0)

const TOOL = 'mcp__agent-progress__progress'
const PANE = 'agent-progress'
// The tool's schema is advice to the model, not a check: what a call may ask the band to draw is bounded here.
const MAX_TOTAL = 200
const MAX_TITLE = 120

const CLAY = '#D97757'
const OLIVE = '#788C5D'
const RED = '#BF4D43'
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"
const CSS = `<style>
.t{fill:#141413}.m{fill:#73726C}.k{fill:#E8E6DC}.ln{stroke:#E8E6DC}
@media (prefers-color-scheme: dark){.t{fill:#FAF9F5}.m{fill:#A3A19A}.k{fill:#3D3D3A}.ln{stroke:#3D3D3A}}
</style>`

type ProgressInput = { title?: string; total?: number; done?: number; finished?: boolean; steps?: string[] }

const MAX_STEP = 80

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, max - 1) + '…' : s)

const isNewFlow = (prev: Flow | null, input: ProgressInput): boolean =>
  !prev || prev.isFinished || (input.title !== undefined && clip(input.title.trim(), MAX_TITLE) !== prev.title)

const merge = (prev: Flow | null, input: ProgressInput): Flow => {
  // A new title is a new bar: counters never carry over from an earlier one.
  const base: Flow = !prev || isNewFlow(prev, input) ? { title: 'Progress', total: 0, done: 0, isFinished: false, steps: [] } : prev
  const steps = Array.isArray(input.steps) ? input.steps.slice(0, MAX_TOTAL).map(s => clip(String(s).trim(), MAX_STEP)) : base.steps
  // Named steps fix the total; without them the model's number stands.
  const total = steps.length ? steps.length : Math.min(MAX_TOTAL, Math.max(0, Math.round(input.total ?? base.total)))
  const done = Math.min(total || Infinity, Math.max(0, Math.round(input.done ?? base.done)))
  return {
    title: clip(input.title?.trim() || base.title, MAX_TITLE),
    total,
    done: input.finished ? total : done,
    isFinished: input.finished === true,
    steps,
  }
}

const ratio = (f: Flow): number => (f.isFinished ? 1 : f.total ? f.done / f.total : 0)
const count = (f: Flow): string => (f.isFinished ? 'Done' : f.total ? `${f.done}/${f.total}` : `${f.done}`)

// ---------------------------------------------------------------------------
// Cost: an estimate from token counts. USD per million tokens: input, output,
// cache read, cache write (1-hour rate, what Claude Code writes on a subscription).
// The first row that matches the model id wins, so a release sits above its family.

type Price = [input: number, output: number, cacheRead: number, cacheWrite: number]
type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

const PRICES: [RegExp, Price][] = [
  [/(fable|mythos)-5-1/, [10, 50, 0.25, 20]],
  [/fable|mythos/, [10, 50, 1, 20]],
  [/opus-5-5/, [4, 20, 0.2, 8]],
  [/opus/, [5, 25, 0.5, 10]],
  [/sonnet-5-5/, [2, 10, 0.1, 4]],
  [/sonnet-5/, [2, 10, 0.2, 4]],
  [/sonnet/, [3, 15, 0.3, 6]],
  [/haiku-5-5/, [0.1, 0.5, 0.01, 0.2]],
  [/haiku/, [1, 5, 0.1, 2]],
]

const promptOf = (u: Usage): number => (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
const tokensOf = (u: Usage): number => promptOf(u) + (u.output_tokens || 0)

// ponytail: Haiku 5.5's long-prompt price tier is left out, so a 100k+ prompt there is underestimated.
const costOf = (model: string, u: Usage): number => {
  const [i, o, r, w] = PRICES.find(([re]) => re.test(model.toLowerCase()))?.[1] ?? [4, 20, 0.2, 8]
  return ((u.input_tokens || 0) * i + (u.output_tokens || 0) * o + (u.cache_read_input_tokens || 0) * r + (u.cache_creation_input_tokens || 0) * w) / 1e6
}

// Haiku 4.5 and the Claude 3 models have a 200K window; the rest 1M.
const windowOf = (model: string): number => (/haiku-4|claude-3/i.test(model) ? 200_000 : 1_000_000)

const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  if (!m) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '—'
  const [, family = '', major = '', minor] = m
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}${minor ? '.' + minor : ''}`
}

const runModel = (a: AgentRun): string => (a.effort ? `${modelName(a.model)} · ${a.effort}` : modelName(a.model))

const fmtTokens = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`)
const fmtCost = (usd: number): string => `≈$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`
const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = String(Math.floor((s % 3600) / 60))
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${m.padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const elapsed = (a: AgentRun, at: number): number => (a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt
const ctxOf = (a: AgentRun): number => (a.contextMax ? Math.min(100, Math.round((a.contextTokens / a.contextMax) * 100)) : 0)

const summary = (list: AgentRun[], at: number): string => {
  const cost = list.reduce((s, a) => s + a.costUsd, 0)
  const tokens = list.reduce((s, a) => s + a.tokens, 0)
  const start = Math.min(...list.map(a => a.startedAt))
  const end = Math.max(...list.map(a => a.endedAt ?? Math.max(at, a.startedAt)))
  return `${fmtCost(cost)} · ${fmtTokens(tokens)} tokens · ${fmtTime(list.length ? end - start : 0)}`
}

// ---------------------------------------------------------------------------
// Desktop drawings. The desktop wraps sibling elements onto new lines, so each row is one SVG.

const xml = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// CJK, fullwidth forms and emoji advance about 1em.
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿가-힣豈-﫿！-｠\u{1F300}-\u{1FAFF}]/u
const charEm = (ch: string): number => (WIDE.test(ch) ? 1 : /[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-Zmw@%]/.test(ch) ? 0.72 : 0.56)
const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

// Claude's eight-ray mark.
const spark = (cx: number, cy: number, r: number, color: string): string => {
  const d = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4
    const p = (k: number) => `${(cx + Math.cos(a) * r * k).toFixed(2)} ${(cy + Math.sin(a) * r * k).toFixed(2)}`
    return `M${p(0.3)}L${p(1)}`
  }).join('')
  return `<path d="${d}" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/>`
}

const svg = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${CSS}${body}</svg>`

const BAND_H = 22

// `progress` null draws no bar: subagents running with no reported flow.
const bandSvg = (W: number, title: string, progress: number | null, right: string, color: string): string => {
  const y = BAND_H / 2 + 4.5
  const rightW = textWidth(right, 12.5)
  const t = fitText(title, 13, progress === null ? W - rightW - 40 : Math.max(60, W * 0.4))
  const barX = Math.round(20 + textWidth(t, 13) + 14)
  const barW = Math.max(40, W - barX - rightW - 14)
  const bar =
    progress === null
      ? ''
      : `<rect class="k" x="${barX}" y="${BAND_H / 2 - 2}" width="${barW}" height="4" rx="2"/><rect x="${barX}" y="${BAND_H / 2 - 2}" width="${Math.round(barW * progress)}" height="4" rx="2" fill="${color}"/>`
  return svg(
    W,
    BAND_H,
    `${spark(7, BAND_H / 2, 6, color)}
<text class="t" x="20" y="${y}" font-family="${FONT}" font-size="13" font-weight="500">${xml(t)}</text>
${bar}
<text class="m" x="${W}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="12.5" font-variant-numeric="tabular-nums">${xml(right)}</text>`,
  )
}

const ROW_H = 54

const statusMark = (status: AgentRun['status']): string => {
  if (status === 'running') return spark(7, 15, 5.5, CLAY)
  if (status === 'done') return `<path d="M2.5 15l3.2 3.2 6-6.5" fill="none" stroke="${OLIVE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  return `<path d="M3.5 11.5l7 7M10.5 11.5l-7 7" stroke="${RED}" stroke-width="1.8" stroke-linecap="round"/>`
}

const agentSvg = (W: number, a: AgentRun, at: number): string => {
  const time = fmtTime(elapsed(a, at))
  const stats = `ctx ${ctxOf(a)}% · ${fmtTokens(a.contextTokens)} · ${fmtCost(a.costUsd)}`
  const meta = `${a.type} · ${runModel(a)}${a.status === 'failed' ? ' · error' : ''}`
  const textW = W - 20
  const ctxW = Math.round(textW * (ctxOf(a) / 100))
  return svg(
    W,
    ROW_H,
    `${statusMark(a.status)}
<text class="t" x="20" y="19" font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(a.description || a.type, 13, textW - textWidth(time, 12) - 12))}</text>
<text class="m" x="${W}" y="19" text-anchor="end" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">${time}</text>
<text class="m" x="20" y="35" font-family="${FONT}" font-size="11">${xml(fitText(meta, 11, textW - textWidth(stats, 11) - 12))}</text>
<text class="m" x="${W}" y="35" text-anchor="end" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${stats}</text>
<rect class="k" x="20" y="42" width="${textW}" height="3" rx="1.5"/><rect class="m" x="20" y="42" width="${ctxW}" height="3" rx="1.5"/>
<line class="ln" x1="0" y1="${ROW_H - 0.5}" x2="${W}" y2="${ROW_H - 0.5}"/>`,
  )
}

// The checklist under the bar: finished steps fold into one line, the current one is bold, the rest follow.
// A window of `maxRows` lines keeps the current step in view whatever the plan's length.
type StepRow = { text: string; color?: string; dim?: boolean; bold?: boolean }
const stepList = (f: Flow, maxRows = 6): StepRow[] => {
  if (f.steps.length === 0) return []
  const cur = Math.min(f.done, f.steps.length - 1)
  const rows = Math.max(3, Math.min(maxRows + 4, 10))
  const head: StepRow[] = f.done > 0 ? [{ text: `✓ ${f.done} done`, color: OLIVE }] : []
  const room = rows - head.length
  const rest = f.steps.slice(cur)
  const shown = rest.slice(0, rest.length > room ? room - 1 : room)
  const more: StepRow[] = rest.length > shown.length ? [{ text: `… ${rest.length - shown.length} more`, dim: true }] : []
  return [
    ...head,
    ...shown.map((t, i): StepRow => (i === 0 ? { text: `✻ ${t}`, color: CLAY, bold: true } : { text: `○ ${t}`, dim: true })),
    ...more,
  ]
}

// Terminal bar.
const bar = (r: number, width: number): string => {
  const filled = Math.round(width * r)
  return '━'.repeat(filled) + '─'.repeat(Math.max(0, width - filled))
}

const GLYPH: Record<AgentRun['status'], string> = { running: '✻', done: '✓', failed: '✗' }
const COLOR: Record<AgentRun['status'], string> = { running: CLAY, done: OLIVE, failed: RED }

async function openPane($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, now, () => at)
  await $.ui.open({ id: PANE, title: 'Agents' })
}

// Opens the pane, or closes it when it is up; true when it ends up open.
async function togglePane($: EngineInterface): Promise<boolean> {
  if ((await $.ui.panes()).some(p => p.id === PANE)) {
    await $.ui.close({ id: PANE })
    return false
  }
  await openPane($)
  return true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.tool.register({
      name: 'progress',
      description:
        'Show progress in a bar above the prompt. Call it at the start of EVERY request that edits files or runs commands, even small ones ' +
        '(title, steps: the ordered step names, done: 0), again as each step finishes (done: how many are finished; the next one is shown as in progress), ' +
        'and once at the end with finished: true. The steps stay on screen under the bar. Skip it only for pure Q&A. ' +
        'Fields left out keep their value; a new title starts a new bar. Main session only: a call from a subagent is ignored.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The overall task, a few words.' },
          steps: { type: 'array', items: { type: 'string' }, description: 'Every step in order, short imperative phrases. Replaces the list; send it when the plan changes.' },
          total: { type: 'integer', minimum: 0, description: 'Number of steps planned, when steps are not named.' },
          done: { type: 'integer', minimum: 0, description: 'Number of steps finished.' },
          finished: { type: 'boolean', description: 'True once the work is complete.' },
        },
      },
      // Listed up front: the model does not go looking for a progress tool.
      isDeferred: false,
    })
    await $.command.register({
      name: 'agents-panel',
      description: 'Show or hide the panel of subagents: running and finished, with model, context, estimated cost and time',
    })
    // Ticks the running agents' clocks; quiet when nothing runs.
    $.clock.every(1000, () => {
      void (async () => {
        if (!(await read($, agents)).some(a => a.status === 'running')) return
        const at = await $.clock.now()
        await update($, now, () => at)
      })()
    })
    return started
  })

  on('command.run', { command: 'agents-panel' }, async ($, e) => {
    if ((e.args ?? '').trim() === 'open') {
      await openPane($)
      return { text: 'Agents panel opened.' }
    }
    return { text: (await togglePane($)) ? 'Agents panel opened.' : 'Agents panel closed.' }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    // A worker cannot rename, finish or reset the main session's bar.
    if (e.agentId) return { result: 'ignored: only the main session reports progress' }
    const next = await update($, flow, p => merge(p, e as unknown as ProgressInput))
    return { result: next ? `ok: ${next.title} ${count(next)}` : 'ok' }
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined) return started
    const at = await $.clock.now()
    await update($, agents, list => {
      const run: AgentRun = {
        id: started.agentId ?? e.tool_use_id,
        agentId: started.agentId,
        type: e.subagentType,
        description: e.description,
        model: started.model,
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: windowOf(started.model),
        tokens: 0,
        costUsd: 0,
        steps: 0,
      }
      return [...list.filter(a => a.id !== run.id), run].slice(-200)
    })
    await update($, now, () => at)
    return started
  })

  // Each model request of a subagent: live context, tokens and cost.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const usage = result.usage
    if (!e.agentId || !usage) return result
    const model = usage.model || e.model
    await update($, agents, list =>
      list.map(
        (a): AgentRun =>
          a.agentId !== e.agentId
            ? a
            : {
                ...a,
                model,
                effort: typeof e.effort === 'string' ? e.effort : a.effort,
                status: 'running',
                endedAt: undefined,
                contextTokens: tokensOf(usage),
                contextMax: windowOf(model),
                tokens: a.tokens + tokensOf(usage),
                costUsd: a.costUsd + costOf(model, usage),
                steps: a.steps + 1,
              },
      ),
    )
    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      const at = await $.clock.now()
      await update($, agents, list =>
        list.map((a): AgentRun => {
          if (a.agentId !== e.agentId) return a
          // A run whose steps went unseen still gets the turn's own sum.
          const sum = a.steps === 0 && e.usage ? { model: e.usage.model || a.model, tokens: tokensOf(e.usage), costUsd: costOf(e.usage.model || a.model, e.usage) } : {}
          return { ...a, ...sum, status: e.reason === 'answer' ? 'done' : 'failed', endedAt: at }
        }),
      )
      await update($, now, () => at)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, agents)
    const f = await read($, flow)
    const isCollapsed = await read($, isDoneCollapsed)
    const at = Math.max(await read($, now), ...list.map(a => a.startedAt), 0)
    const running = list.filter(a => a.status === 'running').reverse()
    const finished = list.filter(a => a.status !== 'running').reverse()

    const toggleDone = (
      <Button
        key="done"
        label={`${isCollapsed ? '▸' : '▾'} Finished · ${finished.length}`}
        plain
        onPress={() => update($, isDoneCollapsed, v => !v)}
      />
    )

    let row: (a: AgentRun) => RenderNode
    if (e.surface === 'desktop' && 'Svg' in ui) {
      const { Svg } = ui
      const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 40) * 8 - 8))
      row = a => <Svg key={a.id} source={agentSvg(W, a, at)} alt={`${a.description}: ${modelName(a.model)}, ${a.status}`} width={W} height={ROW_H} />
    } else {
      const barW = Math.max(6, Math.min(20, (e.props.bodyColumns || 40) - 34))
      row = a => (
        <Box key={a.id} flexDirection="column" marginBottom={1}>
          <Text wrap="truncate-end">
            <Text color={COLOR[a.status]}>{GLYPH[a.status]}</Text> <Text bold>{a.description || a.type}</Text>
          </Text>
          <Text dimColor wrap="truncate-end">
            {'  '}
            {a.type} · {runModel(a)}
            {a.status === 'failed' ? ' · error' : ''}
          </Text>
          <Text dimColor wrap="truncate-end">
            {'  '}
            {bar(ctxOf(a) / 100, barW)} ctx {ctxOf(a)}% · {fmtTokens(a.contextTokens)} {fmtCost(a.costUsd)} {fmtTime(elapsed(a, at))}
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {f && !f.isFinished && <Text bold wrap="truncate-end">{f.title}</Text>}
        <Text dimColor>{summary(list, at)}</Text>
        {list.length === 0 && <Text dimColor>No subagents yet.</Text>}
        {running.length > 0 && <Text dimColor>Running · {running.length}</Text>}
        {running.map(row)}
        {finished.length > 0 && toggleDone}
        {!isCollapsed && finished.map(row)}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const f = await read($, flow)
    const list = await read($, agents)
    const runningCount = list.filter(a => a.status === 'running').length
    if ((f === null && runningCount === 0) || e.props.hasSurvey) return next(e)
    // Other mods' bands go beneath this row. Claude Code's own placeholder ({ type: 'engine' }) is never nested.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const color = f?.isFinished ? OLIVE : CLAY
    const title = f?.title ?? 'Subagents'
    const right = f ? `${count(f)}  ${Math.round(ratio(f) * 100)}%` : `${runningCount} running`
    const stepRows = f && !f.isFinished ? stepList(f, e.props.maxRows) : []
    const stepsView = stepRows.length > 0 && (
      <Box flexDirection="column" marginLeft={2}>
        {stepRows.map((r, i) => (
          <Text key={i} wrap="truncate-end" color={r.color} dimColor={r.dim} bold={r.bold}>
            {r.text}
          </Text>
        ))}
      </Box>
    )
    const agentsButton = list.length > 0 && <Button key="agents" label={`Agents ${list.length}`} plain onPress={() => void togglePane($)} />
    const dismiss = f && <Button key="dismiss" label="✕" plain role="dismiss" onPress={() => update($, flow, () => null)} />

    // The terminal's element table is completed with an `Svg` that draws nothing: test the surface too.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const width = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 120))
      return (
        <Box flexDirection="column">
          {/* The Svg's width is a guess from bodyColumns; space-between keeps the buttons at the band's right edge anyway. */}
          <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap={1}>
            <Svg source={bandSvg(width, title, f ? ratio(f) : null, right, color)} alt={`${title}: ${right}`} width={width} height={BAND_H} />
            <Box flexDirection="row" alignItems="center" gap={1}>
              {agentsButton}
              {dismiss}
            </Box>
          </Box>
          {stepsView}
          {below}
        </Box>
      )
    }

    const cols = e.props.bodyColumns
    const titleW = Math.max(8, Math.min(30, title.length + 2, Math.floor(cols / 3)))
    const width = Math.max(6, Math.min(40, cols - titleW - 34))
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Box width={titleW} flexShrink={0}>
            <Text color={color}>✻ </Text>
            <Text wrap="truncate-end">{title}</Text>
          </Box>
          {f && <Text color={color}>{bar(ratio(f), width)}</Text>}
          <Text dimColor>{right}</Text>
          {agentsButton}
          {dismiss}
        </Box>
        {stepsView}
        {below}
      </Box>
    )
  })
}
