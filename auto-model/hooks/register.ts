import type { Register } from 'claude-code'

type Pick = { model: string; effort: 'low' | 'medium' | 'high' | 'xhigh' }

const HAIKU = 'claude-haiku-5-5'
const SONNET = 'claude-sonnet-5-5'
const OPUS = 'claude-opus-5-5'

const HARD = /\b(architect\w*|refactor\w*|migrat\w*|race condition|deadlock|security|vulnerab\w*|root cause|investigate|performance|optimi[sz]e|design (the|a) |from scratch|across (the )?(repo|codebase)|why (is|does|doesn'?t|isn'?t)|debug\w*|concurren\w*|algorithm)\b/i
const UI = /\b(ui|ux|css|tailwind|style[sd]?|layout|button|modal|component|responsive|frontend|front-end|html|page|animation|colou?r|font|padding|margin|dark mode|figma|screen)\b/i
const EASY = /\b(typo|rename|commit message|what (is|does)|explain|list|format|lint|summari[sz]e|translate|add a comment|bump|git (status|log|diff))\b/i

// ponytail: keyword heuristic, swap for a $.model.complete haiku classifier if it misjudges too often
export const classify = (text: string): Pick => {
  const t = text.trim()
  if (HARD.test(t) || t.length > 800) return { model: OPUS, effort: 'high' }
  if (UI.test(t)) return { model: SONNET, effort: 'medium' }
  if (t.length < 120 && EASY.test(t)) return { model: HAIKU, effort: 'low' }
  return { model: SONNET, effort: 'medium' }
}

export const register: Register = on => {
  let pick: Pick | undefined

  on('prompt.submit', ($, e, next) => {
    if (!e.command && !e.isMeta && e.text.trim()) {
      pick = classify(e.text)
      $.ui.status(`auto: ${pick.model.replace('claude-', '')} · ${pick.effort}`)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    return yield* next(pick && e.agentId === undefined ? { ...e, model: pick.model, effort: pick.effort } : e)
  })
}
