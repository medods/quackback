import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  isRtlLocale,
  normalizeLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
} from '../i18n'

describe('normalizeLocale', () => {
  it('returns exact match for supported locale', () => {
    expect(normalizeLocale('en')).toBe('en')
    expect(normalizeLocale('ru')).toBe('ru')
  })
  it('strips region to find base locale', () => {
    expect(normalizeLocale('en-US')).toBe('en')
    expect(normalizeLocale('ru-RU')).toBe('ru')
  })
  it('returns null for locales without message catalogs', () => {
    expect(normalizeLocale('pt-BR')).toBeNull()
    expect(normalizeLocale('it')).toBeNull()
  })
  it('returns null for unsupported locale', () => {
    expect(normalizeLocale('zz')).toBeNull()
    expect(normalizeLocale('xx-YY')).toBeNull()
  })
  it('handles case insensitivity', () => {
    expect(normalizeLocale('EN')).toBe('en')
    expect(normalizeLocale('RU-ru')).toBe('ru')
  })
  it('returns null for empty or invalid input', () => {
    expect(normalizeLocale('')).toBeNull()
    expect(normalizeLocale('not-a-locale-at-all')).toBeNull()
  })
})

describe('resolveLocale', () => {
  it('returns first supported locale from Accept-Language header', () => {
    expect(resolveLocale('en-US,en;q=0.9,ru;q=0.8')).toBe('en')
    expect(resolveLocale('ru-RU,ru;q=0.9,en;q=0.8')).toBe('ru')
  })
  it('falls back to default when no supported locale found', () => {
    expect(resolveLocale('zz,xx;q=0.5')).toBe('ru')
    expect(resolveLocale('')).toBe('ru')
    expect(resolveLocale(null)).toBe('ru')
  })
  it('respects quality weights', () => {
    expect(resolveLocale('en;q=0.5,ru;q=0.9')).toBe('ru')
  })
  it('returns explicit locale when provided', () => {
    expect(resolveLocale('en;q=0.5', 'ru')).toBe('ru')
  })
  it('falls back to header when explicit locale is unsupported', () => {
    expect(resolveLocale('ru,en;q=0.5', 'zz')).toBe('ru')
  })
})

describe('isRtlLocale', () => {
  it('returns true for RTL locales', () => {
    expect(isRtlLocale('ar')).toBe(true)
    expect(isRtlLocale('he')).toBe(true)
    expect(isRtlLocale('fa')).toBe(true)
    expect(isRtlLocale('ur')).toBe(true)
  })
  it('returns false for LTR locales', () => {
    expect(isRtlLocale('en')).toBe(false)
    expect(isRtlLocale('ru')).toBe(false)
  })
})

describe('SUPPORTED_LOCALES', () => {
  it('includes en', () => {
    expect(SUPPORTED_LOCALES).toContain('en')
  })
  it('includes ru as default', () => {
    expect(SUPPORTED_LOCALES).toContain('ru')
  })
  it('contains only en and ru', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'ru'])
  })
  it('DEFAULT_LOCALE is ru', () => {
    expect(DEFAULT_LOCALE).toBe('ru')
  })
})
