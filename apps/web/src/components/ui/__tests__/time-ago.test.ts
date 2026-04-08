import { describe, expect, it } from 'vitest'
import { enUS, ru } from 'date-fns/locale'
import { getDateFnsLocale, getTimeAgo, getTooltipDate } from '../time-ago'

describe('getDateFnsLocale', () => {
  it('returns ru locale for "ru"', () => {
    expect(getDateFnsLocale('ru')).toBe(ru)
  })

  it('returns enUS locale for "en"', () => {
    expect(getDateFnsLocale('en')).toBe(enUS)
  })

  it('returns enUS locale for unknown locale', () => {
    expect(getDateFnsLocale('de')).toBe(enUS)
  })
})

describe('getTimeAgo', () => {
  it('returns empty string for null', () => {
    expect(getTimeAgo(null, 'en')).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(getTimeAgo(undefined, 'en')).toBe('')
  })

  it('returns empty string for invalid date string', () => {
    expect(getTimeAgo('not-a-date', 'en')).toBe('')
  })

  it('returns non-empty string for valid Date object', () => {
    const date = new Date(Date.now() - 60 * 1000)
    expect(getTimeAgo(date, 'en')).not.toBe('')
  })

  it('returns non-empty string for valid date string', () => {
    const date = new Date(Date.now() - 60 * 1000).toISOString()
    expect(getTimeAgo(date, 'en')).not.toBe('')
  })

  it('returns Russian text for ru locale', () => {
    const date = new Date(Date.now() - 2 * 60 * 1000)
    const result = getTimeAgo(date, 'ru')
    // date-fns ru locale uses Cyrillic characters
    expect(result).toMatch(/[а-яА-Я]/)
  })

  it('returns English text for en locale', () => {
    const date = new Date(Date.now() - 2 * 60 * 1000)
    const result = getTimeAgo(date, 'en')
    expect(result).toMatch(/ago|minute/)
  })
})

describe('getTooltipDate', () => {
  it('returns empty string for null', () => {
    expect(getTooltipDate(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(getTooltipDate(undefined)).toBe('')
  })

  it('returns empty string for invalid date string', () => {
    expect(getTooltipDate('not-a-date')).toBe('')
  })

  it('formats date in DD.MM.YYYY HH:mm (timezone) format', () => {
    const date = new Date(2024, 0, 15, 14, 30) // 15 Jan 2024 14:30
    const result = getTooltipDate(date)
    expect(result).toMatch(/^15\.01\.2024 14:30 \(.+\)$/)
  })

  it('formats date string correctly', () => {
    const date = new Date(2024, 5, 3, 9, 5) // 3 Jun 2024 09:05
    const result = getTooltipDate(date.toISOString())
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2} \(.+\)$/)
  })

  it('includes timezone in parentheses', () => {
    const date = new Date(2024, 0, 15, 14, 30)
    const result = getTooltipDate(date)
    expect(result).toMatch(/\(.+\)$/)
  })
})
