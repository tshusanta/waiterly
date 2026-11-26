// Deterministic keyword parser, used when the AI is down, slow or misbehaving.
// It's deliberately conservative: anything it can't place goes back as a
// question, never a guess. Its output goes through the same validator as the AI's.
import { RESTAURANT } from '../restaurant.js'
import type { Category, Flag, Priority } from '../types.js'
import { ALLERGY_RE } from './validate.js'
import { NUMBER_WORDS, cleanString, wordToNumber } from './text.js'

interface RawTask {
  table: number
  text: string
  category: Category
  priority: Priority
  flags: Flag[]
  note: string
}

export interface RawParse {
  tasks: RawTask[]
  needs_clarification: { request: string; question: string }[]
  rejected: { request: string; reason: string }[]
}

const NUM = `\\d{1,2}|twenty[\\s-]\\w+|${Object.keys(NUMBER_WORDS).join('|')}`
const TABLE_EXPLICIT = new RegExp(`\\b(?:table|tbl|tb|t|#)\\s*-?\\s*(${NUM})\\b`, 'i')
// A bare number at the start of a clause counts only when a verb follows ("4 wants ranch"),
// so "two waters" isn't read as table 2.
const TABLE_LEADING = new RegExp(
  `^\\s*(${NUM})\\s+(?:is|are|wants?|needs?|says?|would|asked|asks|has|have|ready|could|can)\\b`,
  'i',
)
// A new, unnamed party. Don't carry the previous table forward.
const NEW_PARTY_RE =
  /\b(?:the|a|that|this)\s+(?:guy|man|woman|lady|girl|boy|couple|family|kid|party|booth|people|person|gentleman|group)\b|\bby the\b|\bnear the\b|\bsomeone\b|\bsomebody\b/i

const INJECTION_RE =
  /\b(?:ignore|disregard|forget|override)\b.*\b(?:instructions?|rules?|prompts?|previous)\b|\bsystem prompt\b|\b(?:mark|set|make)\b.*\b(?:paid|comped?|free)\b|\b(?:refund|void|comp|discount)\b/i
const COMPLAINT_RE =
  /\bcold\b(?!\s+(?:water|drink|beer|tea|soda))|overcooked|undercooked|\braw\b|burnt|burned|wrong|complain|\bmanager\b|took too long|rude|dirty|\bhair\b/i
const BILL_RE = /\b(?:the|their|our|separate|a)\s+(?:check|bill)s?\b|\bbill\b|\bsplit\b|ready to pay/i
const VERIFY_RE = /\b(?:check|ask|confirm|see if)\b/i

interface Item {
  re: RegExp
  category: Category
  label: string
  plural?: string
}

const ITEMS: Item[] = [
  { re: /\bwaters?\b/i, category: 'drinks', label: 'water', plural: 'waters' },
  { re: /\b(?:iced|sweet) teas?\b/i, category: 'drinks', label: 'iced tea', plural: 'iced teas' },
  { re: /\bsodas?\b|\bcokes?\b|\bsprites?\b/i, category: 'drinks', label: 'soda', plural: 'sodas' },
  { re: /\blemonades?\b/i, category: 'drinks', label: 'lemonade', plural: 'lemonades' },
  { re: /\bcoffees?\b/i, category: 'drinks', label: 'coffee', plural: 'coffees' },
  { re: /\bbeers?\b/i, category: 'drinks', label: 'beer', plural: 'beers' },
  { re: /\bwines?\b/i, category: 'drinks', label: 'wine', plural: 'glasses of wine' },
  { re: /\brefills?\b/i, category: 'drinks', label: 'drinks' },
  { re: /\branch\b/i, category: 'condiments', label: 'ranch' },
  { re: /\bketchup\b/i, category: 'condiments', label: 'ketchup' },
  { re: /\bmustard\b/i, category: 'condiments', label: 'mustard' },
  { re: /\bmayo\b/i, category: 'condiments', label: 'mayo' },
  { re: /\bhot sauce\b/i, category: 'condiments', label: 'hot sauce' },
  { re: /\b(?:bbq|barbecue) sauce\b/i, category: 'condiments', label: 'BBQ sauce' },
  { re: /\bdressing\b/i, category: 'condiments', label: 'dressing' },
  { re: /\blemons?\b/i, category: 'condiments', label: 'lemon' },
  { re: /\bsalt_and_pepper\b/i, category: 'condiments', label: 'salt and pepper' },
  { re: /\bbutter\b/i, category: 'condiments', label: 'butter' },
  { re: /\bnapkins?\b/i, category: 'supplies', label: 'napkins' },
  { re: /\bforks?\b|\bknife\b|\bknives\b|\bspoons?\b|\bsilverware\b/i, category: 'supplies', label: 'silverware' },
  { re: /\bstraws?\b/i, category: 'supplies', label: 'straws' },
  { re: /\bhigh ?chair\b|\bbooster\b/i, category: 'supplies', label: 'high chair' },
  { re: /\bto-?go box(?:es)?\b|\bboxes?\b/i, category: 'supplies', label: 'to-go box' },
  { re: /\bplates?\b/i, category: 'supplies', label: 'extra plates' },
  { re: /\bspill(?:ed)?\b|\bwipe\b|\bclean\b|\bmess\b|\bbroken glass\b/i, category: 'cleanup', label: 'spill' },
  { re: /\bbread\b|\bcornbread\b/i, category: 'food', label: 'bread' },
  { re: /\bfries\b/i, category: 'food', label: 'fries' },
  { re: /\bdessert\b|\bsundae\b|\bbrownie\b/i, category: 'food', label: 'dessert' },
]

