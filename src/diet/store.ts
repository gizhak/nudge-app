// The saved menu, the option picked for each meal today, the targets that follow, and how a logged
// meal compares to the menu.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOALS, MENU_DAY, todayKey } from '../config/goals';
import { applyDerived, derive } from '../profile/derive';
import { loadProfile, saveProfile } from '../profile/profile';
import { SlotId, slotOf } from '../nutrition/meals';
import { DietMenu, SwapRule, mealKcal, mealProtein, MenuChoice, MenuMeal, MenuOption, menuTotals, optionKcal, optionProtein, pickedOption, upgradeMenu } from './parse';

import { t as tr } from '../i18n';
const KEY = 'diet.menu.v1';
const DAY_KEY = 'diet.day.v1';

export async function loadMenu(): Promise<DietMenu | null> {
  try {
    return upgradeMenu(JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null'));
  } catch {
    return null;
  }
}

/** Saves the menu and makes its default day the calories and protein, and its water rule the water */
export async function saveMenu(menu: DietMenu) {
  await AsyncStorage.setItem(KEY, JSON.stringify(menu));
  const t = menuTotals(menu);
  const profile = await loadProfile();
  const waterMl = menu.rules.useWater && menu.rules.waterL ? Math.round(menu.rules.waterL * 1000) : undefined;
  const next = { ...profile, menuTargets: { kcal: t.kcal, protein: t.protein, waterMl } };
  await saveProfile(next);
  MENU_DAY.date = '';
  applyDerived(derive(next));
  await applyMenuDay();
}

/** Back to the app's own targets */
export async function clearMenu() {
  await AsyncStorage.removeItem(KEY);
  await AsyncStorage.removeItem(DAY_KEY);
  MENU_DAY.date = '';
  const profile = await loadProfile();
  const { menuTargets: _drop, ...rest } = profile;
  await saveProfile(rest);
  applyDerived(derive(rest));
}

// ---- The day: which option of each meal ------------------------------------------------------

type Picks = Partial<Record<SlotId, number>>;

/** Today's picks; another day's picks are forgotten, so a new day starts from the menu's defaults */
export async function todayPicks(now = new Date()): Promise<Picks> {
  try {
    const d = JSON.parse((await AsyncStorage.getItem(DAY_KEY)) ?? 'null');
    return d && d.date === todayKey(now) ? d.picks ?? {} : {};
  } catch {
    return {};
  }
}

/** Puts today's picks into today's targets (or clears them when they are the defaults) */
export async function applyMenuDay(now = new Date()) {
  const menu = await loadMenu();
  if (!menu) return;
  const picks = await todayPicks(now);
  const def = menuTotals(menu);
  const day = menuTotals(menu, picks);
  if (day.kcal === def.kcal && day.protein === def.protein) {
    if (MENU_DAY.date) {
      MENU_DAY.date = '';
      applyDerived(derive(await loadProfile()));
    }
    return;
  }
  Object.assign(MENU_DAY, { date: todayKey(now), kcal: day.kcal, protein: day.protein });
  GOALS.calories = Math.round(day.kcal / 25) * 25;
  GOALS.proteinG = Math.round(day.protein / 5) * 5;
}

/** Another option for a meal: today only, or from now on (the menu's default changes) */
export async function setPick(slot: SlotId, option: number, always: boolean, now = new Date()) {
  const menu = await loadMenu();
  if (!menu) return;
  if (always) {
    const m = menu.meals.find((x) => x.slot === slot);
    if (m) m.pick = option;
    await saveMenu(menu);
  }
  const picks = await todayPicks(now);
  if (always) delete picks[slot];
  else picks[slot] = option;
  await AsyncStorage.setItem(DAY_KEY, JSON.stringify({ date: todayKey(now), picks }));
  await applyMenuDay(now);
}

/** Sets the swap rule (from the menu screen or the coach's question) */
export async function setSwap(rule: SwapRule) {
  const menu = await loadMenu();
  if (!menu) return;
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...menu, swap: rule }));
}

export const menuMealOf = (menu: DietMenu | null, slot: SlotId): MenuMeal | undefined => menu?.meals.find((m) => m.slot === slot);

// ---- A logged meal against the menu --------------------------------------------------------------

export { matchOption } from './match';
export type { OptionMatch } from './match';
import { fits, mealSlot, matchOption, swapMeals } from './match';
export { swapMeals };

