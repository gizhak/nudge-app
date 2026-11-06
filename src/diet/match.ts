// A meal's foods against a menu meal's options: which option it fits, item by item, any
// alternative counting. Pure, so the coach's rules can use it.
import { MenuChoice, MenuMeal, parseItem } from './parse';

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[׳'"״]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
// Words that say nothing about the food
const STOP = new Set(['עם', 'של', 'ללא', 'בלי', 'דל', 'שומן', 'גרם', 'כפות', 'כף', 'כוס', 'יחידות', 'סוגי', 'סוג', 'חצי', 'מנה', 'אפוי', 'אפויה', 'קשה', 'ירוקה', 'ירוק', 'and', 'with', 'of']);
const wordsOf = (s: string) =>
  norm(s)
    .split(' ')
    .filter((w) => w.length > 1 && !/^\d/.test(w) && !STOP.has(w))
    // Hebrew prefixes: "ובשר", "הסלט"
    .map((w) => (w.length > 3 ? w.replace(/^[והבלמש](?=[א-ת]{3})/, '') : w));

/** The choices of an item: the food and what can replace it */
const choicesOf = (it: { text: string; alts?: MenuChoice[] }) => [it.text, ...(it.alts ?? []).map((a) => a.text)];

export interface OptionMatch {
  option: number;
  /** Items of the option the meal has, by index */
  hit: boolean[];
  /** Share of the option's items found */
  score: number;
  /** What he ate instead of the first choice: "סלמון" for "עוף" */
  swaps: string[];
}

/** Which option of a meal some food names fit best, item by item (any alternative counts) */
export function matchOption(meal: MenuMeal, names: string[]): OptionMatch | null {
  const eaten = new Set(names.flatMap(wordsOf));
  // The kind of each food too: a salad counts for "2 סוגי ירק", rice for "פחמימה 100 גרם אורז"
  const kinds = new Set(names.flatMap((n) => n.split(/\s*[+,;]\s*|\s+עם\s+|\s+ו(?=[א-ת]{2})/)).map((n) => parseItem(n).foodId).filter(Boolean) as string[]);
  if (!eaten.size || !meal.options.length) return null;
  let best: OptionMatch | null = null;
  meal.options.forEach((o, k) => {
    const swaps: string[] = [];
    const hit = o.items.map((it) => {
      const ch = choicesOf(it);
      let at = ch.findIndex((c) => wordsOf(c).some((w) => eaten.has(w)));
      if (at < 0) {
        const ids = [it.foodId, ...(it.alts ?? []).map((a) => a.foodId)];
        at = ids.findIndex((id) => !!id && kinds.has(id));
      }
      if (at > 0) swaps.push(ch[at]);
      return at >= 0;
    });
    const counted = o.items.filter((it) => !it.free).length || 1;
    const score = hit.filter((h, i) => h && !o.items[i].free).length / counted;
    if (!best || score > best.score) best = { option: k, hit, score, swaps };
  });
  return best;
}