const FOOD_WORDS =
  /\b(steak|ribeye|burger|brisket|salmon|satay|salad|fries|chicken|food|order|mac_and_cheese|sauce|soup|pie|dessert|bun)\b/i
const QTY_RE = new RegExp(`\\b(${NUM})\\s+(?:more\\s+|extra\\s+)?(\\w+)`, 'gi')

function findTable(clause: string): number | null {
  const m = clause.match(TABLE_EXPLICIT) ?? clause.match(TABLE_LEADING)
  return m ? wordToNumber(m[1]) : null
}

function quantity(clause: string, item: Item): number {
  // Find the number directly attached to this item ("table 1 needs two waters" -> 2, not 1).
  for (const m of clause.matchAll(QTY_RE)) {
    if (item.re.test(m[2])) return wordToNumber(m[1]) ?? 1
  }
  return 1
}

function itemTask(clause: string, item: Item): Pick<RawTask, 'text' | 'category'> {
  const soldOut = RESTAURANT.soldOut.find((s) => clause.toLowerCase().includes(s))
  if (soldOut && item.category === 'food') return { text: `Tell guest ${soldOut} is 86'd`, category: 'service' }
  switch (item.category) {
    case 'drinks': {
      const qty = quantity(clause, item)
      if (qty > 1 && item.plural) return { text: `Bring ${qty} ${item.plural}`, category: 'drinks' }
      return { text: `Refill ${item.label}`, category: 'drinks' }
    }
    case 'condiments':
      return {
        text: item.label === 'lemon' && /\bwater\b/i.test(clause) ? 'Bring lemon for water' : `Bring ${item.label}`,
        category: 'condiments',
      }
    case 'cleanup':
      return { text: 'Clean up spill', category: 'cleanup' }
    case 'food':
      if (item.label === 'bread') return { text: 'Bring more bread', category: 'food' }
      if (/\bside of\b/i.test(clause)) return { text: `Add side of ${item.label}`, category: 'food' }
      return { text: `Add ${item.label} to order`, category: 'food' }
    default:
      return { text: `Bring ${item.label}`, category: item.category }
  }
}

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

