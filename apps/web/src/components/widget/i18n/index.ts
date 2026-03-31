import { translations } from './translations'

type Language = keyof typeof translations
type TranslationPath = string

let currentLanguage: Language = 'en'

function toLanguage(value: string): Language | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  if (normalized in translations) return normalized as Language

  const base = normalized.split('-')[0]
  if (base in translations) return base as Language

  return null
}

/**
 * Resolve language from a locale-like value (e.g., "ru-RU", "en-US,en;q=0.9")
 */
export function resolveLanguage(value?: string | null): Language {
  if (!value) return 'en'

  for (const chunk of value.split(',')) {
    const candidate = chunk.split(';')[0]
    if (!candidate) continue
    const resolved = toLanguage(candidate)
    if (resolved) return resolved
  }

  return 'en'
}

/**
 * Get a translation by path (e.g., 'shell.feedback')
 */
export function t(path: TranslationPath): string {
  const keys = path.split('.')
  let value: any = translations[currentLanguage]

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key]
    } else {
      // Fallback to English if translation not found
      value = translations.en
      for (const fallbackKey of keys) {
        if (value && typeof value === 'object' && fallbackKey in value) {
          value = value[fallbackKey]
        } else {
          return path // Return the path if translation not found
        }
      }
      break
    }
  }

  return typeof value === 'string' ? value : path
}

/**
 * Set the current language
 */
export function setLanguage(lang: Language | string): void {
  currentLanguage = resolveLanguage(lang)
}

/**
 * Get the current language
 */
export function getLanguage(): Language {
  return currentLanguage
}

/**
 * Get available languages
 */
export function getAvailableLanguages(): Language[] {
  return Object.keys(translations) as Language[]
}

/**
 * Detect language from browser or use default
 */
export function detectLanguage(): Language {
  if (typeof window === 'undefined') return 'en'

  return resolveLanguage(navigator.language)
}
