// Synthetic restaurant context. Fictional business, no real people or data.
// Used in the AI system prompt, the fallback parser and the "How it works" view.

export const RESTAURANT = {
  name: 'Juniper & Pine',
  type: 'casual grill',
  soldOut: ['salmon', 'key lime pie'],
  freeRefills: ['water', 'iced tea', 'soda'],
  allergyPolicy:
    'The server must confirm every allergy or dietary request with the kitchen. Waiterly never says a dish is safe.',
  menu: [
    'smash burger',
    'veggie burger',
    'brisket plate',
    'ribeye steak',
    'grilled salmon',
    'chicken satay with peanut sauce',
    'chicken wings',
    'caesar salad',
    'mac and cheese',
    'fries',
    'sweet potato fries',
    'cornbread',
    'key lime pie',
    'brownie sundae',
  ],
} as const

export const DEFAULT_SECTION: readonly number[] = [1, 4, 7]
export const TABLE_MIN = 1
export const TABLE_MAX = 30
export const MAX_SECTION_SIZE = 8

/** Clean a user-entered table list: unique whole numbers in range, sorted. Falls back to the default section. */
export function normalizeTables(input: unknown): number[] {
  if (!Array.isArray(input)) return [...DEFAULT_SECTION]
  const tables = [
    ...new Set(
      input
        .map((n) => (typeof n === 'string' ? Number(n.trim()) : n))
        .filter(
          (n): n is number =>
            typeof n === 'number' && Number.isInteger(n) && n >= TABLE_MIN && n <= TABLE_MAX,
        ),
    ),
  ]
    .sort((a, b) => a - b)
    .slice(0, MAX_SECTION_SIZE)
  return tables.length ? tables : [...DEFAULT_SECTION]
}