export interface MealCheck {
  chip: string;
  tone: 'good' | 'off' | 'later' | 'none';
  /** What the menu says for this meal today, short */
  plan: string;
  /** The option the logged meal fits, when it is not the one picked */
  fits?: number;
}

const planText = (o: MenuOption) => o.items.map((x) => x.text).join(', ');

/**
 * A meal against its menu meal: on plan (any option, any alternative), off by how much, skipped,
 * or still to come. `names` are the logged foods' names.
 */
export function checkMeal(m: MenuMeal, eaten: { kcal: number; protein: number; count: number; names?: string[] }, state: 'past' | 'now' | 'future', pick?: number, others: MenuMeal[] = []): MealCheck {
  const opt = pickedOption(m, pick);
  const plan = `${m.options.length > 1 ? `${opt.label}: ` : ''}${planText(opt)}`;
  if (!eaten.count) return state === 'past' ? { chip: tr('לא נרשמה', 'Not logged'), tone: 'off', plan } : { chip: tr('בהמשך', 'Later'), tone: 'later', plan };
  let match = eaten.names?.length ? matchOption(m, eaten.names) : null;
  // Another meal's food, where the menu lets meals trade places: measured against that meal
  if (!fits(match) && eaten.names?.length) {
    for (const o of others) {
      const x = matchOption(o, eaten.names);
      if (fits(x)) {
        const t = o.options[x.option];
        const over = eaten.kcal - optionKcal(t);
        const from = o.title.replace(/^ארוחת\s+/, '');
        if (over > Math.max(120, optionKcal(t) * 0.25)) return { chip: tr(`${Math.round(over)} מעל`, `${Math.round(over)} over`), tone: 'off', plan };
        return { chip: tr(`לפי התפריט, מה${from}`, `By the menu, from ${o.title.toLowerCase()}`), tone: 'good', plan };
      }
    }
  }
  const target = fits(match) ? m.options[match.option] : opt;
  const kcal = optionKcal(target);
  const protein = optionProtein(target);
  const fitsOpt = fits(match) && match.option !== (pick ?? m.pick) ? match.option : undefined;
  // A coffee in the meal's hours is not the meal yet, while its window is still open
  if (state !== 'past' && eaten.kcal < kcal * 0.35) {
    const what = (eaten.names?.[0] ?? '').split(/[,،]/)[0].trim().split(/\s+/).slice(0, 2).join(' ');
    return { chip: what && what.length <= 18 ? tr(`בינתיים ${what}`, `So far ${what}`) : tr('בינתיים משהו קטן', 'So far something small'), tone: 'later', plan };
  }
  const over = eaten.kcal - kcal;
  // While its hours are open, part of the meal so far is on the way, not short
  if (state !== 'past' && fits(match) && match.score < 1 && over <= Math.max(120, kcal * 0.25)) return { chip: tr('בינתיים לפי התפריט', 'On the menu so far'), tone: 'good', plan, fits: fitsOpt };
  if (over > Math.max(120, kcal * 0.25)) return { chip: tr(`${Math.round(over)} מעל`, `${Math.round(over)} over`), tone: 'off', plan, fits: fitsOpt };
  if (protein >= 10 && eaten.protein < protein * 0.75) return { chip: tr(`חסרים ${Math.round(protein - eaten.protein)} ג' חלבון`, `${Math.round(protein - eaten.protein)} g protein missing`), tone: 'off', plan, fits: fitsOpt };
  if (state === 'past' && eaten.kcal < kcal * 0.5) return { chip: tr('פחות מהתפריט', 'Less than the menu'), tone: 'off', plan, fits: fitsOpt };
  if (match && match.score < 0.34 && !match.allIn && eaten.names?.length) return { chip: tr('לא בתפריט', 'Not on the menu'), tone: 'off', plan };
  return { chip: tr('לפי התפריט', 'By the menu'), tone: 'good', plan, fits: fitsOpt };
}

export interface MealLeft {
  /** ✓ eaten, + still to eat */
  rows: { mark: '✓' | '+'; text: string; kcal: number }[];
  /** "2 סוגי ירק, ביצה קשה, 4 פריכיות" */
  short: string;
  leftKcal: number;
  totalKcal: number;
  totalProtein: number;
}