export function fallbackParse(note: string): RawParse {
  const out: RawParse = { tasks: [], needs_clarification: [], rejected: [] }

  // Whole-note injection check first. A rule-changing note never yields tasks.
  if (INJECTION_RE.test(note)) {
    out.rejected.push({
      request: cleanString(note, 120),
      reason: "Not a guest request. TableTap can't change rules, payments or comps.",
    })
    return out
  }

  const protectedNote = note
    .replace(/\bmac (?:and|&|n) cheese\b/gi, 'mac_and_cheese')
    .replace(/\bsalt (?:and|&|n) pepper\b/gi, 'salt_and_pepper')
    // "the check, split three ways" is one request.
    .replace(/,\s*(split\b)/gi, ' $1')
  const clauses = protectedNote
    .split(/[.;!?\n]+|,|\band\b|\balso\b|\bthen\b|\bplus\b/i)
    .map((c) => c.trim())
    .filter(Boolean)

  let carryTable: number | null = null
  for (const rawClause of clauses) {
    const explicit = findTable(rawClause)
    const table = explicit ?? (NEW_PARTY_RE.test(rawClause) ? null : carryTable)
    if (explicit !== null) carryTable = explicit
    if (explicit === null && NEW_PARTY_RE.test(rawClause)) carryTable = null
    // "lemon for her water": the water is the target, not a new drink.
    const clause = rawClause.replace(/\bfor (?:her|his|their|the|my)\s+(?:water|drink|tea)\b/i, 'for water')
    const readable = cleanString(rawClause.replace(/_/g, ' '), 100)

    const found: RawTask[] = []
    const push = (t: Omit<RawTask, 'table'>) => found.push({ ...t, table: table ?? 0 })

    if (ALLERGY_RE.test(clause)) {
      const m =
        clause.match(/allergic to (\w+)/i) ?? clause.match(/(\w+)[- ]allergy/i) ?? clause.match(ALLERGY_RE)
      const allergen = (m?.[1] ?? m?.[0] ?? '').toLowerCase().replace(/s$/, '').replace(/^allerg\w*$/, '')
      push({
        text: allergen ? `Confirm ${allergen} allergy with kitchen` : 'Confirm allergy with kitchen',
        category: 'food',
        priority: 'high',
        flags: ['allergy'],
        note: '',
      })
    } else if (VERIFY_RE.test(clause) && FOOD_WORDS.test(clause) && table !== null &&
      out.tasks.some((t) => t.table === table && t.flags.includes('allergy'))) {
      // "can we check the satay sauce" after an allergy: fold it into the allergy task.
      const allergyTask = out.tasks.find((t) => t.table === table && t.flags.includes('allergy'))!
      const dish = clause.match(/\b(?:the|a|an)\s+([\w\s]+?)\s*$/i)?.[1] ?? clause.match(FOOD_WORDS)![1]
      const allergen = allergyTask.text.match(/Confirm (\w+) allergy/)?.[1]
      const allergenPlural = allergen && /nut$/.test(allergen) ? `${allergen}s` : allergen
      allergyTask.text = allergen ? `Check ${dish.trim()} for ${allergenPlural}` : `Check ${dish.trim()} with kitchen`
      continue
    } else if (COMPLAINT_RE.test(clause)) {
      const subject = clause.match(FOOD_WORDS)?.[1]
      const problem = clause.match(/\b(cold|overcooked|undercooked|raw|burnt|burned|wrong)\b/i)?.[1]
      const wantsManager = /\bmanager\b/i.test(clause)
      // "steak is cold and they want a manager" is one complaint, not two.
      const existing = table !== null && out.tasks.find((t) => t.table === table && t.flags.includes('complaint'))
      if (existing) {
        if (wantsManager) existing.text = existing.text.replace(/, fix it$/, '') + ', send manager'
        continue
      }
      const core = subject && problem ? `${capitalize(subject)} ${problem.toLowerCase()}` : 'Guest complaint'
      push({
        text: wantsManager ? `${core}, send manager` : `${core}, fix it`,
        category: 'service',
        priority: 'high',
        flags: ['complaint'],
        note: '',
      })
    } else if (BILL_RE.test(clause)) {
      const split = clause.match(new RegExp(`split\\s+(?:it\\s+)?(${NUM})`, 'i'))
      const n = split ? wordToNumber(split[1]) : null
      push({
        text: n ? `Bring check, split ${n} ways` : /separate/i.test(clause) ? 'Bring separate checks' : 'Bring check',
        category: 'check',
        priority: 'high',
        flags: [],
        note: '',
      })
    } else {
      const matchable = clause.replace(/\bfor water\b/i, '') // the water is the target, not an item
      for (const item of ITEMS) {
        if (!item.re.test(matchable)) continue
        const t = itemTask(clause, item)
        push({ ...t, priority: 'normal', flags: [], note: '' })
        if (t.text.startsWith('Tell guest')) break
      }
      // Sold-out item named without a matching food keyword ("add the salmon").
      const soldOut = RESTAURANT.soldOut.find((s) => clause.toLowerCase().includes(s))
      if (soldOut && !found.some((f) => f.text.includes("86'd"))) {
        push({ text: `Tell guest ${soldOut} is 86'd`, category: 'service', priority: 'normal', flags: ['86d'], note: '' })
      }
    }

    if (found.length === 0) {
      if (table !== null) {
        out.needs_clarification.push({ request: readable, question: `What does table ${table} need? ("${readable}")` })
      } else if (readable.split(' ').length >= 3) {
        out.needs_clarification.push({ request: readable, question: `Which table, and what do they need? ("${readable}")` })
      }
      continue
    }
    if (table === null) {
      for (const f of found) {
        out.needs_clarification.push({ request: f.text, question: `Which table wants this: ${f.text.toLowerCase()}?` })
      }
      continue
    }
    out.tasks.push(...found)
  }
  return out
}
