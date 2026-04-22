import { describe, expect, it } from 'vitest'
import { resolveWidgetErrorMessage } from '../widget-error-message'

const fallbackMessage = 'Fallback error'

const options = {
  fallbackMessage,
  contentTooLongMessage: (maxLength: number) => `Too long (${maxLength})`,
}

describe('resolveWidgetErrorMessage', () => {
  it('maps serialized too_big validator payload to readable max-length message', () => {
    const error = new Error(
      '[ { "origin": "string", "code": "too_big", "maximum": 5000, "inclusive": true, "path": [ "content" ], "message": "Too big: expected string to have <=5000 characters" } ]'
    )

    expect(resolveWidgetErrorMessage(error, options)).toBe('Too long (5000)')
  })

  it('maps textual too-big validation messages to readable max-length message', () => {
    const error = new Error('Too big: expected string to have <=5000 characters')
    expect(resolveWidgetErrorMessage(error, options)).toBe('Too long (5000)')
  })

  it('hides technical SQL-like errors behind fallback message', () => {
    const error = new Error('Failed query: select * from "posts" where (id = $1)')
    expect(resolveWidgetErrorMessage(error, options)).toBe(fallbackMessage)
  })

  it('returns fallback for non-Error values', () => {
    expect(resolveWidgetErrorMessage('unknown', options)).toBe(fallbackMessage)
  })

  it('hides code-like messages behind fallback message', () => {
    const error = new Error('AUTH_REQUIRED')
    expect(resolveWidgetErrorMessage(error, options)).toBe(fallbackMessage)
  })

  it('keeps plain human-readable errors intact', () => {
    const error = new Error('Please sign in to comment')
    expect(resolveWidgetErrorMessage(error, options)).toBe('Please sign in to comment')
  })
})
