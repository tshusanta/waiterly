// Text helpers shared by the validator and the fallback parser.

export const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
}
const UNITS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const NUMBER_WORD_RE = new RegExp(
  `\\b(twenty[\\s-](?:${UNITS.join('|')})|${Object.keys(NUMBER_WORDS).join('|')})\\b`,
  'gi',
)

/** "seven" -> 7, "twenty-one" -> 21, "4" -> 4, otherwise null. */
export function wordToNumber(word: string): number | null {
  const w = word.toLowerCase().trim()
  if (/^\d+$/.test(w)) return Number(w)
  if (w in NUMBER_WORDS) return NUMBER_WORDS[w]
  const m = w.match(/^twenty[\s-](\w+)$/)
  if (m && m[1] in NUMBER_WORDS && NUMBER_WORDS[m[1]] < 10) return 20 + NUMBER_WORDS[m[1]]
  return null
}

/**
 * Every number the server said, as digits or words. This is a superset ("two waters"
 * also yields 2). Validation uses it to catch tables the model invented outright.
 */
export function mentionedNumbers(note: string): Set<number> {
  const out = new Set<number>()
  for (const m of note.matchAll(/\d{1,3}/g)) out.add(Number(m[0]))
  for (const m of note.matchAll(NUMBER_WORD_RE)) {
    const n = wordToNumber(m[1])
    if (n !== null) out.add(n)
  }
  return out
}

/** Strip control characters and angle brackets, collapse whitespace, trim to a length. */
export function cleanString(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return ''
  const s = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length <= maxChars) return s
  const cut = s.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trim()
}

/** A task command: clean, at most `maxWords` words and 60 characters, first letter capitalized. */
export function cleanTaskText(value: unknown, maxWords = 8): string {
  const s = cleanString(value, 200).replace(/[.!]+$/, '')
  const words = s.split(' ').filter(Boolean).slice(0, maxWords).join(' ')
  const trimmed = cleanString(words, 60)
  return trimmed ? trimmed[0].toUpperCase() + trimmed.slice(1) : ''
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'please', 'more', 'some', 'extra', 'another', 'bring', 'get', 'grab',
  'for', 'to', 'of', 'and', 'on', 'with', 'table', 'guest', 'guests',
])

/** Tokens used for duplicate detection. "Bring 2 more waters" ~ "bring two waters". */
export function dedupeTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !STOPWORDS.has(w))
      .map((w) => (wordToNumber(w) !== null ? String(wordToNumber(w)) : w.replace(/s$/, ''))),
  )
}

export function isNearDuplicate(a: string, b: string): boolean {
  const ta = dedupeTokens(a)
  const tb = dedupeTokens(b)
  if (ta.size === 0 || tb.size === 0) return false
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  if (shared / (ta.size + tb.size - shared) >= 0.75) return true
  // "Bring ranch" vs "Bring ranch on the side": the shorter request is fully covered.
  const small = Math.min(ta.size, tb.size)
  const large = Math.max(ta.size, tb.size)
  return shared === small && large - small <= 2
}
