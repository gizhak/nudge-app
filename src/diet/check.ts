// "What I'm going to eat": a few words, or what Zepp read from a photo, against the menu meal of
// this hour (or, without a menu, against what is left of the day). Before eating, while it can
// still change. Rule based like the rest: the food tables give the numbers.
import { caloriesFor, GOALS } from '../config/goals';
import { SlotId, SLOTS, slotOf } from '../nutrition/meals';
import { findFood } from '../nutrition/cravings';
import { t as tr } from '../i18n';
import { fits, matchOption, swapMeals } from './match';
import { DietMenu, MenuMeal, optionKcal, optionProtein, parseItem } from './parse';

export interface CheckRow {
  /** ✓ in the plan, + missing from it, ~ close, ½ take half, a number for the steps of a fix */
  mark: '✓' | '+' | '~' | '½' | '1' | '2' | '3';
  text: string;
  kcal?: number;
}

export interface CheckResult {
  verdict: 'on' | 'near' | 'off' | 'fits' | 'over' | 'ask';
  /** Another meal's food, and the menu does not say yet whether meals may trade places: ask */
  ask?: { from: SlotId; to: SlotId };
  /** "בתפריט", "לא בתפריט", "מתאים" */
  pill: string;
  /** "צהריים, אפשרות 1" or "בערך 560 קל'" */
  where?: string;
  headline: string;
  rows: CheckRow[];
  total?: string;
  note?: string;
}

/** Foods in free text: "סלמון עם אורז וסלט", "2 משולשי פיצה" */
export function foodsOf(text: string): string[] {
  return text
    .split(/\s*[+,;]\s*|\s+עם\s+|\s+ו(?=[א-ת]{2})|\s+and\s+|\s+with\s+/i)
    .map((x) => x.trim())
    .filter((x) => /[א-תa-zA-Z]/.test(x));
}

/** A food's calories and protein: the menu's food table first, then the snacks table */
export function estimate(food: string): { kcal: number; protein: number; known: boolean } {
  const it = parseItem(food);
  if (it.known) return { kcal: it.kcal, protein: it.protein, known: true };
  // "2 משולשי פיצה" is pizza: the count and the piece word off
  const hit = findFood(food.replace(/^\d+(\.\d+)?\s*/, '').replace(/^(משולשי|משולשים|משולש|פרוסות|פרוסת|פרוסה|חתיכות|חתיכת|חתיכה|כוסות|כוס|מנות|מנת|מנה|slices?|pieces?)\s+/i, ''))[0];
  if (hit) {
    const n = Number(food.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 1) || 1;
    return { kcal: Math.round(hit.kcal * n), protein: Math.round(hit.protein * n), known: true };
  }
  return { kcal: 0, protein: 0, known: false };
}

/** The meal this is for: the menu meal of this hour, or the next one within an hour and a half */
export function mealNow(menu: DietMenu | null, now: Date): { slot: SlotId; meal?: MenuMeal } {
  const m = now.getHours() * 60 + now.getMinutes();
  const slot = slotOf(now);
  if (!menu) return { slot };
  const inWindow = menu.meals.find((x) => x.from != null && x.to != null && m >= x.from - 30 && m <= x.to);
  if (inWindow) return { slot: inWindow.slot, meal: inWindow };
  const same = menu.meals.find((x) => x.slot === slot);
  if (same) return { slot, meal: same };
  const next = menu.meals.find((x) => x.from != null && x.from > m && x.from - m <= 90);
  return next ? { slot: next.slot, meal: next } : { slot };
}

const pretty = (x: string) => x.replace(/\s*[\\|/]\s*/g, ' / ');
const k = (n: number) => Math.round(n);

/**
 * The answer to "I'm going to eat X". `eaten` is today's calories so far; `logged` is the meal's own
 * numbers when it came from Zepp, which beat any estimate.
 */
