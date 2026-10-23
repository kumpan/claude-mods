import { expect, test } from 'claude-code/testing'
import { parseQuestions } from '../hooks/register'

test('parseQuestions takes fenced JSON and drops malformed entries', () => {
  const text = '```json\n[{"question":"Which db?","options":["pg","sqlite"]},{"question":"x","options":["only one"]}]\n```'
  expect(parseQuestions(text)).toEqual([{ question: 'Which db?', options: ['pg', 'sqlite'] }])
  expect(parseQuestions('no json here')).toEqual([])
})
