const SEARCH_TOKEN_REGEX = /[\p{L}\p{N}]+/gu
const MAX_SEARCH_TOKENS = 8
const MAX_SEARCH_TOKEN_LENGTH = 64
const MIN_SEARCH_TOKEN_LENGTH = 2

export function normalizeSearchText(search: string): string {
  return search.trim().toLowerCase().replaceAll('ё', 'е')
}

export function buildPrefixSearchQuery(search: string): string | null {
  const normalized = normalizeSearchText(search)
  if (!normalized) return null

  const rawTokens = normalized.match(SEARCH_TOKEN_REGEX) ?? []
  const uniqueTokens: string[] = []
  const seen = new Set<string>()

  for (const rawToken of rawTokens) {
    const token = rawToken.slice(0, MAX_SEARCH_TOKEN_LENGTH)
    if (!token || token.length < MIN_SEARCH_TOKEN_LENGTH || seen.has(token)) continue
    seen.add(token)
    uniqueTokens.push(token)
    if (uniqueTokens.length >= MAX_SEARCH_TOKENS) break
  }

  if (uniqueTokens.length === 0) return null
  return uniqueTokens.map((token) => `${token}:*`).join(' & ')
}
