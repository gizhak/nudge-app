// A dietitian's menu from its text (copied from a photo with Google Lens): meal headers, each line's
// amount and food, alternatives ("או"), and the exchange lists ("2 מנות פחמימה"). Pure and rule based,
// no AI: what it cannot read is marked, and he fixes it on the review screen.
import type { SlotId } from '../nutrition/meals';
import { DIET_FOODS, DietFood, EXCHANGES, Unit } from './foods';

import { t } from '../i18n';
export interface MenuItem {
  /** The line as he will recognize it */
  text: string;
  foodId?: string;
  grams?: number;
  kcal: number;
  protein: number;
  /** False when the food was not recognized: the numbers are his to fill */
  known: boolean;
  /** "ירקות חופשי": no limit */
  free?: boolean;
  /** What can replace it, as written */
  alts?: string[];
}

export interface MenuMeal {
  slot: SlotId;
  title: string;
  items: MenuItem[];
}

export interface DietMenu {
  meals: MenuMeal[];
  text: string;
  createdAt: number;
}

const LETTER = 'א-תa-zA-Z';
const PREFIX = '[ובהלמשכ]{0,2}';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (forms: string[]) => new RegExp(`(^|[^${LETTER}])${PREFIX}(${forms.map(esc).join('|')})(?=$|[^${LETTER}])`);

// Every name of every food, longest first, so "חזה עוף" wins over "עוף"
const NAMES = DIET_FOODS.flatMap((f) => f.names.map((n) => ({ n, f })))
  .sort((a, b) => b.n.length - a.n.length)
  .map((x) => ({ ...x, re: word([x.n]) }));

