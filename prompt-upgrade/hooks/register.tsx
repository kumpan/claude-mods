import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

const PANE = 'prompt-upgrade'
const upgraded = atom({ plugin: 'prompt-upgrade', key: 'upgraded' } as const, '')

const QUESTIONS_PROMPT = (prompt: string) => [
  'A user wrote this short prompt for a coding assistant:',
  '',
  prompt,
  '',
  'Ask the 2 to 4 questions whose answers would change the result most (scope, constraints, stack, output form, what done looks like).',
  'Skip anything the prompt already says. Each question has 2 to 4 short answer options.',
  'Reply with JSON only: [{"question": "...?", "header": "max 12 chars", "options": ["...", "..."]}]',
].join('\n')

const REWRITE_PROMPT = (prompt: string, answers: [string, string][]) => [
  'Rewrite this short prompt into one detailed prompt for a coding assistant. Keep the user\'s intent and voice, in their language.',
  'Turn their answers into concrete requirements; add goal, context, constraints and what done looks like where the answers support them.',
  'Do not invent facts, file names or requirements nobody gave. Reply with the new prompt only, no preamble.',
  '',
  `Short prompt: ${prompt}`,
  '',
  'Answers:',
  ...(answers.length ? answers.map(([q, a]) => `- ${q} ${a}`) : ['- (none)']),
].join('\n')

type Question = { question: string; header?: string; options: string[] }

// Models wrap JSON in fences or prose; take the outermost array.
export const parseQuestions = (text: string): Question[] => {
  const raw = text.match(/\[[\s\S]*\]/)?.[0]
  if (!raw) return []
  try {
    return (JSON.parse(raw) as Question[])
      .filter(q => q?.question && Array.isArray(q.options) && q.options.length >= 2)
      .slice(0, 4)
      .map(q => ({ ...q, options: q.options.slice(0, 4) }))
  } catch {
    return []
  }
}

const upgrade = async ($: Engine, prompt: string): Promise<string> => {
  const q = await $.model.complete({ model: 'haiku', prompt: QUESTIONS_PROMPT(prompt), effort: 'low', timeoutMs: 30000 })
  const answers: [string, string][] = []
  // A dismissed question rejects: stop asking, rewrite with what we have.
  for (const { question, header, options } of q.isAnswered ? parseQuestions(q.text) : []) {
    const a = await $.ui.ask(question, { options, header: header?.slice(0, 12) }).catch(() => undefined)
    if (a === undefined) break
    answers.push([question, a])
  }
  const r = await $.model.complete({ model: 'sonnet', prompt: REWRITE_PROMPT(prompt, answers), maxTokens: 4000, timeoutMs: 90000 })
  if (!r.isAnswered) throw new Error(`no reply (${r.reason})`)
  return r.text.trim()
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prompt-upgrade',
      description: 'Upgrade a short prompt into a detailed one: /prompt-upgrade <your prompt>',
    })
    return next(e)
  })

  on('command.run', { command: 'prompt-upgrade' }, async ($, e) => {
    const prompt = e.args.trim()
    if (!prompt) return { text: 'Usage: /prompt-upgrade <your short prompt>' }
    $.ui.toast('Upgrading your prompt…')
    try {
      await update($, upgraded, () => '')
      const text = await upgrade($, prompt)
      await update($, upgraded, () => text)
      await $.ui.open({ id: PANE, title: 'Prompt upgrade', focus: true })
      return { text: 'Upgraded prompt is in the Prompt upgrade pane.' }
    } catch (err) {
      return { text: 'Prompt upgrade failed: ' + String(err) }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const text = await read($, upgraded)
    if (!text) return <Text dimColor>Run /prompt-upgrade &lt;prompt&gt; to start.</Text>
    const close = () => $.ui.close({ id: PANE })

    return (
      <Box flexDirection="column" gap={1}>
        <Markdown text={text} />
        <Box gap={1}>
          <Button
            variant="primary"
            onPress={async () => {
              await $.prompt.submit({ text })
              await close()
            }}
          >
            Run
          </Button>
          <Button
            onPress={async () => {
              await $.prompt.fill({ text })
              await close()
            }}
          >
            Edit
          </Button>
          <Button
            onPress={async press => {
              const r = await $.ui.copy({ text, surface: press.surface })
              $.ui.toast(r.isCopied ? 'Copied' : 'Could not copy')
            }}
          >
            Copy
          </Button>
          <Button role="dismiss" onPress={close}>
            Close
          </Button>
        </Box>
      </Box>
    )
  })
}