export function checkFood(
  text: string,
  ctx: { menu: DietMenu | null; picks: Partial<Record<SlotId, number>>; now: Date; eatenKcal: number; eatenProtein: number; logged?: { kcal: number; protein: number } },
): CheckResult {
  const foods = foodsOf(text);
  const est = foods.map((f) => ({ f, ...estimate(f) }));
  const kcal = ctx.logged?.kcal ?? est.reduce((a, x) => a + x.kcal, 0);
  const protein = ctx.logged?.protein ?? est.reduce((a, x) => a + x.protein, 0);
  let { meal } = mealNow(ctx.menu, ctx.now);
  const left = caloriesFor(ctx.now) - ctx.eatenKcal;
  // Not this meal's food, but another meal's
  let other: MenuMeal | undefined;
  let swapped: MenuMeal | undefined;
  const cur = meal ? matchOption(meal, foods) : null;
  // Another meal is the better answer when this one does not fit, or fits only part of what he named
  if (ctx.menu && meal && (!fits(cur) || !cur.allIn)) {
    const partly = fits(cur);
    const best = ctx.menu.meals
      .filter((m) => m !== meal)
      .map((m) => ({ m, x: matchOption(m, foods) }))
      .filter((b) => fits(b.x) && (!partly || b.x.allIn))
      .sort((a, b) => b.x!.score - a.x!.score)[0];
    if (best) {
      const ORDER: SlotId[] = SLOTS.map((s) => s.id);
      const later = ORDER.indexOf(best.m.slot) > ORDER.indexOf(meal.slot);
      const MAIN: SlotId[] = ['breakfast', 'lunch', 'dinner'];
      if (later) {
        // He plans ahead: answer for that meal
        other = best.m;
        meal = best.m;
      } else if (swapMeals(ctx.menu, meal.slot).includes(best.m)) {
        swapped = meal;
        meal = best.m;
      } else if (!ctx.menu.swap && MAIN.includes(best.m.slot) && MAIN.includes(meal.slot)) {
        const from = best.m.title.replace(/^ארוחת\s+/, '');
        return {
          verdict: 'ask',
          ask: { from: best.m.slot, to: meal.slot },
          pill: tr('התפריט', 'The menu'),
          headline: tr(`זה מופיע אצלך ב${from}, ועכשיו ${meal.title}. המאמן שלך מרשה להחליף בין ארוחות?`, `This is on your ${best.m.title.toLowerCase()}, and now it is ${meal.title.toLowerCase()}. Does your coach let you swap meals?`),
          rows: [],
        };
      } else {
        // Not allowed: what this meal can be instead
        const rows: CheckRow[] = meal.options.slice(0, 3).map((o, i) => ({ mark: String(i + 1) as CheckRow['mark'], text: pretty(o.items.map((x) => x.text).join(', ')), kcal: optionKcal(o) }));
        return {
          verdict: 'off',
          pill: tr(`לא ב${meal.title.replace(/^ארוחת\s+/, '')}`, `Not at ${meal.title.toLowerCase()}`),
          where: kcal ? tr(`בערך ${k(kcal)} קל'`, `About ${k(kcal)} kcal`) : undefined,
          headline: tr(`זה מופיע אצלך רק ב${best.m.title.replace(/^ארוחת\s+/, '')}. ל${meal.title} בתפריט:`, `This is only on your ${best.m.title.toLowerCase()}. For ${meal.title.toLowerCase()} the menu has:`),
          rows,
          note: tr('אם בכל זאת: חצי מנה, עם סלט גדול מהתוספות החופשיות.', 'If you eat it anyway: half a portion, with a big salad from the free additions.'),
          total: tr(`נשארו היום ${k(Math.max(0, left))} קל'`, `${k(Math.max(0, left))} kcal left today`),
        };
      }
    }
  }

  if (meal && meal.options.length) {
    const match = matchOption(meal, foods);
    const mealName = meal.title.replace(/^ארוחת\s+/, '');
    if (fits(match)) {
      const o = meal.options[match.option];
      const rows: CheckRow[] = [];
      o.items.forEach((it, i) => {
        if (match.hit[i]) {
          const swapped = [it.text, ...(it.alts ?? []).map((a) => a.text)].find((c) => foods.some((f) => f.includes(c.split(' ').slice(-1)[0]) || c.includes(f.split(' ').slice(-1)[0])));
          const isSwap = swapped && swapped !== it.text;
          rows.push({ mark: '✓', text: isSwap ? tr(`${pretty(swapped!)}, במקום ${pretty(it.text)}`, `${pretty(swapped!)}, instead of ${pretty(it.text)}`) : pretty(it.text), kcal: it.kcal });
        } else if (!it.free) rows.push({ mark: '+', text: pretty([it.text, ...(it.alts ?? []).map((a) => a.text)].join(' / ')), kcal: it.kcal });
      });
      const missing = rows.filter((r) => r.mark === '+' && (r.kcal ?? 0) >= 60);
      const over = ctx.logged ? ctx.logged.kcal - optionKcal(o) : 0;
      return {
        verdict: missing.length || over > 150 ? 'near' : 'on',
        pill: tr('בתפריט', 'On the menu'),
        where: (meal.options.length > 1 ? `${mealName}, ${o.label}` : mealName) + (swapped ? tr(`, כ${swapped.title}`, `, as ${swapped.title.toLowerCase()}`) : ''),
        note: swapped
          ? tr(`במקום ${swapped.title}: ${k(optionKcal(o))} קל' מול ${k(optionKcal(swapped.options[Math.min(swapped.options.length - 1, ctx.picks[swapped.slot] ?? swapped.pick)]))} בתפריט.`, `Instead of ${swapped.title.toLowerCase()}: ${k(optionKcal(o))} kcal against ${k(optionKcal(swapped.options[Math.min(swapped.options.length - 1, ctx.picks[swapped.slot] ?? swapped.pick)]))} on the menu.`)
          : other ? tr(`זה מהתפריט של ${other.title}, לא של הארוחה של עכשיו.`, `This is from the ${other.title.toLowerCase()} menu, not this meal's.`) : undefined,
        headline: over > 150 ? tr(`בתפריט, אבל ${k(over)} קל' מעל. קח חצי מהפחמימה.`, `On the menu, but ${k(over)} kcal over. Take half the carbs.`) : missing.length ? tr(`כמעט. חסר: ${missing.map((r) => r.text.split(' / ')[0]).join(', ')}.`, `Almost. Missing: ${missing.map((r) => r.text.split(' / ')[0]).join(', ')}.`) : tr('מתאים לתפריט.', 'Fits the menu.'),
        rows,
        total: tr(`${missing.length ? 'עם מה שחסר' : 'סה"כ'}: ${k(optionKcal(o))} קל' · ${k(optionProtein(o))} ג' חלבון`, `${missing.length ? 'With what is missing' : 'Total'}: ${k(optionKcal(o))} kcal · ${k(optionProtein(o))} g protein`),
        ...(missing.some((r) => /אורז|בטטה|קינואה|בורגול|פחמימה|לחם|פריכיות|rice|bread/.test(r.text)) && !other ? { note: tr('בלי פחמימה תהיה רעב בעוד שעתיים.', 'Without carbs you will be hungry in two hours.') } : {}),
      };
    }
    // Not on the menu: how to eat it and stay on target
    const planned = optionKcal(meal.options[Math.min(meal.options.length - 1, ctx.picks[meal.slot] ?? meal.pick)]);
    const unknown = !kcal;
    const rows: CheckRow[] = [];
    const tooMuch = kcal > planned + 150;
    if (tooMuch) rows.push({ mark: '1', text: tr('חצי מנה', 'Half a portion'), kcal: Math.round(kcal / 2) });
    rows.push({ mark: tooMuch ? '2' : '1', text: tr('סלט גדול לפני, מהתוספות החופשיות', 'A big salad first, from the free additions'), kcal: 40 });
    const ORDER: SlotId[] = SLOTS.map((s) => s.id);
    const later = ctx.menu!.meals.filter((m) => ORDER.indexOf(m.slot) > ORDER.indexOf(meal.slot) && m.options.length > 1);
    for (const m of later) {
      const cur = Math.min(m.options.length - 1, ctx.picks[m.slot] ?? m.pick);
      const light = m.options.map((o, i) => ({ i, kc: optionKcal(o) })).sort((a, b) => a.kc - b.kc)[0];
      if (light.i !== cur && optionKcal(m.options[cur]) - light.kc >= 60) {
        rows.push({ mark: tooMuch ? '3' : '2', text: tr(`ב${m.title}: ${m.options[light.i].label}`, `${m.title}: ${m.options[light.i].label}`), kcal: light.kc });
        break;
      }
    }
    return {
      verdict: 'off',
      pill: tr('לא בתפריט', 'Not on the menu'),
      where: unknown ? undefined : tr(`בערך ${k(kcal)} קל'`, `About ${k(kcal)} kcal`),
      headline: unknown ? tr('לא מצאתי את זה בטבלאות. אם זה בכל זאת, ככה נשארים ביעד:', 'I could not find it in the tables. If you eat it anyway, this keeps you on target:') : tr('אפשר, בגרסה הזו:', 'You can, this way:'),
      rows,
      total: unknown ? undefined : tr(`נשארו היום ${k(Math.max(0, left))} קל'`, `${k(Math.max(0, left))} kcal left today`),
    };
  }

  // No menu: against what is left of the day
  const proteinLeft = GOALS.proteinG - ctx.eatenProtein;
  const rows: CheckRow[] = est.map((x) => ({ mark: x.known ? '✓' : '~', text: x.f, kcal: x.known ? x.kcal : undefined }));
  if (!kcal) return { verdict: 'off', pill: tr('לא מצאתי', 'Not found'), headline: tr('לא מצאתי את זה בטבלאות. כתוב בשמות פשוטים, למשל "חזה עוף, אורז, סלט".', 'I could not find it in the tables. Use plain names, like "chicken breast, rice, salad".'), rows };
  const over = kcal - left;
  return {
    verdict: over > 0 ? 'over' : 'fits',
    pill: over > 0 ? tr('מעל מה שנשאר', 'Over what is left') : tr('מתאים', 'Fits'),
    where: tr(`בערך ${k(kcal)} קל' · ${k(protein)} ג' חלבון`, `About ${k(kcal)} kcal · ${k(protein)} g protein`),
    headline: over > 0 ? tr(`זה ${k(over)} קל' יותר ממה שנשאר להיום. חצי מנה תשאיר אותך ביעד.`, `That is ${k(over)} kcal more than what is left today. Half a portion keeps you on target.`) : proteinLeft > 25 && protein < 20 ? tr(`מתאים. אבל חסרים לך עוד ${k(proteinLeft)} ג' חלבון היום, תוסיף משהו עם חלבון.`, `Fits. But you still need ${k(proteinLeft)} g of protein today, add something with protein.`) : tr('מתאים ליעד של היום.', 'Fits today\'s target.'),
    rows,
    total: tr(`נשארו היום ${k(Math.max(0, left))} קל'`, `${k(Math.max(0, left))} kcal left today`),
  };
}
