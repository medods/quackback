/**
 * Builds session token lookup variants for Better Auth signed tokens.
 *
 * Cookie tokens may arrive url-encoded and in "<raw>.<signature>" format,
 * while the DB stores the raw token only.
 */
export function getSessionTokenCandidates(rawToken: string): string[] {
  const candidates = new Set<string>()
  candidates.add(rawToken)

  let decoded = rawToken
  try {
    decoded = decodeURIComponent(rawToken)
  } catch {
    // noop: keep original token
  }
  candidates.add(decoded)

  const dotIndex = decoded.indexOf('.')
  if (dotIndex > 0) {
    candidates.add(decoded.slice(0, dotIndex))
  }

  return Array.from(candidates)
}
