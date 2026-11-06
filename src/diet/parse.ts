// A dietitian's menu from its text (copied from a photo with Google Lens): meal headers, each line's
// amount and food, alternatives ("או"), and the exchange lists ("2 מנות פחמימה"). Pure and rule based,
// no AI: what it cannot read is marked, and he fixes it on the review screen.
import type { SlotId } from '../nutrition/meals';
import { DIET_FOODS, DietFood, EXCHANGES, Unit } from './foods';

import { t } from '../i18n';
/** One food as written, with its numbers */
export interface MenuChoice {
  /** The food as he will recognize it */
  text: string;
  foodId?: string;
  grams?: number;
  kcal: number;
  protein: number;
  /** False when the food was not recognized: the numbers are his to fill */
  known: boolean;
}

/** A line of a meal: one food, or one of a few ("עוף \\ סלמון \\ סינטה"); the first one counts */
export interface MenuItem extends MenuChoice {
  /** "ירקות חופשי": no limit */
  free?: boolean;
  /** What can replace it, as written */
  alts?: MenuChoice[];
}

/** One way to eat a meal: "1:", "2:", or a named one like "דגים" */
export interface MenuOption {
  label: string;
  items: MenuItem[];
  /** The same option belongs to another meal too ("אופציה ערב \\ צהרים") */
  shared?: boolean;
}

export interface MenuMeal {
  slot: SlotId;
  title: string;
  /** The meal's window, minutes after midnight, when the menu gives one */
  from?: number;
  to?: number;
  options: MenuOption[];
  /** The option he eats unless he picks another for the day */
  pick: number;
}

export interface MenuRules {
  /** "חובה לשתות 2.5 ליטר מים ביום" */
  waterL?: number;
  /** "2 כוסות מים לפני כל ארוחה" */
  cupsBefore?: number;
  useWater: boolean;
  useCups: boolean;
}

export interface DietMenu {
  v: 2;
  meals: MenuMeal[];
  /** Free additions: vegetables, cooked carbs, spreads; not counted in the day */
  extras: string[];
  /** Sandwich suggestions, instead of a meal */
  sandwiches: string[];
  rules: MenuRules;
  /** Lines that are not the menu: the clinic, the date, table headers, the fine print */
  ignored: string[];
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

/** One food (no alternatives) into numbers */
function parseChoice(raw: string, shown?: string, carry?: { qty: number; unit: Unit | 'exchange' | null } | null): MenuChoice {
  const first = normalize(raw);
  const text = (shown ?? raw).replace(/[‏‎]/g, '').replace(/\s+/g, ' ').trim();
  const amt = amountOf(first) ?? carry ?? null;
  // "2 מנות פחמימה": the exchange lists
  if (amt?.unit === 'exchange') {
    const x = EXCHANGES.find((e) => word(e.names).test(first));
    if (x) return { text, foodId: x.id, kcal: Math.round(x.kcal * amt.qty), protein: Math.round(x.protein * amt.qty * 10) / 10, known: true };
  }
  const f = foodIn(first);
  if (!f) return { text, kcal: 0, protein: 0, known: false };
  let grams = f.portion;
  if (amt) {
    if (amt.unit === 'gram') grams = amt.qty;
    else if (amt.unit && amt.unit !== 'exchange' && f.units[amt.unit]) grams = amt.qty * f.units[amt.unit]!;
    else if (!amt.unit && f.units.one) grams = amt.qty * f.units.one;
    else if (!amt.unit && f.units.slice) grams = amt.qty * f.units.slice;
    else grams = amt.qty * f.portion;
  }
  return { text, foodId: f.id, grams: Math.round(grams), kcal: Math.round((f.kcal * grams) / 100), protein: Math.round((f.protein * grams) / 10) / 10, known: true };
}

/** Alternatives in a line: "\", "/", "|" or "או". Not a fraction ("1/2" is already 0.5). */
const ALT_SPLIT = /\s*[\\|]\s*|\s*\/\s*|\s+או\s+/;

/**
 * One food line into numbers, with its alternatives: "בננה \ תפוח / 2 תמרים" is one line of three
 * choices. An amount written once at the start goes to every choice without its own:
 * "100 גרם אורז \ בטטה \ קינואה" is 100 grams of each.
 */
export function parseItem(raw: string, shown?: string): MenuItem {
  // Words that are not food: "חובה 3 סוגי ירק" is 3 vegetables
  const clean = (x: string) => x.replace(/(^|\s)(חובה|רק|גם)(?=\s|$)/g, ' ').trim();
  const parts = normalize(raw).split(ALT_SPLIT).map(clean).filter((x) => /[א-תa-zA-Z]/.test(x));
  const shownParts = (shown ?? raw).split(ALT_SPLIT).map(clean).filter((x) => /[א-תa-zA-Z]/.test(x));
  if (!parts.length) return { text: (shown ?? raw).trim(), kcal: 0, protein: 0, known: false };
  const free = /חופשי|ללא הגבלה|כמה שרוצים/.test(parts[0]);
  const carry = amountOf(parts[0]);
  const choices = parts.map((p, i) => parseChoice(p, shownParts.length === parts.length ? shownParts[i] : undefined, i ? carry : null));
  const [head, ...alts] = choices;
  return { ...head, free: free || undefined, alts: alts.length ? alts : undefined };
}

/** Which meal of the day a label names, given the meals already found */
function slotFor(h: string, found: SlotId[], from?: number): SlotId {
  if (/בוקר/.test(h)) return 'breakfast';
  if (/צהר/.test(h)) return 'lunch';
  if (/ערב/.test(h)) return 'dinner';
  if (/לילה|שינה/.test(h)) return 'night';
  if (/עשר/.test(h)) return 'snack_am';
  if (/מנחה|אחה|אחר הצהריים/.test(h)) return 'snack_pm';
  // Only a time: the hour says which meal
  if (from != null && !/ביניים|אימון/.test(h)) {
    const hr = from / 60;
    return hr < 10.5 ? 'breakfast' : hr < 12.5 ? 'snack_am' : hr < 16 ? 'lunch' : hr < 18.5 ? 'snack_pm' : hr < 21.5 ? 'dinner' : 'night';
  }
  // "ביניים", around a workout, or a numbered meal: the next free slot after the last one
  const order: SlotId[] = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'night'];
  const lastIdx = Math.max(-1, ...found.map((x) => order.indexOf(x)));
  if (/ביניים|אימון/.test(h)) return found.includes('lunch') ? 'snack_pm' : 'snack_am';
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
const ORDER: SlotId[] = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'night'];

