/**
 * Decodes the HTML entities found in names returned by external APIs (iNaturalist sends
 * "Jan Ebr &amp; Ivana Ebrová"). Text is stored decoded; Vue escapes it again when rendering.
 */
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' }

export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    const lower = code.toLowerCase()
    if (lower in NAMED) return NAMED[lower]!
    const n = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : lower.startsWith('#') ? parseInt(lower.slice(1), 10) : NaN
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m
  })
