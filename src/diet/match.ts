// A meal's foods against a menu meal's options: which option it fits, item by item, any
// alternative counting. Pure, so the coach's rules can use it.
import { DietMenu, MenuChoice, MenuMeal, parseItem, SwapRule } from './parse';
import { slotOf, type SlotId } from '../nutrition/meals';

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
  /** Every food named is in the option: "סלמון" alone is part of the meal, not off it */
  allIn: boolean;
  /** By item: the food eaten in its place by the carb exchange ("לחם מלא" for "4 פריכיות") */
  instead: (string | undefined)[];
}

/** Starches a dietitian trades one for another at the same amount of carbs: bread for rice cakes */
const CARBS = new Set(['bread_light', 'bread', 'pita', 'tortilla', 'rice_cake', 'crackers', 'oats', 'cereal', 'rice', 'pasta', 'quinoa', 'buckwheat', 'bulgur', 'couscous', 'potato', 'sweet_potato', 'corn', 'x_carb']);

const splitFoods = (n: string) => n.split(/\s*[+,;]\s*|\s+עם\s+|\s+ו(?=[א-ת]{2})/);

/** Which option of a meal some food names fit best, item by item (any alternative counts) */
export function matchOption(meal: MenuMeal, names: string[]): OptionMatch | null {
  const foods = names.flatMap(splitFoods).map((n) => ({ name: n.trim(), words: new Set(wordsOf(n)), kind: parseItem(n).foodId })).filter((f) => f.words.size || f.kind);
  if (!foods.length || !meal.options.length) return null;
  let best: OptionMatch | null = null;
  meal.options.forEach((o, k) => {
    const swaps: string[] = [];
    const used = new Set<number>();
    const instead: (string | undefined)[] = [];
    const hit = o.items.map((it, ii) => {
      const ch = choicesOf(it);
      // The words first; the kind of food too: a salad counts for "2 סוגי ירק", rice for "פחמימה 100 גרם אורז"
      let at = -1;
      foods.forEach((f, fi) => {
        if (at >= 0) return;
        const w = ch.findIndex((c) => wordsOf(c).some((x) => f.words.has(x)));
        if (w >= 0) {
          at = w;
          used.add(fi);
        }
      });
      if (at < 0) {
        const ids = [it.foodId, ...(it.alts ?? []).map((a) => a.foodId)];
        foods.forEach((f, fi) => {
          if (at >= 0 || !f.kind) return;
          const w = ids.findIndex((id) => id === f.kind);
          if (w >= 0) {
            at = w;
            used.add(fi);
          }
        });
      }
      if (at < 0) {
        // The carb exchange: any starch for the starch on the menu
        const ids = [it.foodId, ...(it.alts ?? []).map((a) => a.foodId)];
        if (ids.some((id) => id && CARBS.has(id))) {
          const fi = foods.findIndex((f, k) => !used.has(k) && f.kind && CARBS.has(f.kind));
          if (fi >= 0) {
            used.add(fi);
            instead[ii] = foods[fi].name;
            swaps.push(foods[fi].name);
            return true;
          }
        }
      }
      if (at > 0) swaps.push(ch[at]);
      return at >= 0;
    });
    const counted = o.items.filter((it) => !it.free).length || 1;
    const score = hit.filter((h, i) => h && !o.items[i].free).length / counted;
    const allIn = used.size === foods.length && hit.some((h, i) => h && !o.items[i].free);
    const better = !best || score > best.score || (score === best.score && allIn && !best.allIn);
    if (better) best = { option: k, hit, score, swaps, allIn, instead };
  });
  return best;
}

/** The meal is this option: most of it, or everything he named is in it ("סלמון" for lunch) */
export const fits = (m: OptionMatch | null | undefined): m is OptionMatch => !!m && (m.score >= 0.5 || m.allIn);

const MAIN: SlotId[] = ['breakfast', 'lunch', 'dinner'];
/** The other meals this one may trade places with, by the menu's swap rule */
export function swapMeals(menu: DietMenu | null, slot: SlotId, rule: SwapRule | undefined = menu?.swap): MenuMeal[] {
  if (!menu || !rule || rule === 'none') return [];
  const pair: SlotId[] = rule === 'lunchDinner' ? ['lunch', 'dinner'] : MAIN;
  if (!pair.includes(slot)) return [];
  return menu.meals.filter((m) => m.slot !== slot && pair.includes(m.slot));
}


const minOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
/**
 * The meal a logged food belongs to, with a menu: inside a menu meal's hours it is that meal; up to an
 * hour after a menu meal that has nothing logged in its hours, it is that meal eaten late (breakfast at
 * 10:30 is still breakfast). Otherwise the usual slot by the clock.
 */
export function mealSlot(menu: DietMenu | null | undefined, time: Date, all: Date[] = []): SlotId {
  if (!menu) return slotOf(time);
  const m = minOf(time);
  const inside = (x: MenuMeal, t: number) => x.from != null && x.to != null && t >= x.from && t < x.to;
  const own = menu.meals.find((x) => inside(x, m));
  if (own) return own.slot;
  const late = menu.meals.find((x) => x.to != null && m >= x.to && m < x.to + 60 && !all.some((d) => inside(x, minOf(d))));
  return late ? late.slot : slotOf(time);
}