const UNITS: { unit: Unit | 'exchange'; re: RegExp }[] = [
  { unit: 'gram', re: /^(גרם|גר'|גר׳|גר|ג'|ג׳|ג|מ"ל|מ״ל|מל)(?=$|[^א-ת])/ },
  { unit: 'tsp', re: /^(כפיות|כפית)/ },
  { unit: 'tbsp', re: /^(כפות|כף)/ },
  { unit: 'cup', re: /^(כוסות|כוס)/ },
  { unit: 'slice', re: /^(פרוסות|פרוסה|פרוסת)/ },
  { unit: 'tub', re: /^(גביעים|גביע)/ },
  { unit: 'can', re: /^(קופסאות|קופסה|קופסת|קופסא|פחית)/ },
  { unit: 'handful', re: /^(חופנים|חופן|קומץ)/ },
  { unit: 'scoop', re: /^(סקופים|סקופ)/ },
  { unit: 'one', re: /^(יחידות|יחידה|יח'|יח׳|חתיכות|חתיכה)/ },
  { unit: 'exchange', re: /^(מנות|מנה|מנת)(?=$|[^א-ת])/ },
];

const NUM_WORDS: [RegExp, number][] = [
  [/^(שלושת רבעי)/, 0.75],
  [/^(חצי)/, 0.5],
  [/^(רבע)/, 0.25],
  [/^(אחת|אחד)(?=$|[^א-ת])/, 1],
  [/^(שתיים|שניים|שתי|שני)(?=$|[^א-ת])/, 2],
  [/^(שלוש|שלושה)(?=$|[^א-ת])/, 3],
  [/^(ארבע|ארבעה)(?=$|[^א-ת])/, 4],
  [/^(חמש|חמישה)(?=$|[^א-ת])/, 5],
];

const HEADER =
  /^(ארוחת\s+|ארוחה\s+)?(בוקר|ביניים|עשר|צהריים|צהרים|מנחה|אחה"צ|אחה״צ|אחר הצהריים|ערב|לילה|לפני השינה|לפני שינה|לפני אימון|אחרי אימון|\d+)(?=$|[^א-ת])/;

/** Fractions and ranges into plain numbers: "1/2" 0.5, "½" 0.5, "2-3" 2.5 */
function normalize(s: string): string {
  return s
    .replace(/[‏‎]/g, '')
    .replace(/½/g, ' 0.5 ')
    .replace(/¼/g, ' 0.25 ')
    .replace(/¾/g, ' 0.75 ')
    .replace(/(\d+)\s*\/\s*(\d+)/g, (_, a, b) => String(Number(a) / Number(b)))
    .replace(/(\d+(?:\.\d+)?)\s*(?:-|–|עד)\s*(\d+(?:\.\d+)?)/g, (_, a, b) => String((Number(a) + Number(b)) / 2))
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first amount in a piece of text and the unit right after it */
function amountOf(s: string): { qty: number; unit: Unit | 'exchange' | null } | null {
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && /[א-תa-zA-Z0-9.]/.test(s[i - 1])) continue;
    const rest = s.slice(i);
    let qty: number | null = null;
    let len = 0;
    const m = rest.match(/^(\d+(?:\.\d+)?)/);
    if (m) {
      qty = Number(m[1]);
      len = m[1].length;
    } else {
      for (const [re, v] of NUM_WORDS) {
        const w = rest.match(re);
        if (w) {
          qty = v;
          len = w[1].length;
          break;
        }
      }
    }
    if (qty == null) continue;
    const after = rest.slice(len).trimStart();
    const u = UNITS.find((x) => x.re.test(after));
    // "חצי" alone before a food, or a plain count like "2 ביצים"
    return { qty, unit: u ? u.unit : null };
  }
  // A unit with no number is one of it: "כוס אורז", "כף שמן", "מנת שומן"
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && /[א-תa-zA-Z0-9]/.test(s[i - 1])) continue;
    const u = UNITS.find((x) => x.unit !== 'gram' && x.re.test(s.slice(i)));
    if (u) return { qty: 1, unit: u.unit };
  }
  return null;
}

function foodIn(s: string): DietFood | null {
  return NAMES.find((x) => x.re.test(s))?.f ?? null;
}

/** One food line into numbers */
export function parseItem(raw: string, shown?: string): MenuItem {
  const [first, ...alts] = normalize(raw).split(/\s+או\s+/);
  // Shown as written ("2-3 פריכיות", "½ פיתה"); the numbers come from the normalized form
  const text = (shown ?? raw).replace(/[\u200f\u200e]/g, '').replace(/\s+/g, ' ').trim();
  const free = /חופשי|ללא הגבלה|כמה שרוצים/.test(first);
  const amt = amountOf(first);
  // "2 מנות פחמימה": the exchange lists
  if (amt?.unit === 'exchange') {
    const x = EXCHANGES.find((e) => word(e.names).test(first));
    if (x) return { text, foodId: x.id, kcal: Math.round(x.kcal * amt.qty), protein: Math.round(x.protein * amt.qty * 10) / 10, known: true, alts: alts.length ? alts : undefined };
  }
  const f = foodIn(first);
  if (!f) return { text, kcal: 0, protein: 0, known: false, free: free || undefined, alts: alts.length ? alts : undefined };
  let grams = f.portion;
  if (amt) {
    if (amt.unit === 'gram') grams = amt.qty;
    else if (amt.unit && amt.unit !== 'exchange' && f.units[amt.unit]) grams = amt.qty * f.units[amt.unit]!;
    else if (amt.unit === 'exchange') grams = amt.qty * f.portion;
    else if (!amt.unit && f.units.one) grams = amt.qty * f.units.one;
    else if (!amt.unit && f.units.slice) grams = amt.qty * f.units.slice;
    else if (!amt.unit) grams = amt.qty * f.portion;
    else grams = amt.qty * f.portion;
  }
  return {
    text,
    foodId: f.id,
    grams: Math.round(grams),
    kcal: Math.round((f.kcal * grams) / 100),
    protein: Math.round((f.protein * grams) / 10) / 10,
    known: true,
    free: free || undefined,
    alts: alts.length ? alts : undefined,
  };
}

/** Which meal of the day a header names, given the meals already found */
function slotFor(h: string, found: SlotId[]): SlotId {
  if (/בוקר/.test(h)) return 'breakfast';
  if (/צהר/.test(h)) return 'lunch';
  if (/ערב/.test(h)) return 'dinner';
  if (/לילה|שינה/.test(h)) return 'night';
  if (/עשר/.test(h)) return 'snack_am';
  if (/מנחה|אחה|אחר הצהריים/.test(h)) return 'snack_pm';
  // "ביניים", around a workout, or a numbered meal: the next free slot after the last one
  const order: SlotId[] = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'night'];
  const lastIdx = Math.max(-1, ...found.map((x) => order.indexOf(x)));
  if (/ביניים|אימון/.test(h)) return found.includes('lunch') ? 'snack_pm' : lastIdx >= 0 ? 'snack_am' : 'snack_am';
  return order[Math.min(order.length - 1, lastIdx + 1)];
}

const SLOT_TITLE: Record<SlotId, string> = {
  breakfast: t('ארוחת בוקר', 'Breakfast'),
  snack_am: t('ביניים בבוקר', 'Morning snack'),
  lunch: t('ארוחת צהריים', 'Lunch'),
  snack_pm: t('ביניים אחר הצהריים', 'Afternoon snack'),
  dinner: t('ארוחת ערב', 'Dinner'),
  night: t('ארוחת לילה', 'Late meal'),
};
export const slotTitle = (s: SlotId) => SLOT_TITLE[s];

/** Splits a line holding several foods: "2 פרוסות לחם + קוטג', ירקות" */
const pieces = (line: string) =>
  line
    .split(/\s*[+,;]\s*|\s+עם\s+/)
    .map((x) => x.trim())
    .filter((x) => /[א-תa-zA-Z]/.test(x));

/** Looks like a dietitian's menu (meal headers and amounts), not a restaurant's */
export function looksLikeDiet(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => normalize(l.replace(/^[\s\-•*·●▪◦–—]+/, '')));
  const headers = lines.filter((l) => HEADER.test(l) && /ארוח|בוקר|צהר|ערב|ביניים/.test(l)).length;
  const amounts = lines.filter((l) => /(\d|חצי)\s*(גרם|כף|כפות|כפית|כוס|פרוס|יחיד|מנות|מנה|מנת|גביע)/.test(l)).length;
  return headers >= 2 && amounts >= 2;
}

