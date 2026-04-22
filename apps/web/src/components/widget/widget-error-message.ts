interface ResolveWidgetErrorMessageOptions {
  fallbackMessage: string
  contentTooLongMessage: (maxLength: number) => string
  defaultMaxLength?: number
}

const TECHNICAL_ERROR_TOKENS = [
  'failed query',
  'sql',
  'select ',
  'insert ',
  'update ',
  'delete ',
  'from "',
  'where (',
  'params:',
  'zoderror',
  'validationerror',
]

function extractMaxLength(message: string): number | null {
  const maxPatterns = [
    /"maximum"\s*:\s*(\d+)/i,
    /<=\s*(\d+)\s*characters?/i,
    /at most\s*(\d+)\s*character/i,
    /maximum\s*(\d+)\s*characters?/i,
  ]

  for (const pattern of maxPatterns) {
    const match = message.match(pattern)
    if (match?.[1]) {
      const parsed = Number(match[1])
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed
      }
    }
  }

  return null
}

function isTooBigValidationMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('too_big') ||
    normalized.includes('too big') ||
    normalized.includes('expected string to have <=') ||
    normalized.includes('at most')
  )
}

function isSerializedValidationPayload(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return false

  const looksLikeJsonEnvelope =
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))

  if (!looksLikeJsonEnvelope) return false

  return /"code"\s*:/i.test(trimmed) || /"path"\s*:/i.test(trimmed) || /"origin"\s*:/i.test(trimmed)
}

function isTechnicalMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  const trimmed = message.trim()
  const looksLikeCodeOnly = /^[A-Z][A-Z0-9_:-]{2,}$/.test(trimmed)
  return (
    looksLikeCodeOnly ||
    TECHNICAL_ERROR_TOKENS.some((token) => normalized.includes(token)) ||
    isSerializedValidationPayload(message)
  )
}

/**
 * Converts server/client errors into widget-safe human-readable messages.
 * Prevents leaking internal payloads, SQL details, and validator issue dumps.
 */
export function resolveWidgetErrorMessage(
  error: unknown,
  {
    fallbackMessage,
    contentTooLongMessage,
    defaultMaxLength = 5000,
  }: ResolveWidgetErrorMessageOptions
): string {
  if (!(error instanceof Error)) {
    return fallbackMessage
  }

  const rawMessage = error.message?.trim()
  if (!rawMessage) {
    return fallbackMessage
  }

  if (isTooBigValidationMessage(rawMessage)) {
    const maxLength = extractMaxLength(rawMessage) ?? defaultMaxLength
    return contentTooLongMessage(maxLength)
  }

  if (isTechnicalMessage(rawMessage)) {
    return fallbackMessage
  }

  return rawMessage
}
