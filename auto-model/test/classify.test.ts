import { expect, test } from 'claude-code/testing'
import { classify } from '../hooks/register'

test('picks model and effort by prompt', () => {
  expect(classify('fix the typo in README').model).toContain('haiku')
  expect(classify('make the button padding bigger').model).toContain('sonnet')
  expect(classify('refactor the auth flow across the codebase').model).toContain('opus')
  expect(classify('add a users endpoint').model).toContain('sonnet')
})