export function parseDiet(text: string, now = Date.now()): DietMenu {
  const meals: MenuMeal[] = [];
  let cur: MenuMeal | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const clean = rawLine.replace(/^[\s\-•*·●▪◦–—]+/, '').replace(/^\d+[.)]\s+/, '').replace(/\s+/g, ' ').trim();
    let line = normalize(clean);
    // The same line as written, for showing: "½ פיתה", not "0.5 פיתה"
    let shownLine = clean;
    if (!line || !/[א-תa-zA-Z]/.test(line)) continue;
    // A header, maybe with the meal's foods after a colon
    const h = line.replace(/\(?\s*\d{1,2}[:.]\d{2}\s*\)?/g, '').trim();
    const head = h.match(HEADER);
    const colon = h.indexOf(':');
    const headPart = colon >= 0 ? h.slice(0, colon) : h;
    if (head && (colon >= 0 || h.length <= 24) && !amountOf(headPart.replace(HEADER, '')) && !(head[2] && /^\d+$/.test(head[2]) && !/ארוח/.test(h))) {
      const slot = slotFor(headPart, meals.map((m) => m.slot));
      cur = meals.find((m) => m.slot === slot) ?? null;
      if (!cur) {
        cur = { slot, title: SLOT_TITLE[slot], items: [] };
        meals.push(cur);
      }
      line = colon >= 0 ? h.slice(colon + 1).trim() : '';
      shownLine = colon >= 0 && clean.includes(':') ? clean.slice(clean.indexOf(':') + 1).trim() : line;
      if (!line) continue;
    }
    // Before any header: a title or a name at the top, not food
    if (!cur) {
      if (!foodIn(line)) continue;
      cur = { slot: 'breakfast', title: SLOT_TITLE.breakfast, items: [] };
      meals.push(cur);
    }
    // "או ..." on its own line: an alternative to the line before
    const orLine = line.match(/^או\s+(.+)$/);
    if (orLine && cur.items.length) {
      const last = cur.items[cur.items.length - 1];
      last.alts = [...(last.alts ?? []), orLine[1]];
      continue;
    }
    // Notes, not food
    if (/^(הערה|הערות|שים לב|לשתות|שתייה|מים)/.test(line) && !foodIn(line)) continue;
    // Alternatives keep the whole line together; otherwise each food on its own
    const parts = /\sאו\s/.test(line) ? [line] : pieces(line);
    const shownParts = /\sאו\s/.test(line) ? [shownLine] : pieces(shownLine);
    parts.forEach((p, k) => cur!.items.push(parseItem(p, shownParts.length === parts.length ? shownParts[k] : undefined)));
  }
  const order: SlotId[] = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'night'];
  meals.sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
  return { meals: meals.filter((m) => m.items.length), text, createdAt: now };
}

export const mealKcal = (m: MenuMeal) => m.items.reduce((a, x) => a + x.kcal, 0);
export const mealProtein = (m: MenuMeal) => m.items.reduce((a, x) => a + x.protein, 0);
export const menuTotals = (d: DietMenu) => ({
  kcal: d.meals.reduce((a, m) => a + mealKcal(m), 0),
  protein: Math.round(d.meals.reduce((a, m) => a + mealProtein(m), 0)),
  unknown: d.meals.reduce((a, m) => a + m.items.filter((x) => !x.known).length, 0),
});
