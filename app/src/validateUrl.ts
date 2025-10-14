export function validateHttpsUrl(candidate: string): { ok: boolean; reason?: string } {
  const value = candidate.trim()
  if (!value) return { ok: false, reason: 'empty' }
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:') return { ok: false, reason: 'not_https' }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}


