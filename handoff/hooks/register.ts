import type { Engine, Register, SessionMessage } from 'claude-code'

// A compaction replaces the conversation with one handoff message written along this outline,
// instead of Claude Code's generic summary. Based on trytofly94/handoff-compact (MIT).
const OUTLINE = [
  '1. GOAL: what should exist at the end, in one sentence.',
  '2. STATE: what is done, and what proves it (test, command, commit).',
  '3. IN PROGRESS: which step, which file, and why this one.',
  '4. NEXT STEP: concrete enough for a stranger to carry out.',
  '5. DECISIONS AND REASONS: what the code itself does not tell.',
  '6. RULED OUT: approaches tried or rejected, so nobody tries them again.',
  '7. BLOCKED / OPEN QUESTIONS: including what you meant to ask the user.',
  '8. FILES AND COMMITS TOUCHED.',
  '9. VERIFY: the command that shows whether the state is what this says.',
]
const KEEP_VERBATIM = 10
const PREFIX = '[handoff]'

const FORK_PROMPT = [
  'Write the handoff for this session NOW. It is about to replace the entire conversation;',
  'whatever it leaves out is gone afterwards. Use no tools, reply with the handoff only.',
  'Prefer exact paths, commands, commit hashes and numbers over descriptions.',
  'The latest user message wins: if it changes the task or the plan, the next step follows it.',
  'Write in the language the conversation is in.',
  '',
  'Outline. Every section must appear, with "nothing" if that is the answer:',
  ...OUTLINE,
].join('\n')

const stripReminders = (t: string) => t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
const clip = (t: string, max: number) => (t.length > max ? t.slice(0, max) + ' […]' : t)

// The latest prompts and answers word for word: the part that does not depend on the model remembering.
// ponytail: an earlier handoff's own tail is not carried over, so prompts older than the last compaction drop out.
export const verbatimTail = (messages: readonly SessionMessage[]) => {
  const prompts: string[] = []
  const answers: string[] = []
  for (const m of messages) {
    const text = stripReminders(m.text ?? '')
    if (!text || text.startsWith(PREFIX)) continue
    if (m.role === 'user' && !m.toolResults?.length) prompts.push(clip(text, 1000))
    if (m.role === 'assistant') answers.push(clip(text, 600))
  }
  return { prompts: prompts.slice(-KEEP_VERBATIM), answers: answers.slice(-KEEP_VERBATIM) }
}

const buildHandoff = async ($: Engine, messages: readonly SessionMessage[], trigger: string, instructions?: string) => {
  const fork = await $.model.fork({
    prompt: FORK_PROMPT + (instructions ? '\n\nWhen compacting, the user asked to stress: ' + instructions : ''),
  })
  if (!fork.isAnswered || !fork.text?.trim()) return null
  const tail = verbatimTail(messages)
  const now = new Date().toISOString()
  const doc = [
    `# Handoff ${now} (${trigger})`,
    '',
    fork.text.trim(),
    '',
    `## Last ${tail.prompts.length} user prompts (verbatim, oldest first)`,
    ...tail.prompts.map(t => '> ' + t.replace(/\n/g, '\n> ') + '\n'),
    `## Last ${tail.answers.length} answers (shortened, oldest first)`,
    ...tail.answers.map(t => '- ' + t.replace(/\n/g, ' ')),
  ].join('\n')

  // A copy for people; the message below carries the handoff even when this fails.
  const path = `${await $.env.get('HOME')}/.claude/handoffs/${await $.session.id()}-${now.replace(/[:.]/g, '-')}.md`
  const saved = await $.fs.write(path, doc + '\n').then(() => true, () => false)
  return {
    path: saved ? path : undefined,
    message: `${PREFIX} This session was compacted. The handoff below replaces the earlier conversation${saved ? ` (saved at ${path})` : ''}.\n\n${doc}`,
  }
}

export const register: Register = on => {
  // After a compaction the first tool call asks the user before Claude carries on.
  // 'ask' until answered; 'stopped' denies every tool until the user writes again.
  let gate: { state: 'ask' | 'stopped'; path?: string } | undefined
  let asking: Promise<boolean> | undefined

  on('session.compact', async ($, e, next) => {
    if (e.agentId) return next(e) // subagents compact their own transcript the usual way
    if (e.trigger === 'precompute') return { skip: 'handoff writes the handoff at compaction time' }
    const handoff = await buildHandoff($, e.messages, e.trigger, e.instructions).catch(err => { $.ui.log('handoff: ' + String(err), { to: 'debug' }); return null })
    gate = { state: 'ask', path: handoff?.path }
    if (!handoff) {
      // Fork failed (cold cache, API error): Claude Code summarizes, along the outline.
      const outline = 'Structure the summary exactly along these sections:\n' + OUTLINE.join('\n')
      return next({ ...e, instructions: e.instructions ? e.instructions + '\n\n' + outline : outline })
    }
    $.ui.toast('Compacted into a handoff' + (handoff.path ? ': ' + handoff.path : ''))
    return { messages: [{ role: 'user', text: handoff.message, toolUses: [] }] }
  })

  // Anything the user types themselves is their go-ahead or new direction: no question needed.
  on('prompt.submit', ($, e, next) => {
    if (!e.command && !e.isMeta) gate = undefined
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (!gate || e.agentId || e.tool === 'AskUserQuestion') return next(e)
    if (gate.state === 'ask') {
      // Parallel tool calls share one question.
      const question = `Context was compacted into a handoff${gate.path ? ` (${gate.path})` : ''}. Let Claude continue working from it?`
      asking ??= $.ui
        .ask(question, { header: 'Handoff', options: ['Continue', 'Stop and wait'] })
        .then(a => a === 'Continue', () => false) // dismissed, or nobody to ask: stop
      const go = await asking
      asking = undefined
      gate = go ? undefined : { ...gate, state: 'stopped' }
      if (go) return next(e)
    }
    return {
      deny: 'The user chose to stop after the context was compacted. Run no tools. Say in two lines where things stand (from the handoff) and wait for their next message.',
    }
  })
}