/**
 * The foods of one option line: "+" and "," split foods; so does a new amount right after a food
 * ("ביצה קשה 4 פריכיות" is an egg and 4 rice cakes). Alternatives stay together.
 */
function piecesOf(line: string): string[] {
  const out: string[] = [];
  for (const chunk of line.split(/\s*[+,;]\s*|\s+עם\s+/)) {
    const c = chunk.trim();
    if (!/[א-תa-zA-Z]/.test(c)) continue;
    // Split before a number that follows a known food, unless it is part of an alternative
    const words = c.split(' ');
    let cur: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const before = cur.join(' ');
      const prevSep = /[\\/|]$/.test(before) || /^[\\/|]/.test(w) || cur[cur.length - 1] === 'או';
      if (cur.length && /^\d/.test(w) && !prevSep && foodIn(normalize(before)) && /[א-ת]/.test(words[i + 1] ?? '')) {
        out.push(before);
        cur = [];
      }
      cur.push(w);
    }
    if (cur.length) out.push(cur.join(' '));
  }
  return out.map((x) => x.replace(/^[:\s]+|[:\s]+$/g, '')).filter((x) => /[א-תa-zA-Z]/.test(x));
}

/** Looks like a dietitian's menu (meal headers and amounts), not a restaurant's */
export function looksLikeDiet(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => normalize(l.replace(/^[\s\-•*·●▪◦–—]+/, '')));
  const headers = lines.filter((l) => HEADER.test(l) && /ארוח|בוקר|צהר|ערב|ביניים/.test(l)).length;
  const amounts = lines.filter((l) => /(\d|חצי)\s*(גרם|כף|כפות|כפית|כוס|פרוס|יחיד|מנות|מנה|מנת|גביע|סוגי)/.test(l)).length;
  const options = lines.filter((l) => /^\d\s*:/.test(l)).length;
  return headers + options >= 2 && amounts >= 2;
}

// ---- Reading the page ----------------------------------------------------------------------------

