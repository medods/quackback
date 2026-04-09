import { describe, expect, it } from 'vitest'
import { buildPrefixSearchQuery, normalizeSearchText } from '../post.search'

describe('post.search', () => {
  it('normalizes yo to e for cyrillic text', () => {
    expect(normalizeSearchText('  Ёжик в Тумане  ')).toBe('ежик в тумане')
    expect(normalizeSearchText('Корёжик')).toBe('корежик')
  })

  it('builds prefix tsquery from normalized tokens', () => {
    expect(buildPrefixSearchQuery('ежик')).toBe('ежик:*')
    expect(buildPrefixSearchQuery('Ёжик Корёжик')).toBe('ежик:* & корежик:*')
  })

  it('returns null for non-indexable queries', () => {
    expect(buildPrefixSearchQuery('!')).toBeNull()
  })
})
