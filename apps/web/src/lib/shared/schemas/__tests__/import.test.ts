import { describe, expect, it } from 'vitest'
import { CSV_HEADERS, REQUIRED_HEADERS, CSV_TEMPLATE } from '../import'

describe('import schema headers', () => {
  it('keeps required headers for board import', () => {
    expect(REQUIRED_HEADERS).toEqual(['title', 'content'])
  })

  it('does not include board field in selectable CSV headers', () => {
    expect(CSV_HEADERS).not.toContain('board')
  })

  it('template header does not include board column', () => {
    const headerLine = CSV_TEMPLATE.split('\n')[0]
    expect(headerLine).toBe(
      'title,content,status,tags,author_name,author_email,vote_count,created_at'
    )
  })
})