/** Not the menu: the clinic, contact details, the date, table headers and the fine print */
const NOISE = /(www\.|@|https?:|טל[:׳'"]|\d{2,4}-\d{2,3}-\d{3,4}|רח['׳]|רחוב|תאריך|^יום\s*:|שעת ארוחה|תכולת הארוחה|מסמך זה|התוויה|רופא|הסמכה|רגישות|ריאקציה|בריאותכם|בריאותיות|ההליך|התהליך|המטפל|הניצחון|הבריאות שלך|יש לפעול|לפני יישום|^שם\s*:)/;
const TIME = /(\d{1,2})[.:](\d{2})\s*(?:-|–|עד)?\s*(\d{1,2})[.:](\d{2})/;
const MEAL_LABEL = /^(ארוחת\s+|ארוחה\s+)?(בוקר|ביניים|עשר|צהריים|צהרים|מנחה|אחה"צ|אחה״צ|אחר הצהריים|ערב|לילה|לפני השינה|לפני שינה|לפני אימון|אחרי אימון)$/;
const SHARED_LABEL = /^(אופציה|אפשרות)(\s+(ל|ב)?(ערב|צהריים|צהרים|בוקר)(\s*[\\/|,]\s*(ערב|צהריים|צהרים|בוקר))*)?$/;
const EXTRAS_LABEL = /^(תוספת|תוספות)(\s*\+?\s*(אופציות|אפשרויות))?$|^(אופציות|אפשרויות)$/;
const WATER_RULE = /(\d+(?:\.\d+)?)\s*ליטר/;
const CUPS_RULE = /(\d+|כוס)\s*(כוסות|כוס)?\s*מים/;
const SANDWICH_HEAD = /כריכ/;
const BREADS = /^(לחמים|לחם|מחמצת|שיפון|כוסמין|פיתת כוסמין|פיתה|פריכיות|טורטייה|לחמניה)(\s|$)/;

const toMin = (h: string, m: string) => Number(h) * 60 + Number(m);

type Label = { kind: 'meal'; slot?: SlotId; name: string; from?: number; to?: number } | { kind: 'shared'; slots: SlotId[]; name: string } | { kind: 'extras' };
type Block = { list: boolean; options: { label: string; lines: string[]; shown: string[] }[] };
type Seq = { label?: Label; block?: Block };

/** A line of foods separated by commas and slashes, no "+": the free list */
const isList = (l: string) => (l.match(/,/g) ?? []).length >= 3 && !/\+/.test(l) && !/^\d\s*:/.test(l);

/**
 * A dietitian's menu from its text. Works whether Lens read the table row by row (a label, then its
 * foods) or column by column (all the foods, then all the labels): labels and food blocks are found
 * apart and paired in order. "1:" and "2:" are options of one meal, "\" and "/" alternatives inside
 * a line, "+" foods eaten together.
 */
export function parseDiet(text: string, now = Date.now()): DietMenu {
  const rules: MenuRules = { useWater: true, useCups: true };
  const ignored: string[] = [];
  const extras: string[] = [];
  const sandwiches: string[] = [];
  const seq: Seq[] = [];
  let block: Block | null = null;
  let inSandwiches = false;
  let pendingTime: { from: number; to: number } | null = null;
  const raw = text.split(/\r?\n/).map((l) => l.replace(/[‏‎]/g, '').replace(/^[\s\-•*·●▪◦–—]+/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);

  const newBlock = (list = false) => {
    block = { list, options: [] };
    seq.push({ block });
    return block;
  };
  const addLine = (b: Block, line: string, shown: string, label?: string) => {
    if (label != null || !b.options.length) b.options.push({ label: label ?? '', lines: [], shown: [] });
    const o = b.options[b.options.length - 1];
    o.lines.push(line);
    o.shown.push(shown);
  };

  for (let i = 0; i < raw.length; i++) {
    const shown = raw[i];
    const line = normalize(shown);
    if (!/[א-תa-zA-Z]/.test(line) && !TIME.test(line)) continue;
    // Rules: water a day, cups before a meal
    if (/מים/.test(line) && (WATER_RULE.test(line) || (CUPS_RULE.test(line) && /לפני/.test(line))) && !foodIn(line.replace(/מים/g, ''))) {
      const w = line.match(WATER_RULE);
      if (w) rules.waterL = Number(w[1]);
      const c = line.match(CUPS_RULE);
      if (c && /לפני/.test(line)) rules.cupsBefore = Math.max(rules.cupsBefore ?? 0, c[1] === 'כוס' ? 1 : Number(c[1]));
      continue;
    }
    if (NOISE.test(line) || NOISE.test(shown) || (/^[A-Za-z\s.,'-]+$/.test(line) && !foodIn(line)) || (line.length > 70 && !foodIn(line))) {
      ignored.push(shown);
      continue;
    }
    if (SANDWICH_HEAD.test(line) && !foodIn(line)) {
      inSandwiches = true;
      block = null;
      continue;
    }
    if (inSandwiches) {
      // Bread kinds and "2 פרוסות למנה" are the bread; lines with foods are the fillings
      if (BREADS.test(line) && line.split(' ').length <= 5 && !/\+/.test(line)) continue;
      if (foodIn(line)) sandwiches.push(shown.replace(/\s+/g, ' '));
      else ignored.push(shown);
      continue;
    }
    // A time, maybe with the meal's name on the same line
    const tm = line.match(TIME);
    let rest = line;
    if (tm) {
      pendingTime = { from: toMin(tm[1], tm[2]), to: toMin(tm[3], tm[4]) };
      rest = line.replace(TIME, '').trim();
      if (!/[א-ת]/.test(rest)) {
        // A time alone: the label may come on the next line; if not, the time is the label
        const next = normalize(raw[i + 1] ?? '');
        if (!MEAL_LABEL.test(next.replace(/[:.]$/, ''))) {
          seq.push({ label: { kind: 'meal', name: '', ...pendingTime } });
          pendingTime = null;
        }
        continue;
      }
    }
    // A label: the meal's name, maybe "name: foods"
    const colon = rest.indexOf(':');
    const head = (colon >= 0 ? rest.slice(0, colon) : rest).trim().replace(/[.]$/, '');
    const after = colon >= 0 ? rest.slice(colon + 1).trim() : '';
    if (MEAL_LABEL.test(head) || (HEADER.test(head) && /ארוח/.test(head) && head.length <= 20)) {
      seq.push({ label: { kind: 'meal', name: head, ...(pendingTime ?? {}) } });
      pendingTime = null;
      block = null;
      if (after) addLine(newBlock(), after, shown.slice(shown.indexOf(':') + 1).trim());
      continue;
    }
    // "אופציה" alone, then "ערב \ צהרים" on the next line
    const two = `${head} ${normalize(raw[i + 1] ?? '')}`.trim();
    if (SHARED_LABEL.test(head) || (/^(אופציה|אפשרות)$/.test(head) && SHARED_LABEL.test(two))) {
      const full = SHARED_LABEL.test(two) && !SHARED_LABEL.test(head.replace(/^(אופציה|אפשרות)$/, '')) && /^(אופציה|אפשרות)$/.test(head) ? two : head;
      if (full === two) i++;
      const slots = [...new Set((full.match(/ערב|צהריים|צהרים|בוקר/g) ?? []).map((w) => slotFor(w, [])))];
      seq.push({ label: { kind: 'shared', slots, name: full } });
      block = null;
      continue;
    }
    if (/^(ערב|צהריים|צהרים)(\s*[\\/|]\s*(ערב|צהריים|צהרים))+$/.test(head)) {
      const lastLabel = [...seq].reverse().find((x) => x.label)?.label;
      if (lastLabel?.kind === 'shared') lastLabel.slots = [...new Set((head.match(/ערב|צהריים|צהרים/g) ?? []).map((w) => slotFor(w, [])))];
      continue;
    }
    if (EXTRAS_LABEL.test(head) && !after) {
      seq.push({ label: { kind: 'extras' } });
      block = null;
      continue;
    }
    // Food. A new block at "1:", a named option ("דגים :"), a list after foods, foods after a list,
    // or a line that the next line's "2:" shows is the first option of a new meal.
    const opt = line.match(/^(\d)\s*:\s*(.*)$/);
    const named = !opt && colon > 0 && colon <= 12 && /[א-ת]/.test(head) && !!foodIn(after) && !/^(אפשרויות|תוספת|תוספות)$/.test(head) ? head : null;
    const list = isList(line);
    const nextIsTwo = /^2\s*:/.test(normalize(raw[i + 1] ?? ''));
    const continues = block != null && (/^[+\\/|,]/.test(line) || /[+\\/|,]$/.test(normalize(raw[i - 1] ?? '')) || (line.split(' ').length <= 2 && !amountOf(line) && !opt && !named));
    let b = block as Block | null;
    // "או ..." opening a line: another way to eat the whole meal
    const orLine = line.match(/^או\s+(.+)$/);
    if (orLine && b && !b.list) {
      addLine(b, orLine[1], shown.replace(/^\s*או\s+/, ''), '');
      continue;
    }
    if (opt) {
      if (opt[1] === '1' || !b || b.list) b = newBlock();
      addLine(b, opt[2], shown.replace(/^\s*\d\s*:\s*/, ''), opt[1]);
      continue;
    }
    // A list goes on over its wrapped lines (slashes, no "+")
    if (list || (b?.list && !/\+/.test(line) && !!foodIn(line) && !opt)) {
      if (!b || !b.list) b = newBlock(true);
      addLine(b, line, shown);
      continue;
    }
    if (b && b.list && !continues) b = null;
    if (named) {
      b = newBlock();
      addLine(b, after, shown.slice(shown.indexOf(':') + 1).trim(), head);
      continue;
    }
    // The line right before a "2:" is option 1 of a new meal, unless it goes on option 1 of this one
    if (!continues && b && nextIsTwo && b.options[b.options.length - 1]?.label !== '1') b = null;
    if (!b) {
      if (!foodIn(line)) {
        ignored.push(shown);
        continue;
      }
      b = newBlock();
      addLine(b, line, shown, nextIsTwo ? '1' : undefined);
      continue;
    }
    // A wrapped line joins the line before it: "+אגוזי" then "מלך" is one food
    const o = b.options[b.options.length - 1];
    if (continues && o?.lines.length) {
      o.lines[o.lines.length - 1] += ' ' + line;
      o.shown[o.shown.length - 1] += ' ' + shown;
      continue;
    }
    // "אפשרויות: אפונה + ברוקולי + בטטה" lists choices for one food, not foods eaten together
    const choiceLine = /^(אפשרויות|אופציות)\s*:/.test(line);
    const strip = (x: string) => x.replace(/^(אפשרויות|אופציות|תוספת|תוספות)\s*:\s*/, '');
    addLine(b, choiceLine ? strip(line).replace(/\s*\+\s*/g, ' \\ ') : strip(line), choiceLine ? strip(shown).replace(/\s*\+\s*/g, ' / ') : strip(shown));
  }

  // Pair labels with food blocks. Row by row: each block takes the label before it. Column by
  // column (no label before the first block): in order, list blocks set aside as free additions.
  const labels = seq.filter((x) => x.label && x.label.kind !== 'extras').map((x) => x.label!) as Exclude<Label, { kind: 'extras' }>[];
  const blocks = seq.filter((x) => x.block).map((x) => x.block!);
  const firstBlock = seq.findIndex((x) => x.block);
  const rowWise = firstBlock > 0 && seq.slice(0, firstBlock).some((x) => x.label);
  const pairs: { label?: Exclude<Label, { kind: 'extras' }>; block: Block }[] = [];
  if (rowWise) {
    let last: Label | undefined;
    let lastMeal: Label | undefined;
    for (const x of seq) {
      if (x.label) {
        last = x.label;
        if (x.label.kind === 'meal') lastMeal = x.label;
      } else if (x.block) {
        if (x.block.list || last?.kind === 'extras') extras.push(...listItems(x.block));
        else pairs.push({ label: last as Exclude<Label, { kind: 'extras' }> | undefined, block: x.block });
        // A shared option takes one block; what follows belongs to the meal before it
        if (last?.kind === 'shared') last = lastMeal;
      }
    }
  } else {
    const mealBlocks = blocks.filter((b) => !b.list);
    blocks.filter((b) => b.list).forEach((b) => extras.push(...listItems(b)));
    mealBlocks.forEach((b, k) => pairs.push({ label: labels[k], block: b }));
  }

  const meals: MenuMeal[] = [];
  const mealFor = (slot: SlotId, l?: { from?: number; to?: number }) => {
    let m = meals.find((x) => x.slot === slot);
    if (!m) {
      m = { slot, title: SLOT_TITLE[slot], options: [], pick: 0, from: l?.from, to: l?.to };
      meals.push(m);
    }
    if (l?.from != null && m.from == null) Object.assign(m, { from: l.from, to: l.to });
    return m;
  };
  const shared: { slots: SlotId[]; options: MenuOption[] }[] = [];
  for (const { label, block: b } of pairs) {
    const options: MenuOption[] = b.options.map((o) => ({
      label: o.label,
      items: o.lines.flatMap((ln, k) => {
        const p = piecesOf(ln);
        const ps = piecesOf(o.shown[k] ?? ln);
        return p.map((x, j) => parseItem(x, ps.length === p.length ? ps[j] : undefined));
      }),
    }));
    if (label?.kind === 'shared') {
      options.forEach((o) => {
        o.shared = true;
        if (!o.label || /^\d$/.test(o.label)) o.label = t('אופציה', 'Option');
      });
      shared.push({ slots: label.slots.length ? label.slots : ['lunch', 'dinner'], options });
      continue;
    }
    const slot = slotFor(label?.name ?? '', meals.map((m) => m.slot), label?.kind === 'meal' ? label.from : undefined);
    mealFor(slot, label?.kind === 'meal' ? label : undefined).options.push(...options);
  }
  for (const s of shared) for (const slot of s.slots) mealFor(slot).options.push(...s.options);
  // Option labels for the screen: numbered ones keep their number, the rest their name
  for (const m of meals) {
    m.options = m.options.filter((o) => o.items.length);
    m.options.forEach((o, k) => {
      if (!o.label || /^\d$/.test(o.label)) o.label = t(`אפשרות ${k + 1}`, `Option ${k + 1}`);
    });
  }
  meals.sort((a, b) => ORDER.indexOf(a.slot) - ORDER.indexOf(b.slot));
  return { v: 2, meals: meals.filter((m) => m.options.length), extras: [...new Set(extras)], sandwiches, rules, ignored, text, createdAt: now };
}

/** Meal titles and plain option names in the app's language (the foods stay as the menu wrote them) */
export function localize(d: DietMenu): DietMenu {
  return {
    ...d,
    meals: d.meals.map((m) => ({
      ...m,
      title: SLOT_TITLE[m.slot] ?? m.title,
      options: m.options.map((o, k) => ({
        ...o,
        label: !o.label || /^(אפשרות|Option)\s*\d+$/.test(o.label) ? t(`אפשרות ${k + 1}`, `Option ${k + 1}`) : /^(אופציה|Option)$/.test(o.label) ? t('אופציה', 'Option') : o.label,
      })),
    })),
  };
}

/** The free list's foods, each on its own */
function listItems(b: Block): string[] {
  return b.options
    .flatMap((o) => o.shown.join(' ').split(/\s*[,/\\|]\s*|\s+או\s+/))
    .map((x) => x.replace(/[[\]()]/g, '').trim())
    .filter((x) => /[א-ת]/.test(x) && x.length <= 30);
}

/** A menu saved before options existed: each meal becomes one option */
export function upgradeMenu(m: any): DietMenu | null {
  if (!m) return null;
  if (m.v === 2) return localize(m as DietMenu);
  return {
    v: 2,
    meals: (m.meals ?? []).map((x: any) => ({
      slot: x.slot,
      title: x.title,
      pick: 0,
      options: [{ label: t('אפשרות 1', 'Option 1'), items: (x.items ?? []).map((it: any) => ({ ...it, alts: (it.alts ?? []).map((a: any) => (typeof a === 'string' ? parseChoice(a) : a)) })) }],
    })),
    extras: [],
    sandwiches: [],
    rules: { useWater: true, useCups: true },
    ignored: [],
    text: m.text ?? '',
    createdAt: m.createdAt ?? Date.now(),
  };
}

export const optionKcal = (o: MenuOption) => o.items.reduce((a, x) => a + (x.free ? 0 : x.kcal), 0);
export const optionProtein = (o: MenuOption) => o.items.reduce((a, x) => a + (x.free ? 0 : x.protein), 0);
const optionAt = (m: MenuMeal, pick?: number) => m.options[Math.min(m.options.length - 1, Math.max(0, pick ?? m.pick))];
export const mealKcal = (m: MenuMeal, pick?: number) => (m.options.length ? optionKcal(optionAt(m, pick)) : 0);
export const mealProtein = (m: MenuMeal, pick?: number) => (m.options.length ? optionProtein(optionAt(m, pick)) : 0);
export const pickedOption = optionAt;

/** The day by the picked option of each meal (or the defaults), and the range over every option */
export function menuTotals(d: DietMenu, picks: Partial<Record<SlotId, number>> = {}) {
  const kcal = d.meals.reduce((a, m) => a + mealKcal(m, picks[m.slot]), 0);
  const protein = Math.round(d.meals.reduce((a, m) => a + mealProtein(m, picks[m.slot]), 0));
  const lo = d.meals.reduce((a, m) => a + Math.min(...m.options.map(optionKcal)), 0);
  const hi = d.meals.reduce((a, m) => a + Math.max(...m.options.map(optionKcal)), 0);
  const unknown = d.meals.reduce((a, m) => a + m.options.reduce((b, o) => b + o.items.filter((x) => !x.known).length, 0), 0);
  return { kcal, protein, lo, hi, unknown };
}