const CARB_IDS = new Set(['bread_light', 'bread', 'pita', 'tortilla', 'rice_cake', 'crackers', 'oats', 'cereal', 'rice', 'pasta', 'quinoa', 'buckwheat', 'bulgur', 'couscous', 'potato', 'sweet_potato', 'corn', 'x_carb']);

/**
 * What is left of a meal while its hours are open: the option he is eating (the one his food fits, or
 * today's pick), item by item, eaten or still to eat.
 */
export function mealLeft(m: MenuMeal, names: string[], pick?: number): MealLeft | null {
  const match = names.length ? matchOption(m, names) : null;
  const k = fits(match) ? match.option : Math.min(m.options.length - 1, pick ?? m.pick);
  const o = m.options[k];
  if (!o) return null;
  const rows: MealLeft['rows'] = [];
  o.items.forEach((it, i) => {
    const ate = fits(match) && match.option === k && match.hit[i];
    if (ate) rows.push({ mark: '✓', text: tr(`${match.instead[i] ?? it.text}, אכלת`, `${match.instead[i] ?? it.text}, eaten`), kcal: it.kcal });
    else if (!it.free) {
      const alt = it.alts?.[0]?.text;
      const carb = [it.foodId, ...(it.alts ?? []).map((a) => a.foodId)].some((id) => id && CARB_IDS.has(id));
      const text = alt ? tr(`${it.text}, או ${alt}`, `${it.text}, or ${alt}`) : carb ? tr(`${it.text}, או פחמימה אחרת`, `${it.text}, or another starch`) : it.text;
      rows.push({ mark: '+', text, kcal: it.kcal });
    }
  });
  const plus = rows.filter((r) => r.mark === '+');
  if (!plus.length) return null;
  return {
    rows,
    short: o.items.filter((it, i) => !it.free && !(fits(match) && match.option === k && match.hit[i])).map((it) => it.text).join(', '),
    leftKcal: plus.reduce((a, r) => a + r.kcal, 0),
    totalKcal: optionKcal(o),
    totalProtein: optionProtein(o),
  };
}

/** The lightest option of a later meal, when something off the menu took its room */
export function lighterOption(m: MenuMeal, pick?: number): { option: number; kcal: number } | null {
  const cur = mealKcal(m, pick);
  let best: { option: number; kcal: number } | null = null;
  m.options.forEach((o, k) => {
    const kc = optionKcal(o);
    if (kc < cur - 60 && (!best || kc < best.kcal)) best = { option: k, kcal: kc };
  });
  return best;
}

export { mealKcal, mealProtein };

/**
 * A logged meal that fits another option than the one picked becomes today's pick, without asking:
 * he ate the fish instead of the chicken, so the day's targets follow the fish.
 */
export async function adoptEatenOptions(menu: DietMenu, picks: Picks, meals: { name: string; time: Date }[], now = new Date()): Promise<Picks> {
  let changed = false;
  const next = { ...picks };
  for (const m of menu.meals) {
    const names = meals.filter((x) => mealSlot(menu, x.time, meals.map((y) => y.time)) === m.slot).map((x) => x.name);
    if (!names.length || m.options.length < 2) continue;
    const match = matchOption(m, names);
    const cur = next[m.slot] ?? m.pick;
    if (match && match.score >= 0.5 && match.option !== cur) {
      next[m.slot] = match.option;
      changed = true;
    }
  }
  if (changed) {
    await AsyncStorage.setItem(DAY_KEY, JSON.stringify({ date: todayKey(now), picks: next }));
    await applyMenuDay(now);
  }
  return next;
}

/** "By the menu today: 4 of 5 meals." for the day's summary */
export function menuDayLine(menu: DietMenu, picks: Picks, meals: { name: string; time: Date; kcal: number; protein: number }[]): string {
  let on = 0;
  for (const m of menu.meals) {
    const inSlot = meals.filter((x) => mealSlot(menu, x.time, meals.map((y) => y.time)) === m.slot);
    if (!inSlot.length) continue;
    const c = checkMeal(m, { kcal: inSlot.reduce((a, x) => a + x.kcal, 0), protein: inSlot.reduce((a, x) => a + x.protein, 0), count: inSlot.length, names: inSlot.map((x) => x.name) }, 'past', picks[m.slot], swapMeals(menu, m.slot));
    if (c.tone === 'good') on++;
  }
  return tr(`היום לפי התפריט: ${on} מתוך ${menu.meals.length} ארוחות.`, `By the menu today: ${on} of ${menu.meals.length} meals.`);
}
